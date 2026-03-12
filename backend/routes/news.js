const express = require("express");
const router = express.Router();
const pool = require("../db");
const scrapeDailynews = require("../scrapers/dailynews");
const scrapeThairath = require("../scrapers/thairath");

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
      // ✅ เพิ่มการเช็ก !n.link เพื่อความชัวร์ (เหมือนโค้ดเดิมของคุณ)
      if (!n.title || !n.link) continue; 

      try {
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

      } catch (insertErr) {
        // ✅ ดักจับ Error เฉพาะตอน Insert
        // ถ้ารหัส Error ไม่ใช่ข่าวซ้ำ (ER_DUP_ENTRY) ค่อย log ออกมาดู
        if (insertErr.code !== "ER_DUP_ENTRY") {
          console.error(`Insert error for "${n.title}":`, insertErr.message);
        }
        // ถ้าเป็นข่าวซ้ำ ลูปก็จะข้ามไปทำข่าวต่อไปได้อย่างปลอดภัยครับ
      }
    }

    res.json({
      status: "ok",
      inserted,
      deleted_old_news: true
    });

  } catch (err) {
    console.error("Refresh route crashed:", err);
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