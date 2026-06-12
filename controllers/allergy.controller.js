const prisma = require('../config/prisma');
const { success, failure } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serialize(a) {
  return { id: a.id.toString(), elderlyId: a.elderlyId.toString(), allergen: a.allergen, severity: a.severity, reaction: a.reaction, notes: a.notes, isActive: a.isActive, createdAt: a.createdAt };
}

const list = async (req, res) => {
  const { elderlyId } = req.query;
  const orgId = BigInt(req.user.organizationId);
  const where = {
    elderly: { organizationId: orgId },
    isActive: true,
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) } : {}),
  };
  try {
    const items = await prisma.patientAllergy.findMany({ where, orderBy: { severity: 'asc' } });
    return success(res, items.map(serialize));
  } catch (err) {
    console.error('[AllergyController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch allergies', 500);
  }
};

const create = async (req, res) => {
  const { elderlyId, allergen, severity, reaction, notes } = req.body;
  if (!elderlyId || !allergen || !severity) return failure(res, 'VALIDATION_ERROR', 'elderlyId, allergen, severity required', 400);
  try {
    const item = await prisma.patientAllergy.create({
      data: { elderlyId: BigInt(elderlyId), allergen, severity, reaction, notes },
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[AllergyController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create allergy', 500);
  }
};

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const item = await prisma.patientAllergy.update({ where: { id }, data: req.body });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[AllergyController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update allergy', 500);
  }
};

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    await prisma.patientAllergy.update({ where: { id }, data: { isActive: false } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[AllergyController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to remove allergy', 500);
  }
};

module.exports = { list, create, update, remove };
