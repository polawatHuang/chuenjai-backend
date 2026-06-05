const jwt = require('jsonwebtoken');
const { failure } = require('../utils/response');

/**
 * Validates the JWT Access Token from the Authorization: Bearer <token> header.
 *
 * On success, attaches req.user = { id, organizationId, role } (all strings)
 * so downstream code can safely use them for multi-tenant filtering (AP-01).
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return failure(res, 'UNAUTHORIZED', 'Access token is required', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id:             decoded.sub,             // string
      organizationId: decoded.organizationId,  // string
      role:           decoded.role,            // Role enum value
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return failure(res, 'TOKEN_EXPIRED', 'Access token has expired', 401);
    }
    return failure(res, 'INVALID_TOKEN', 'Access token is invalid', 401);
  }
};

/**
 * Optional auth — populates req.user if a valid token is present,
 * but does not reject requests without one. Useful for public routes
 * that behave differently for authenticated callers.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id:             decoded.sub,
      organizationId: decoded.organizationId,
      role:           decoded.role,
    };
  } catch {
    // Ignore invalid tokens on optional auth paths
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };
