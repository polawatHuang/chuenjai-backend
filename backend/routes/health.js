const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const start = Date.now();

  let dbStatus = "ok";

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbStatus = "error";
  }

  const responseTime = Date.now() - start;

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),

    services: {
      api: "ok",
      database: dbStatus
    },

    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version
    },

    performance: {
      response_time_ms: responseTime
    }
  });
});

module.exports = router;