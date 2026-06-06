const { Router } = require("express");
const { check, report } = require("../controllers/phone-report.controller");

const router = Router();

router.get("/check-number/:phone", check);
router.post("/report-number",      report);

module.exports = router;
