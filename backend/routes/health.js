const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const start = Date.now();

  let dbStatus = "ok";
  let newsStatus = "error";
  let sosStatus = "error";
  let checkNumberStatus = "error";
  let reportNumberStatus = "error";

  // กำหนด Base URL สำหรับเรียกหาตัวเอง (Loopback)
  const port = process.env.PORT || 4000;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. ตรวจสอบสถานะ Database
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbStatus = "error";
  }

  // 2. ตรวจสอบสถานะ API /news
  try {
    const newsRes = await fetch(`${baseUrl}/api/news`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (newsRes.ok) {
      newsStatus = "ok";
    } else {
      newsStatus = `error (status: ${newsRes.status})`;
    }
  } catch (error) {
    newsStatus = "down or timeout";
  }

  // 3. ตรวจสอบสถานะ SOS Webhook
  try {
    const sosRes = await fetch(`${baseUrl}/webhook`, { 
      method: "POST",
      signal: AbortSignal.timeout(3000) 
    });
    if (sosRes.status !== 404) {
      sosStatus = "ok";
    } else {
      sosStatus = "not found";
    }
  } catch (error) {
    sosStatus = "down or timeout";
  }

  // 4. ตรวจสอบสถานะ API เช็คเบอร์มิจฉาชีพ (ลองใช้เบอร์สมมติ 0000000000)
  try {
    const checkRes = await fetch(`${baseUrl}/api/check-number/0000000000`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (checkRes.ok) {
      checkNumberStatus = "ok";
    } else {
      checkNumberStatus = `error (status: ${checkRes.status})`;
    }
  } catch (error) {
    checkNumberStatus = "down or timeout";
  }

  // 5. ตรวจสอบสถานะ API แจ้งเบอร์มิจฉาชีพ
  try {
    const reportRes = await fetch(`${baseUrl}/api/report-number`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // ส่ง Object ว่างไปเพื่อทดสอบให้ติด Validation
      signal: AbortSignal.timeout(3000) 
    });
    
    // หากระบบตอบ 400 Bad Request (เพราะไม่มีเบอร์ส่งไป) แปลว่า Route ทำงานปกติและดักจับ Error ได้ถูกต้อง
    if (reportRes.status === 400 || reportRes.ok) {
      reportNumberStatus = "ok";
    } else if (reportRes.status === 404) {
      reportNumberStatus = "not found";
    } else {
      reportNumberStatus = `error (status: ${reportRes.status})`;
    }
  } catch (error) {
    reportNumberStatus = "down or timeout";
  }

  const responseTime = Date.now() - start;
  
  // เช็คว่าบริการทุกตัวต้องทำงานปกติ สถานะโดยรวมจึงจะเป็น ok
  const isSystemOk = dbStatus === "ok" && 
                     newsStatus === "ok" && 
                     sosStatus === "ok" && 
                     checkNumberStatus === "ok" && 
                     reportNumberStatus === "ok";

  res.json({
    status: isSystemOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),

    services: {
      api: "ok",
      database: dbStatus,
      news_api: newsStatus,
      sos_system: sosStatus,
      check_number_api: checkNumberStatus,
      report_number_api: reportNumberStatus
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