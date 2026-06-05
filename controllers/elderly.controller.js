const { z }    = require('zod');
const prisma   = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

// ── Validation ────────────────────────────────────────────────────────────────

const elderlySchema = z.object({
  citizenId:     z.string().max(20).optional(),
  firstName:     z.string().max(255).optional(),
  lastName:      z.string().max(255).optional(),
  gender:        z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthDate:     z.string().optional(),
  age:           z.number().int().nonnegative().optional(),
  phone:         z.string().max(50).optional(),
  lineUserId:    z.string().max(255).optional(),
  address:       z.string().optional(),
  latitude:      z.number().optional(),
  longitude:     z.number().optional(),
  bloodType:     z.string().max(5).optional(),
  weight:        z.number().positive().optional(),
  height:        z.number().positive().optional(),
  status:        z.enum(['ACTIVE', 'INACTIVE', 'DECEASED']).optional(),
  caregiverName: z.string().max(255).optional(),
  caregiverPhone:z.string().max(50).optional(),
});

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/elderlies
 * Paginated list with optional keyword search and status filter.
 * AP-01: scoped to req.user.organizationId.
 */
const list = async (req, res) => {
  const { keyword, status, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip    = (pageNum - 1) * limitNum;

  const where = {
    organizationId: orgId,
    ...(status  ? { status }  : {}),
    ...(keyword ? {
      OR: [
        { firstName: { contains: keyword } },
        { lastName:  { contains: keyword } },
        { citizenId: { contains: keyword } },
        { phone:     { contains: keyword } },
      ],
    } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.elderly.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, citizenId: true, firstName: true, lastName: true,
          gender: true, birthDate: true, age: true, phone: true,
          latitude: true, longitude: true,
          status: true, caregiverName: true, createdAt: true,
        },
      }),
      prisma.elderly.count({ where }),
    ]);

    return paginated(res, items, { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[ElderlyController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch elderlies', 500);
  }
};

/**
 * GET /api/v1/elderlies/:id
 * Full profile including active medications, diseases, caregivers, emergency contacts.
 */
const getById = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const elderly = await prisma.elderly.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
      include: {
        diseases:          { orderBy: { createdAt: 'desc' } },
        medications:       { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        caregivers:        { orderBy: { isPrimary: 'desc' } },
        emergencyContacts: { orderBy: { priorityOrder: 'asc' } },
      },
    });

    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    return success(res, elderly);
  } catch (err) {
    console.error('[ElderlyController.getById]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch elderly', 500);
  }
};

/**
 * POST /api/v1/elderlies
 */
const create = async (req, res) => {
  const parsed = elderlySchema.safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  const orgId  = BigInt(req.user.organizationId);
  const userId = BigInt(req.user.id);

  try {
    const elderly = await prisma.elderly.create({
      data: {
        ...parsed.data,
        organizationId: orgId,
        createdBy:      userId,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined,
      },
    });

    await createAuditLog({
      userId, action: 'CREATE', tableName: 'elderlies',
      recordId: elderly.id, newData: parsed.data, req,
    });

    return success(res, elderly, 201);
  } catch (err) {
    if (err.code === 'P2002') {
      return failure(res, 'DUPLICATE_CITIZEN_ID', 'Citizen ID already exists', 409);
    }
    console.error('[ElderlyController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create elderly', 500);
  }
};

/**
 * PUT /api/v1/elderlies/:id
 */
const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const parsed = elderlySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);
  }

  try {
    const existing = await prisma.elderly.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const updated = await prisma.elderly.update({
      where: { id },
      data: {
        ...parsed.data,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined,
      },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'elderlies',
      recordId: id, oldData: existing, newData: parsed.data, req,
    });

    return success(res, updated);
  } catch (err) {
    if (err.code === 'P2002') {
      return failure(res, 'DUPLICATE_CITIZEN_ID', 'Citizen ID already exists', 409);
    }
    console.error('[ElderlyController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update elderly', 500);
  }
};

/**
 * DELETE /api/v1/elderlies/:id
 */
const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.elderly.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId) },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    await prisma.elderly.delete({ where: { id } });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'DELETE', tableName: 'elderlies',
      recordId: id, oldData: existing, req,
    });

    return success(res, { message: 'Elderly deleted successfully' });
  } catch (err) {
    console.error('[ElderlyController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete elderly', 500);
  }
};

/**
 * POST /api/v1/elderlies/import
 *
 * Accepts an .xlsx / .xls file via multipart/form-data field "file".
 * Parses each row, normalises Thai/English column headers, and bulk-inserts
 * into the current organization.  Duplicate citizen IDs are skipped (not fatal).
 */
const importExcel = async (req, res) => {
  if (!req.file) {
    return failure(res, 'VALIDATION_ERROR', 'Excel file is required (field: file)', 400);
  }

  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    return failure(
      res, 'DEPENDENCY_MISSING',
      'xlsx package is not installed. Run: npm install xlsx',
      500
    );
  }

  const orgId  = BigInt(req.user.organizationId);
  const userId = BigInt(req.user.id);

  const COL_MAP = {
    'รหัสบัตรประชาชน': 'citizenId', citizen_id: 'citizenId',  citizenId: 'citizenId',
    'ชื่อ':            'firstName',  first_name: 'firstName',   firstName: 'firstName',
    'นามสกุล':         'lastName',   last_name:  'lastName',    lastName:  'lastName',
    'เพศ':             'gender',     gender:     'gender',
    'วันเกิด':          'birthDate',  birth_date: 'birthDate',   birthDate: 'birthDate',
    'อายุ':            'age',        age:        'age',
    'เบอร์โทร':         'phone',      phone:      'phone',
    'ที่อยู่':           'address',    address:    'address',
    'กรุ๊ปเลือด':       'bloodType',  blood_type: 'bloodType',  bloodType: 'bloodType',
    'น้ำหนัก':          'weight',     weight:     'weight',
    'ส่วนสูง':          'height',     height:     'height',
  };

  const GENDER_MAP = {
    'ชาย': 'MALE',   male: 'MALE',   MALE: 'MALE',   M: 'MALE',
    'หญิง': 'FEMALE', female: 'FEMALE', FEMALE: 'FEMALE', F: 'FEMALE',
    'อื่นๆ': 'OTHER', other: 'OTHER', OTHER: 'OTHER',
  };

  try {
    const wb    = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!rows.length) {
      return failure(res, 'EMPTY_FILE', 'Excel file contains no data rows', 400);
    }

    const results = { total: rows.length, created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i];
      const data = {};

      for (const [col, field] of Object.entries(COL_MAP)) {
        if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
          data[field] = row[col];
        }
      }

      if (!data.firstName && !data.citizenId) {
        results.errors.push({ row: i + 2, reason: 'Missing firstName and citizenId — row skipped' });
        results.skipped++;
        continue;
      }

      if (data.gender)    data.gender    = GENDER_MAP[data.gender] ?? undefined;
      if (data.birthDate) data.birthDate = isValidDate(data.birthDate) ? new Date(data.birthDate) : undefined;
      if (data.age)       data.age       = parseInt(data.age, 10) || undefined;
      if (data.weight)    data.weight    = parseFloat(data.weight) || undefined;
      if (data.height)    data.height    = parseFloat(data.height) || undefined;
      if (data.citizenId) data.citizenId = String(data.citizenId).trim();

      try {
        await prisma.elderly.create({
          data: { ...data, organizationId: orgId, createdBy: userId },
        });
        results.created++;
      } catch (rowErr) {
        const reason = rowErr.code === 'P2002'
          ? `Duplicate citizen ID: ${data.citizenId}`
          : rowErr.message;
        results.errors.push({ row: i + 2, citizenId: data.citizenId ?? null, reason });
        results.skipped++;
      }
    }

    return success(res, results);
  } catch (err) {
    console.error('[ElderlyController.importExcel]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to process Excel file', 500);
  }
};

function isValidDate(val) {
  if (!val) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

module.exports = { list, getById, create, update, remove, importExcel };
