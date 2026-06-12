const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeRoute(r) {
  return {
    id: r.id.toString(), organizationId: r.organizationId.toString(),
    keyword: r.keyword, matchType: r.matchType, action: r.action,
    targetUserId: r.targetUserId?.toString() ?? null,
    autoReplyText: r.autoReplyText, priority: r.priority,
    isActive: r.isActive, createdAt: r.createdAt,
  };
}

function serializeMenu(m) {
  return {
    id: m.id.toString(), organizationId: m.organizationId.toString(),
    name: m.name, lineRichMenuId: m.lineRichMenuId,
    triggerCondition: m.triggerCondition, menuImageUrl: m.menuImageUrl,
    menuConfig: m.menuConfig, isDefault: m.isDefault, isActive: m.isActive, createdAt: m.createdAt,
  };
}

function serializeBroadcast(b) {
  return {
    id: b.id.toString(), organizationId: b.organizationId.toString(),
    name: b.name, segmentCriteria: b.segmentCriteria,
    messageContent: b.messageContent, status: b.status,
    scheduledAt: b.scheduledAt, sentAt: b.sentAt,
    totalRecipients: b.totalRecipients, sentCount: b.sentCount,
    failedCount: b.failedCount, readCount: b.readCount,
    createdAt: b.createdAt,
  };
}

// ── Chat Routes ───────────────────────────────────────────────────────────────

const listChatRoutes = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const items = await prisma.chatRoute.findMany({
      where: { organizationId: orgId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return success(res, items.map(serializeRoute));
  } catch (err) {
    console.error('[MessagingController.listChatRoutes]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch chat routes', 500);
  }
};

const createChatRoute = async (req, res) => {
  const { keyword, matchType = 'CONTAINS', action, targetUserId, autoReplyText, priority = 0 } = req.body;
  if (!keyword || !action) return failure(res, 'VALIDATION_ERROR', 'keyword and action required', 400);
  try {
    const item = await prisma.chatRoute.create({
      data: {
        organizationId: BigInt(req.user.organizationId), keyword, matchType, action,
        targetUserId: targetUserId ? BigInt(targetUserId) : undefined,
        autoReplyText, priority,
      },
    });
    return success(res, serializeRoute(item), 201);
  } catch (err) {
    console.error('[MessagingController.createChatRoute]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create chat route', 500);
  }
};

const updateChatRoute = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const item = await prisma.chatRoute.update({ where: { id }, data: req.body });
    return success(res, serializeRoute(item));
  } catch (err) {
    console.error('[MessagingController.updateChatRoute]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update chat route', 500);
  }
};

const deleteChatRoute = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    await prisma.chatRoute.delete({ where: { id } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[MessagingController.deleteChatRoute]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete chat route', 500);
  }
};

// ── Rich Menus ────────────────────────────────────────────────────────────────

const listRichMenus = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  try {
    const items = await prisma.richMenuConfig.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, items.map(serializeMenu));
  } catch (err) {
    console.error('[MessagingController.listRichMenus]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch rich menus', 500);
  }
};

const upsertRichMenu = async (req, res) => {
  const { id, name, triggerCondition, menuImageUrl, menuConfig, isDefault = false } = req.body;
  const orgId = BigInt(req.user.organizationId);
  try {
    let item;
    if (id) {
      item = await prisma.richMenuConfig.update({
        where: { id: BigInt(id) },
        data: { name, triggerCondition, menuImageUrl, menuConfig, isDefault },
      });
    } else {
      item = await prisma.richMenuConfig.create({
        data: { organizationId: orgId, name, triggerCondition, menuImageUrl, menuConfig, isDefault },
      });
    }
    return success(res, serializeMenu(item), id ? 200 : 201);
  } catch (err) {
    console.error('[MessagingController.upsertRichMenu]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to save rich menu', 500);
  }
};

const deployRichMenu = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const menu = await prisma.richMenuConfig.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!menu) return failure(res, 'NOT_FOUND', 'Rich menu not found', 404);
    // In production: call LINE Messaging API to set rich menu
    // For now: mark as deployed with a placeholder lineRichMenuId
    const updated = await prisma.richMenuConfig.update({
      where: { id },
      data: { lineRichMenuId: `richmenu-${id}`, isActive: true },
    });
    return success(res, { ...serializeMenu(updated), deployed: true });
  } catch (err) {
    console.error('[MessagingController.deployRichMenu]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to deploy rich menu', 500);
  }
};

const deleteRichMenu = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    await prisma.richMenuConfig.update({ where: { id }, data: { isActive: false } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[MessagingController.deleteRichMenu]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete rich menu', 500);
  }
};

// ── Broadcast Campaigns ───────────────────────────────────────────────────────

const listBroadcasts = async (req, res) => {
  const { status, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);
  const where   = { organizationId: orgId, ...(status ? { status } : {}) };
  try {
    const [items, total] = await prisma.$transaction([
      prisma.broadcastCampaign.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum, orderBy: { createdAt: 'desc' } }),
      prisma.broadcastCampaign.count({ where }),
    ]);
    return paginated(res, items.map(serializeBroadcast), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[MessagingController.listBroadcasts]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch broadcasts', 500);
  }
};

const createBroadcast = async (req, res) => {
  const { name, segmentCriteria, messageContent, scheduledAt } = req.body;
  if (!name || !messageContent) return failure(res, 'VALIDATION_ERROR', 'name and messageContent required', 400);
  try {
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        organizationId: BigInt(req.user.organizationId),
        name, segmentCriteria, messageContent,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        createdBy: BigInt(req.user.id),
      },
    });
    return success(res, serializeBroadcast(campaign), 201);
  } catch (err) {
    console.error('[MessagingController.createBroadcast]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create broadcast', 500);
  }
};

const updateBroadcast = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const { scheduledAt, ...rest } = req.body;
    const campaign = await prisma.broadcastCampaign.update({
      where: { id },
      data: { ...rest, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}) },
    });
    return success(res, serializeBroadcast(campaign));
  } catch (err) {
    console.error('[MessagingController.updateBroadcast]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update broadcast', 500);
  }
};

const sendBroadcast = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);

  try {
    const campaign = await prisma.broadcastCampaign.findFirst({
      where: { id, organizationId: orgId, status: 'DRAFT' },
    });
    if (!campaign) return failure(res, 'NOT_FOUND', 'Campaign not found or already sent', 404);

    // Build recipient list based on segmentCriteria
    const criteria = campaign.segmentCriteria ?? {};
    const where = {
      organizationId: orgId,
      status: 'ACTIVE',
      ...(criteria.minAge ? { age: { gte: criteria.minAge } } : {}),
      ...(criteria.maxAge ? { age: { lte: criteria.maxAge } } : {}),
    };
    const patients = await prisma.elderly.findMany({
      where,
      select: { id: true, lineUserId: true },
    });

    // Create recipient records
    if (patients.length > 0) {
      await prisma.broadcastRecipient.createMany({
        data: patients.map((p) => ({
          campaignId: id,
          elderlyId:  p.id,
          lineUserId: p.lineUserId,
          status:     'PENDING',
        })),
      });
    }

    // Update campaign status
    const updated = await prisma.broadcastCampaign.update({
      where: { id },
      data: { status: 'SENDING', totalRecipients: patients.length, sentAt: new Date() },
    });

    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'broadcast_campaigns', recordId: id, req });
    return success(res, { ...serializeBroadcast(updated), recipientCount: patients.length });
  } catch (err) {
    console.error('[MessagingController.sendBroadcast]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to send broadcast', 500);
  }
};

const broadcastStats = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const [campaign, stats] = await Promise.all([
      prisma.broadcastCampaign.findFirst({ where: { id, organizationId: BigInt(req.user.organizationId) } }),
      prisma.broadcastRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: true }),
    ]);
    if (!campaign) return failure(res, 'NOT_FOUND', 'Campaign not found', 404);
    const statMap = Object.fromEntries(stats.map((s) => [s.status, s._count]));
    return success(res, {
      ...serializeBroadcast(campaign),
      deliveryStats: {
        PENDING: statMap.PENDING ?? 0,
        SENT:    statMap.SENT    ?? 0,
        FAILED:  statMap.FAILED  ?? 0,
        READ:    statMap.READ    ?? 0,
      },
    });
  } catch (err) {
    console.error('[MessagingController.broadcastStats]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch broadcast stats', 500);
  }
};

module.exports = {
  listChatRoutes, createChatRoute, updateChatRoute, deleteChatRoute,
  listRichMenus, upsertRichMenu, deployRichMenu, deleteRichMenu,
  listBroadcasts, createBroadcast, updateBroadcast, sendBroadcast, broadcastStats,
};
