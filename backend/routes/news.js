const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM news ORDER BY published_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database query failed"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM news WHERE id=$1",
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database query failed"
    });
  }
});

module.exports = router;