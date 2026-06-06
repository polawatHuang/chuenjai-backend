const { Router } = require("express");
const { list, redeem } = require("../controllers/items.controller");

const router = Router();

router.get("/",      list);
router.post("/redeem", redeem);

module.exports = router;
