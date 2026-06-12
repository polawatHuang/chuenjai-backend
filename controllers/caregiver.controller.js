const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serialize(c) {
  return {
    id:           c.id.toString(),
    elderlyId:    c.elderlyId.toString(),
    fullName:     c.fullName,
    relationship: c.relationship,
    phone:        c.phone,
    lineUserId:   c.lineUserId,
    email:        c.email,
    isPrimary:    c.isPrimary,
    createdAt:    c.createdAt,
  };
}

const list = async (req, res) => {
  const { elderlyId } = req.query;
  if (!elderlyId) return failure(res, 'VALIDATION_ERROR', 'elderlyId required', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const elderly = await prisma.elderly.findFirst({ where: { id: BigInt(elderlyId), organizationId: orgId }, select: { id: true } });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);
    const items = await prisma.caregiver.findMany({ where: { elderlyId: BigInt(elderlyId) }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    return success(res, items.map(serialize));
  } catch (err) {
    console.error('[CaregiverController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch caregivers', 500);
  }
};

const create = async (req, res) => {
  const { elderlyId, fullName, relationship, phone, lineUserId, email, isPrimary } = req.body;
  if (!elderlyId) return failure(res, 'VALIDATION_ERROR', 'elderlyId required', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const elderly = await prisma.elderly.findFirst({ where: { id: BigInt(elderlyId), organizationId: orgId }, select: { id: true } });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);
    if (isPrimary) {
      await prisma.caregiver.updateMany({ where: { elderlyId: BigInt(elderlyId) }, data: { isPrimary: false } });
    }
    const item = await prisma.caregiver.create({
      data: { elderlyId: BigInt(elderlyId), fullName, relationship, phone, lineUserId, email, isPrimary: !!isPrimary },
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[CaregiverController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create caregiver', 500);
  }
};

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const existing = await prisma.caregiver.findFirst({
      where: { id },
      include: { elderly: { select: { organizationId: true } } },
    });
    if (!existing || existing.elderly.organizationId !== orgId) return failure(res, 'NOT_FOUND', 'Caregiver not found', 404);
    const { elderlyId, ...data } = req.body;
    if (data.isPrimary) {
      await prisma.caregiver.updateMany({ where: { elderlyId: existing.elderlyId }, data: { isPrimary: false } });
    }
    const item = await prisma.caregiver.update({ where: { id }, data });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[CaregiverController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update caregiver', 500);
  }
};

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const existing = await prisma.caregiver.findFirst({
      where: { id },
      include: { elderly: { select: { organizationId: true } } },
    });
    if (!existing || existing.elderly.organizationId !== orgId) return failure(res, 'NOT_FOUND', 'Caregiver not found', 404);
    await prisma.caregiver.delete({ where: { id } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[CaregiverController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete caregiver', 500);
  }
};

module.exports = { list, create, update, remove };
