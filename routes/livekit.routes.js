const { Router } = require("express");
const { getToken } = require("../controllers/livekit.controller");

const router = Router();

router.post("/get-token", getToken);

module.exports = router;
