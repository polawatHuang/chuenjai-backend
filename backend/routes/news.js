const express = require("express");
const router = express.Router();
const pool = require("../db");
const scrapeDailynews = require("../scrapers/dailynews");
const scrapeThairath = require("../scrapers/thailath");

router.post("/refresh", async (req, res) => {
  try {

    // 1️⃣ delete old news
    await pool.query(`
      DELETE FROM news
      WHERE created_at < NOW() - INTERVAL 7 DAY
    `);

    // 2️⃣ scrape news
    const dailynews = await scrapeDailynews();
    const thairath = await scrapeThairath();

    const allNews = [...dailynews, ...thairath];

    let inserted = 0;

    for (const n of allNews) {

      if (!n.title) continue;

      await pool.query(
        `
        INSERT INTO news
        (title, image_url, source, source_url, published_at)
        VALUES (?, ?, ?, ?, NOW())
        `,
        [
          n.title,
          n.image || null,
          n.source,
          n.link
        ]
      );

      inserted++;

    }

    res.json({
      status: "ok",
      inserted,
      deleted_old_news: true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "refresh failed",
      message: err.message
    });

  }
});

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