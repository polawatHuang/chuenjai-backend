const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {

    const [rows] = await pool.query(
      "SELECT * FROM news ORDER BY published_at DESC"
    );

    res.json(rows);

  } catch (err) {

    console.error("SQL ERROR:", err);

    res.status(500).json({
      error: err.message
    });

  }
});

router.get("/:id", async (req, res) => {
  try {

    const [rows] = await pool.query(
      "SELECT * FROM news WHERE id = ?",
      [req.params.id]
    );

    res.json(rows[0]);

  } catch (err) {

    console.error("SQL ERROR:", err);

    res.status(500).json({
      error: err.message
    });

  }
});

module.exports = router;