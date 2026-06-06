const { Router } = require("express");
const { create, list, getById, update, remove } = require("../controllers/orders.controller");

const router = Router();

router.get("/",    list);
router.get("/:id", getById);
router.post("/",   create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;
