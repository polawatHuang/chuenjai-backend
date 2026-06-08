const { z }    = require('zod');
const prisma   = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

const createSchema = z.object({
  elderlyId:           z.string().regex(/^\d+$/),
  hospitalName:        z.string().max(255).optional(),
  department:          z.string().max(255).optional(),
  doctorName:          z.string().max(255).optional(),
  appointmentDatetime: z.string().datetime({ offset: true }),
  purpose:             z.string().optional(),
  status:              z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED']).optional(),
});

const updateSchema = z.object({
  hospitalName:        z.string().max(255).optional(),
  department:          z.string().max(255).optional(),
  doctorName:          z.string().max(255).optional(),
  appointmentDatetime: z.string().datetime({ offset: true }).optional(),
  purpose:             z.string().optional(),
  status:              z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED']).optional(),
});

function serializeAppt(a) {
  return {
    id:                  a.id.toString(),
    elderlyId:           a.elderlyId.toString(),
    elderlyName:         `${a.elderly?.firstName ?? ''} ${a.elderly?.lastName ?? ''}`.trim(),
    elderlyPhone:        a.elderly?.phone ?? null,
    hospitalName:        a.hospitalName,
    department:          a.department,
    doctorName:          a.doctorName,
    appointmentDatetime: a.appointmentDatetime,
    purpose:             a.purpose,
    status:              a.status,
    createdAt:           a.createdAt,
  };
}

// ── GET /api/v1/appointments ──────────────────────────────────────────────────

const list = async (req, res) => {
  const { status, elderlyId, startDate, endDate, page = '1', limit = '20' } = req.query;
  const orgId   = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum= Math.min(100, parseInt(limit, 10) || 20);
  const skip    = (pageNum - 1) * limitNum;

  const where = {
    elderly: { organizationId: orgId },
    ...(status    ? { status }                                          : {}),
    ...(elderlyId ? { elderlyId: BigInt(elderlyId) }                   : {}),
    ...((startDate || endDate) ? {
      appointmentDatetime: {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      },
    } : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { appointmentDatetime: 'asc' },
        include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      prisma.appointment.count({ where }),
    ]);

    return paginated(res, items.map(serializeAppt), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[AppointmentController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch appointments', 500);
  }
};

// ── GET /api/v1/appointments/summary ─────────────────────────────────────────

const summary = async (req, res) => {
  const orgId = BigInt(req.user.organizationId);
  const now   = new Date();

  const todayStart    = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd      = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd   = new Date(todayEnd);   tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const thirtyDaysAgo = new Date(now);        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd      = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const nextMonthEnd  = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

  try {
    const [todayAppts, tomorrowAppts, missedAppts, last30d, calMonthAppts] =
      await Promise.all([
        prisma.appointment.findMany({
          where: {
            elderly: { organizationId: orgId },
            appointmentDatetime: { gte: todayStart, lte: todayEnd },
          },
          include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
          orderBy: { appointmentDatetime: 'asc' },
        }),

        prisma.appointment.findMany({
          where: {
            elderly: { organizationId: orgId },
            appointmentDatetime: { gte: tomorrowStart, lte: tomorrowEnd },
          },
          include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
          orderBy: { appointmentDatetime: 'asc' },
        }),

        prisma.appointment.findMany({
          where: {
            elderly: { organizationId: orgId },
            status: 'MISSED',
            appointmentDatetime: { gte: thirtyDaysAgo, lt: todayStart },
          },
          include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
          orderBy: { appointmentDatetime: 'desc' },
          take: 20,
        }),

        prisma.appointment.findMany({
          where: {
            elderly: { organizationId: orgId },
            appointmentDatetime: { gte: thirtyDaysAgo, lt: todayStart },
            status: { in: ['COMPLETED', 'MISSED'] },
          },
          select: { status: true },
        }),

        // Calendar: current month + next month
        prisma.appointment.findMany({
          where: {
            elderly: { organizationId: orgId },
            appointmentDatetime: { gte: monthStart, lte: nextMonthEnd },
          },
          select: {
            id: true,
            appointmentDatetime: true,
            status: true,
            hospitalName: true,
            elderly: { select: { firstName: true, lastName: true } },
          },
          orderBy: { appointmentDatetime: 'asc' },
        }),
      ]);

    // Miss rate
    const completedCount = last30d.filter((a) => a.status === 'COMPLETED').length;
    const missedCount    = last30d.filter((a) => a.status === 'MISSED').length;
    const totalFinished  = completedCount + missedCount;
    const missRatePct    = totalFinished > 0
      ? parseFloat(((missedCount / totalFinished) * 100).toFixed(1))
      : null;

    // Calendar events grouped by date
    const calMap = {};
    for (const a of calMonthAppts) {
      if (!a.appointmentDatetime) continue;
      const key = new Date(a.appointmentDatetime).toISOString().slice(0, 10);
      if (!calMap[key]) calMap[key] = [];
      calMap[key].push({ status: a.status, hospitalName: a.hospitalName,
        elderlyName: `${a.elderly?.firstName ?? ''} ${a.elderly?.lastName ?? ''}`.trim() });
    }
    const calendarEvents = Object.entries(calMap).map(([date, events]) => ({
      date,
      count:        events.length,
      hasMissed:    events.some((e) => e.status === 'MISSED'),
      hasScheduled: events.some((e) => e.status === 'SCHEDULED'),
      hasCompleted: events.some((e) => e.status === 'COMPLETED'),
    }));

    return success(res, {
      stats: {
        todayCount:          todayAppts.length,
        tomorrowCount:       tomorrowAppts.length,
        missedPendingCount:  missedAppts.length,
        missRatePct,
        completedLast30d:    completedCount,
        missedLast30d:       missedCount,
        totalLast30d:        totalFinished,
      },
      today:          todayAppts.map(serializeAppt),
      tomorrow:       tomorrowAppts.map(serializeAppt),
      missed:         missedAppts.map(serializeAppt),
      calendarEvents,
    });
  } catch (err) {
    console.error('[AppointmentController.summary]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch appointment summary', 500);
  }
};

// ── POST /api/v1/appointments ─────────────────────────────────────────────────

const create = async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);

  const { elderlyId, ...data } = parsed.data;
  const eid = BigInt(elderlyId);

  try {
    const elderly = await prisma.elderly.findFirst({
      where: { id: eid, organizationId: BigInt(req.user.organizationId) },
      select: { id: true },
    });
    if (!elderly) return failure(res, 'NOT_FOUND', 'Elderly not found', 404);

    const appt = await prisma.appointment.create({
      data: { ...data, elderlyId: eid, appointmentDatetime: new Date(data.appointmentDatetime) },
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'CREATE', tableName: 'appointments', recordId: appt.id, newData: parsed.data, req });
    return success(res, serializeAppt(appt), 201);
  } catch (err) {
    console.error('[AppointmentController.create]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to create appointment', 500);
  }
};

// ── PUT /api/v1/appointments/:id ──────────────────────────────────────────────

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return failure(res, 'VALIDATION_ERROR', parsed.error.errors[0].message, 400);

  try {
    const existing = await prisma.appointment.findFirst({
      where: { id, elderly: { organizationId: BigInt(req.user.organizationId) } },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Appointment not found', 404);

    const data = { ...parsed.data };
    if (data.appointmentDatetime) data.appointmentDatetime = new Date(data.appointmentDatetime);

    const appt = await prisma.appointment.update({
      where: { id },
      data,
      include: { elderly: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'UPDATE', tableName: 'appointments', recordId: appt.id, newData: parsed.data, req });
    return success(res, serializeAppt(appt));
  } catch (err) {
    console.error('[AppointmentController.update]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to update appointment', 500);
  }
};

// ── DELETE /api/v1/appointments/:id ──────────────────────────────────────────

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const existing = await prisma.appointment.findFirst({
      where: { id, elderly: { organizationId: BigInt(req.user.organizationId) } },
    });
    if (!existing) return failure(res, 'NOT_FOUND', 'Appointment not found', 404);

    await prisma.appointment.delete({ where: { id } });
    await createAuditLog({ userId: BigInt(req.user.id), action: 'DELETE', tableName: 'appointments', recordId: id, req });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[AppointmentController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete appointment', 500);
  }
};

module.exports = { list, summary, create, update, remove };
