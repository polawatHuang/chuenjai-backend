/**
 * LINE Webhook Controller
 *
 * POST /webhook/line — receives LINE platform events for any registered LINE OA.
 * Now persists messages to LineConversation / LineMessage for the inbox feature.
 */

'use strict';

const crypto = require('crypto');
const prisma  = require('../config/prisma');

function verifySignature(rawBody, channelSecret, signature) {
  if (!channelSecret || !signature) return false;
  try {
    const hmac = crypto.createHmac('sha256', channelSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Upsert conversation + append message ─────────────────────────────────────

async function persistIncomingMessage(orgId, lineUserId, text, lineMessageId) {
  const orgBigInt = BigInt(orgId);

  // Find linked elderly (if any)
  const elderly = await prisma.elderly.findFirst({
    where: { organizationId: orgBigInt, lineUserId },
    select: { id: true, firstName: true, lastName: true },
  });

  // Upsert conversation thread
  const conv = await prisma.lineConversation.upsert({
    where: { organizationId_lineUserId: { organizationId: orgBigInt, lineUserId } },
    update: {
      lastMessageAt:   new Date(),
      lastMessageText: text.slice(0, 500),
      unreadCount:     { increment: 1 },
      ...(elderly ? { elderlyId: elderly.id } : {}),
    },
    create: {
      organizationId:  orgBigInt,
      lineUserId,
      elderlyId:       elderly?.id ?? null,
      displayName:     elderly ? `${elderly.firstName ?? ''} ${elderly.lastName ?? ''}`.trim() : null,
      lastMessageAt:   new Date(),
      lastMessageText: text.slice(0, 500),
      unreadCount:     1,
      status:          'OPEN',
    },
  });

  // Append message record
  await prisma.lineMessage.create({
    data: {
      conversationId: conv.id,
      direction:      'IN',
      messageType:    'text',
      content:        text,
      lineMessageId:  lineMessageId ?? null,
      isRead:         false,
    },
  });

  return conv;
}

async function persistFollowEvent(orgId, lineUserId) {
  const orgBigInt = BigInt(orgId);
  const elderly = await prisma.elderly.findFirst({
    where: { organizationId: orgBigInt, lineUserId },
    select: { id: true, firstName: true, lastName: true },
  });

  await prisma.lineConversation.upsert({
    where: { organizationId_lineUserId: { organizationId: orgBigInt, lineUserId } },
    update: { status: 'OPEN' },
    create: {
      organizationId:  orgBigInt,
      lineUserId,
      elderlyId:       elderly?.id ?? null,
      displayName:     elderly ? `${elderly.firstName ?? ''} ${elderly.lastName ?? ''}`.trim() : null,
      lastMessageText: '[เพิ่งเพิ่มเพื่อน]',
      lastMessageAt:   new Date(),
      status:          'OPEN',
    },
  });

  const followConv = await prisma.lineConversation.findUnique({
    where: { organizationId_lineUserId: { organizationId: orgBigInt, lineUserId } },
  });
  if (followConv) {
    await prisma.lineMessage.create({
      data: {
        conversationId: followConv.id,
        direction:      'IN',
        messageType:    'event',
        content:        '[เพิ่ม LINE OA เป็นเพื่อน]',
        isRead:         false,
      },
    });
  }
}

// ── Event dispatcher ─────────────────────────────────────────────────────────

async function handleEvent(event, orgId) {
  const type       = event.type;
  const lineUserId = event.source?.userId;

  if (!lineUserId) return;

  try {
    if (type === 'message' && event.message?.type === 'text') {
      await persistIncomingMessage(orgId, lineUserId, event.message.text, event.message.id);

      // Chat Route auto-reply
      await processChatRoute(orgId, lineUserId, event.message.text, event.replyToken);
    } else if (type === 'follow') {
      await persistFollowEvent(orgId, lineUserId);
    } else if (type === 'unfollow') {
      await prisma.lineConversation.updateMany({
        where: { organizationId: BigInt(orgId), lineUserId },
        data:  { status: 'RESOLVED' },
      });
    }
  } catch (err) {
    console.error(`[LINE Webhook] handleEvent error org=${orgId} type=${type}`, err);
  }
}

// ── Chat Route auto-reply ────────────────────────────────────────────────────

async function processChatRoute(orgId, lineUserId, text, replyToken) {
  if (!replyToken) return;

  const routes = await prisma.chatRoute.findMany({
    where: { organizationId: BigInt(orgId), isActive: true, action: 'AUTO_REPLY' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  const matched = routes.find(r => {
    const kw = r.keyword.toLowerCase();
    const msg = text.toLowerCase();
    if (r.matchType === 'EXACT')       return msg === kw;
    if (r.matchType === 'STARTS_WITH') return msg.startsWith(kw);
    return msg.includes(kw); // CONTAINS (default)
  });

  if (!matched?.autoReplyText) return;

  // Get channelAccessToken for this org
  const integration = await prisma.integration.findFirst({
    where: { organizationId: BigInt(orgId), integrationType: 'LINE', isActive: true },
  });
  const token = integration?.configuration?.channelAccessToken;
  if (!token) return;

  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text: matched.autoReplyText }],
      }),
    });

    // Record the auto-reply as an OUT message
    const conv = await prisma.lineConversation.findUnique({
      where: { organizationId_lineUserId: { organizationId: BigInt(orgId), lineUserId } },
    });
    if (conv) {
      await prisma.lineMessage.create({
        data: {
          conversationId: conv.id,
          direction:      'OUT',
          messageType:    'text',
          content:        matched.autoReplyText,
          isRead:         true,
        },
      });
      await prisma.lineConversation.update({
        where: { id: conv.id },
        data:  { lastMessageAt: new Date(), lastMessageText: `[Auto] ${matched.autoReplyText.slice(0, 100)}` },
      });
    }
  } catch (err) {
    console.error('[LINE Webhook] Auto-reply send error:', err);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

async function handleLineWebhook(req, res) {
  const signature = req.headers['x-line-signature'];
  const rawBody   = req.rawBody ?? '';

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  let matchedIntegration = null;
  try {
    const rows = await prisma.integration.findMany({
      where: { integrationType: 'LINE', isActive: true },
    });
    for (const row of rows) {
      const secret = row.configuration?.channelSecret;
      if (secret && verifySignature(rawBody, secret, signature)) {
        matchedIntegration = row;
        break;
      }
    }
  } catch (err) {
    console.error('[LINE Webhook] DB lookup error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }

  if (!matchedIntegration) {
    console.warn('[LINE Webhook] No matching LINE integration for incoming webhook');
    return res.status(200).json({ status: 'ignored' });
  }

  const orgId = matchedIntegration.organizationId.toString();

  try {
    await prisma.integrationLog.create({
      data: {
        integrationId:   matchedIntegration.id,
        requestPayload:  body,
        responsePayload: { status: 'received' },
        status:          'SUCCESS',
      },
    });
  } catch (err) {
    console.error('[LINE Webhook] Log write error:', err);
  }

  const events = body.events ?? [];
  await Promise.allSettled(events.map(event => handleEvent(event, orgId)));

  return res.status(200).json({ status: 'ok' });
}

module.exports = { handleLineWebhook };
