const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM news ORDER BY published_at DESC"
  );
  res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM news WHERE id=$1",
    [req.params.id]
  );
  res.json(result.rows[0]);
});

module.exports = router;