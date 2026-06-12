const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serialize(ec) {
  return {
    id:            ec.id.toString(),
    elderlyId:     ec.elderlyId.toString(),
    contactName:   ec.contactName,
    relationship:  ec.relationship,
    phone:         ec.phone,
    priorityOrder: ec.priorityOrder,
    createdAt:     ec.createdAt,
  };
}

const list = async (req, res) => {
  const { elderlyId } = req.query;
  if (!elderlyId) return failure(res, 'VALIDATION_ERROR', 'elderlyId required', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const elderly = await prisma.elderly.findFirst({ where: { id: BigInt(elderlyId), organizationId: orgId }, select: { id: true } });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);
    const items = await prisma.emergencyContact.findMany({ where: { elderlyId: BigInt(elderlyId) }, orderBy: { priorityOrder: 'asc' } });
    return success(res, items.map(serialize));
  } catch (err) {
    console.error('[EmergencyContactController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch emergency contacts', 500);
  }
};

const create = async (req, res) => {
  const { elderlyId, contactName, relationship, phone, priorityOrder = 1 } = req.body;
  if (!elderlyId || !contactName) return failure(res, 'VALIDATION_ERROR', 'elderlyId and contactName required', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const elderly = await prisma.elderly.findFirst({ where: { id: BigInt(elderlyId), organizationId: orgId }, select: { id: true } });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Patient not found', 404);
    const item = await prisma.emergencyContact.create({
      data: { elderlyId: BigInt(elderlyId), contactName, relationship, phone, priorityOrder: parseInt(priorityOrder, 10) || 1 },
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[EmergencyContactController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create emergency contact', 500);
  }
};

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const existing = await prisma.emergencyContact.findFirst({
      where: { id },
      include: { elderly: { select: { organizationId: true } } },
    });
    if (!existing || existing.elderly.organizationId !== orgId) return failure(res, 'NOT_FOUND', 'Emergency contact not found', 404);
    const { elderlyId, ...data } = req.body;
    if (data.priorityOrder) data.priorityOrder = parseInt(data.priorityOrder, 10);
    const item = await prisma.emergencyContact.update({ where: { id }, data });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[EmergencyContactController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update emergency contact', 500);
  }
};

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  const orgId = BigInt(req.user.organizationId);
  try {
    const existing = await prisma.emergencyContact.findFirst({
      where: { id },
      include: { elderly: { select: { organizationId: true } } },
    });
    if (!existing || existing.elderly.organizationId !== orgId) return failure(res, 'NOT_FOUND', 'Emergency contact not found', 404);
    await prisma.emergencyContact.delete({ where: { id } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[EmergencyContactController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete emergency contact', 500);
  }
};

module.exports = { list, create, update, remove };
