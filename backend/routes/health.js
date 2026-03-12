const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const start = Date.now();

  let dbStatus = "ok";
  let newsStatus = "error";
  let sosStatus = "error";

  // กำหนด Base URL สำหรับเรียกหาตัวเอง (Loopback)
  const port = process.env.PORT || 4000;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. ตรวจสอบสถานะ Database
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbStatus = "error";
  }

  // 2. ตรวจสอบสถานะ API /news (จำลองการดึงข้อมูล GET)
  try {
    // ใส่ AbortSignal เพื่อป้องกันกรณีเซิร์ฟเวอร์ค้างแล้ว Health check จะค้างตาม (Timeout 3 วินาที)
    const newsRes = await fetch(`${baseUrl}/api/news`, { 
      signal: AbortSignal.timeout(3000) 
    });
    
    // หากตอบกลับเป็น 2xx ถือว่าปกติ
    if (newsRes.ok) {
      newsStatus = "ok";
    } else {
      newsStatus = `error (status: ${newsRes.status})`;
    }
  } catch (error) {
    newsStatus = "down or timeout";
  }

  // 3. ตรวจสอบสถานะ SOS Webhook (จำลองการยิง POST)
  try {
    const sosRes = await fetch(`${baseUrl}/webhook`, { 
      method: "POST",
      signal: AbortSignal.timeout(3000) 
    });
    
    // Webhook ของ LINE จะตรวจจับว่าไม่มี Signature จึงอาจตอบ 400, 401 หรือ 500
    // ซึ่งถ้าไม่ได้ตอบ 404 (Not Found) แปลว่าตัว Route SOS ถูกตั้งค่าและยังทำงานอยู่
    if (sosRes.status !== 404) {
      sosStatus = "ok";
    } else {
      sosStatus = "not found";
    }
  } catch (error) {
    sosStatus = "down or timeout";
  }

  const responseTime = Date.now() - start;

  res.json({
    status: (dbStatus === "ok" && newsStatus === "ok" && sosStatus === "ok") ? "ok" : "degraded",
    timestamp: new Date().toISOString(),

    services: {
      api: "ok",
      database: dbStatus,
      news_api: newsStatus,
      sos_system: sosStatus
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