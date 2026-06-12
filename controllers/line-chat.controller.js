'use strict';

const prisma  = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeConv(c) {
  return {
    id:              c.id.toString(),
    lineUserId:      c.lineUserId,
    elderlyId:       c.elderlyId?.toString() ?? null,
    displayName:     c.displayName ?? c.elderly?.firstName
                       ? `${c.elderly?.firstName ?? ''} ${c.elderly?.lastName ?? ''}`.trim()
                       : c.displayName ?? c.lineUserId,
    pictureUrl:      c.pictureUrl ?? null,
    lastMessageAt:   c.lastMessageAt,
    lastMessageText: c.lastMessageText ?? '',
    unreadCount:     c.unreadCount,
    status:          c.status,
    assignedToId:    c.assignedToId?.toString() ?? null,
    elderly: c.elderly ? {
      id:        c.elderly.id.toString(),
      firstName: c.elderly.firstName,
      lastName:  c.elderly.lastName,
      phone:     c.elderly.phone ?? null,
    } : null,
  };
}

function serializeMsg(m) {
  return {
    id:            m.id.toString(),
    direction:     m.direction,
    messageType:   m.messageType,
    content:       m.content,
    lineMessageId: m.lineMessageId ?? null,
    sentByUserId:  m.sentByUserId?.toString() ?? null,
    isRead:        m.isRead,
    createdAt:     m.createdAt,
  };
}

// ── GET /api/v1/line-chat/conversations ───────────────────────────────────────

const listConversations = async (req, res) => {
  const { status, page = '1', limit = '30', search } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum= Math.min(100, parseInt(limit) || 30);

  const where = {
    organizationId: orgId,
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { displayName:     { contains: search } },
        { lineUserId:      { contains: search } },
        { lastMessageText: { contains: search } },
        { elderly: { OR: [
          { firstName: { contains: search } },
          { lastName:  { contains: search } },
        ]}},
      ],
    } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.lineConversation.findMany({
        where,
        skip:    (pageNum - 1) * limitNum,
        take:    limitNum,
        orderBy: { lastMessageAt: 'desc' },
        include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      prisma.lineConversation.count({ where }),
    ]);

    return paginated(res, items.map(serializeConv), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[LineChatController.listConversations]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to list conversations', 500);
  }
};

// ── GET /api/v1/line-chat/conversations/:id/messages ─────────────────────────

const getMessages = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const { page = '1', limit = '50' } = req.query;
  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(200, parseInt(limit) || 50);

  try {
    const conv = await prisma.lineConversation.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!conv) return failure(res, 'NOT_FOUND', 'Conversation not found', 404);

    const [messages, total] = await prisma.$transaction([
      prisma.lineMessage.findMany({
        where:   { conversationId: id },
        orderBy: { createdAt: 'asc' },
        skip:    (pageNum - 1) * limitNum,
        take:    limitNum,
      }),
      prisma.lineMessage.count({ where: { conversationId: id } }),
    ]);

    // Auto-mark all IN messages as read
    await prisma.lineMessage.updateMany({
      where: { conversationId: id, direction: 'IN', isRead: false },
      data:  { isRead: true },
    });
    await prisma.lineConversation.update({
      where: { id },
      data:  { unreadCount: 0 },
    });

    return paginated(res, messages.map(serializeMsg), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[LineChatController.getMessages]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to get messages', 500);
  }
};

// ── POST /api/v1/line-chat/conversations/:id/reply ────────────────────────────

const sendReply = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const { text } = req.body;
  if (!text?.trim()) return failure(res, 'VALIDATION_ERROR', 'text is required', 400);

  const orgId = BigInt(req.user.organizationId);

  try {
    const conv = await prisma.lineConversation.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!conv) return failure(res, 'NOT_FOUND', 'Conversation not found', 404);

    // Get LINE channel access token
    const integration = await prisma.integration.findFirst({
      where: { organizationId: orgId, integrationType: 'LINE', isActive: true },
    });
    const token = integration?.configuration?.channelAccessToken;

    let lineSent = false;
    if (token) {
      const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to:       conv.lineUserId,
          messages: [{ type: 'text', text: text.trim() }],
        }),
      });
      lineSent = lineRes.ok;
      if (!lineRes.ok) {
        const errBody = await lineRes.json().catch(() => ({}));
        console.warn('[LineChatController.sendReply] LINE push error:', errBody);
      }
    } else {
      console.warn('[LineChatController.sendReply] No LINE channel access token for org:', orgId.toString());
    }

    // Persist OUT message regardless of LINE send status (for dev without integration)
    const msg = await prisma.lineMessage.create({
      data: {
        conversationId: conv.id,
        direction:      'OUT',
        messageType:    'text',
        content:        text.trim(),
        sentByUserId:   BigInt(req.user.id),
        isRead:         true,
      },
    });

    await prisma.lineConversation.update({
      where: { id },
      data:  { lastMessageAt: new Date(), lastMessageText: text.trim().slice(0, 500) },
    });

    return success(res, { ...serializeMsg(msg), lineSent });
  } catch (err) {
    console.error('[LineChatController.sendReply]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to send reply', 500);
  }
};

// ── PATCH /api/v1/line-chat/conversations/:id/status ─────────────────────────

const updateStatus = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const { status } = req.body;
  if (!['OPEN', 'RESOLVED'].includes(status)) {
    return failure(res, 'VALIDATION_ERROR', 'status must be OPEN or RESOLVED', 400);
  }

  try {
    const conv = await prisma.lineConversation.update({
      where: { id },
      data:  { status },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    return success(res, serializeConv(conv));
  } catch (err) {
    console.error('[LineChatController.updateStatus]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update status', 500);
  }
};

// ── GET /api/v1/line-chat/stats ───────────────────────────────────────────────

const getStats = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const [open, resolved, unreadTotal] = await prisma.$transaction([
      prisma.lineConversation.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      prisma.lineConversation.count({ where: { organizationId: orgId, status: 'RESOLVED' } }),
      prisma.lineConversation.aggregate({ where: { organizationId: orgId }, _sum: { unreadCount: true } }),
    ]);
    return success(res, {
      open,
      resolved,
      totalUnread: unreadTotal._sum.unreadCount ?? 0,
    });
  } catch (err) {
    console.error('[LineChatController.getStats]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to get stats', 500);
  }
};

module.exports = { listConversations, getMessages, sendReply, updateStatus, getStats };
