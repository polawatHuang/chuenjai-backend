/**
 * LINE Webhook Controller
 *
 * POST /webhook/line  — receives LINE platform events for any registered LINE OA
 *
 * LINE sends a POST with:
 *   - Header X-Line-Signature: Base64(HMAC-SHA256(rawBody, channelSecret))
 *   - Body: { destination, events: [...] }
 *
 * We verify the signature against every active LINE integration until one matches,
 * then process the events for that org. This is the correct approach because the
 * settings page stores channelSecret but not the bot userId / channelId.
 */

'use strict';

const crypto = require('crypto');
const prisma  = require('../config/prisma');

// ── Signature verification ────────────────────────────────────────────────────

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

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleEvent(event, orgId) {
  const type = event.type;

  if (type === 'message' && event.message?.type === 'text') {
    console.log(`[LINE] org=${orgId} message from=${event.source?.userId} text="${event.message.text}"`);
  } else if (type === 'follow') {
    console.log(`[LINE] org=${orgId} follow userId=${event.source?.userId}`);
  } else if (type === 'unfollow') {
    console.log(`[LINE] org=${orgId} unfollow userId=${event.source?.userId}`);
  } else {
    console.log(`[LINE] org=${orgId} event type=${type}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleLineWebhook(req, res) {
  const signature = req.headers['x-line-signature'];
  const rawBody   = req.rawBody ?? '';

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Find which org this webhook belongs to by trying each active LINE integration
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
    // Return 200 to prevent LINE from retrying — unknown channel or bad signature
    console.warn('[LINE Webhook] No matching LINE integration for incoming webhook');
    return res.status(200).json({ status: 'ignored' });
  }

  const orgId = matchedIntegration.organizationId.toString();

  // Log the incoming webhook
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
    // Non-fatal — continue processing
  }

  // Process events
  const events = body.events ?? [];
  await Promise.allSettled(events.map(event => handleEvent(event, orgId)));

  return res.status(200).json({ status: 'ok' });
}

module.exports = { handleLineWebhook };
