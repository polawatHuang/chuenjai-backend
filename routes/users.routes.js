const { Router } = require("express");
const {
  list, getById, update, updatePassword, remove,
  register, login, forgotPassword, updatePoints,
} = require("../controllers/users.controller");
const legacyAuth = require("../middlewares/legacy-auth.middleware");

const router = Router();

// ── Auth endpoints (public) ───────────────────────────────────────────────────
router.post("/register",        register);       // POST /api/register
router.post("/login",           login);          // POST /api/login
router.post("/forget-password", forgotPassword); // POST /api/forget-password

// ── User profile (token required) ────────────────────────────────────────────
router.get("/users",              legacyAuth, list);
router.get("/users/:id",          legacyAuth, getById);
router.put("/users/:id",          legacyAuth, update);
router.put("/users/:id/password", legacyAuth, updatePassword);
router.put("/users/:id/points",   legacyAuth, updatePoints);
router.delete("/users/:id",       legacyAuth, remove);

module.exports = router;
