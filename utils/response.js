/**
 * Prisma-safe serializer.
 *
 * Handles two non-standard JS types that Prisma returns from MySQL:
 *  - BigInt (all id / FK columns)  → serialized as string to avoid JSON.stringify throw
 *  - Decimal (decimal.js instances) → serialized as number (parseFloat) so lat/lng
 *    and score fields arrive as numbers, not strings, in the API response.
 *
 * Decimal detection: decimal.js objects carry a constructor named "Decimal" and
 * expose a .toNumber() method — we use the constructor name check which is stable
 * across decimal.js v9/v10 (the versions bundled by Prisma v5–v7).
 */
function serialize(data) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal') {
        return parseFloat(v.toString());
      }
      return v;
    })
  );
}

/**
 * Standard success envelope:
 * { success: true, data: {...} }
 */
function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data: serialize(data) });
}

/**
 * Standard error envelope:
 * { success: false, code: "SOME_ERROR", message: "..." }
 */
function failure(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({ success: false, code, message });
}

/**
 * Paginated success envelope with meta block.
 */
function paginated(res, data, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    data: serialize(data),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

module.exports = { success, failure, paginated };
