const prisma = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serialize(i) {
  return {
    id: i.id.toString(), organizationId: i.organizationId.toString(),
    oemIngredientId: i.oemIngredientId, name: i.name, category: i.category,
    unit: i.unit, minDoseMg: i.minDoseMg ? parseFloat(i.minDoseMg) : null,
    maxDoseMg: i.maxDoseMg ? parseFloat(i.maxDoseMg) : null,
    contraindications: i.contraindications, description: i.description,
    isActive: i.isActive, createdAt: i.createdAt,
  };
}

const list = async (req, res) => {
  const { search, category, page = '1', limit = '50' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(200, parseInt(limit, 10) || 50);

  const where = {
    organizationId: orgId,
    isActive: true,
    ...(search   ? { name: { contains: search } } : {}),
    ...(category ? { category }                   : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.ingredient.findMany({ where, skip: (pageNum - 1) * limitNum, take: limitNum, orderBy: { name: 'asc' } }),
      prisma.ingredient.count({ where }),
    ]);
    return paginated(res, items.map(serialize), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[IngredientController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch ingredients', 500);
  }
};

const create = async (req, res) => {
  const { name, category, unit = 'mg', oemIngredientId, minDoseMg, maxDoseMg, contraindications, description } = req.body;
  if (!name) return failure(res, 'VALIDATION_ERROR', 'name is required', 400);
  try {
    const item = await prisma.ingredient.create({
      data: { organizationId: BigInt(req.user.organizationId), name, category, unit, oemIngredientId, minDoseMg, maxDoseMg, contraindications, description },
    });
    return success(res, serialize(item), 201);
  } catch (err) {
    console.error('[IngredientController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create ingredient', 500);
  }
};

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    const item = await prisma.ingredient.update({ where: { id }, data: req.body });
    return success(res, serialize(item));
  } catch (err) {
    console.error('[IngredientController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update ingredient', 500);
  }
};

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);
  try {
    await prisma.ingredient.update({ where: { id }, data: { isActive: false } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[IngredientController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to remove ingredient', 500);
  }
};

module.exports = { list, create, update, remove };
