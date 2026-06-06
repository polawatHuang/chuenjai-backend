const { Router } = require("express");
const { list, getById, refresh } = require("../controllers/news.controller");

const router = Router();

router.get("/",        list);
router.get("/:id",     getById);
router.post("/refresh", refresh);

module.exports = router;
