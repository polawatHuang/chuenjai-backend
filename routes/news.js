const express = require("express");
const router = express.Router();
const pool = require("../db");

// ✅ นำเข้าฟังก์ชันดึงข่าว RSS ตัวใหม่ที่เราเขียนไว้!
// (อย่าลืมเช็ก path ให้ตรงกับที่ไฟล์คุณอยู่นะครับ สมมติว่าไฟล์ refreshNews.js อยู่โฟลเดอร์เดียวกันหรือถัดไป 1 ชั้น)
const refreshNews = require("./refreshNews"); 

// === 1️⃣ API สำหรับสั่งดึงข่าว (Manual Refresh) ===
router.post("/refresh", async (req, res) => {
  try {
    // โยนหน้าที่ไปให้ฟังก์ชัน refreshNews() จัดการทั้งหมดเลย
    const result = await refreshNews();

    if (result.status === "error") {
      return res.status(500).json(result);
    }

    // ตอบกลับไปยัง Postman หรือ Frontend
    res.json(result);

  } catch (err) {
    console.error("Refresh route crashed:", err);
    res.status(500).json({
      error: "refresh route failed",
      message: err.message
    });
  }
});

// === 2️⃣ API สำหรับดึงข่าวทั้งหมดไปโชว์ที่หน้าเว็บ ===
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM news ORDER BY published_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("SQL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// === 3️⃣ API สำหรับดึงรายละเอียดข่าวรายตัว ===
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM news WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "News not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("SQL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;