const { Router } = require("express");
const { log, getWinners } = require("../controllers/lucky-spin.controller");

const router = Router();

router.post("/log",     log);
router.get("/winners",  getWinners);

module.exports = router;
