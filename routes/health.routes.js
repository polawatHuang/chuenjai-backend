const { Router } = require("express");
const { check } = require("../controllers/health.controller");

const router = Router();

router.get("/", check);

module.exports = router;
