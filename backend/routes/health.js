const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  const start = Date.now();

  // สถานะ API เดิม
  let dbStatus = "ok";
  let newsStatus = "error";
  let sosStatus = "error";
  let checkNumberStatus = "error";
  let reportNumberStatus = "error";

  // สถานะ API ใหม่ (Rewards System)
  let itemsStatus = "error";
  let luckySpinWinnersStatus = "error";
  let usersStatus = "error";

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
    newsStatus = newsRes.ok ? "ok" : `error (status: ${newsRes.status})`;
  } catch (error) {
    newsStatus = "down or timeout";
  }

  // 3. ตรวจสอบสถานะ SOS Webhook
  try {
    const sosRes = await fetch(`${baseUrl}/webhook`, { 
      method: "POST",
      signal: AbortSignal.timeout(3000) 
    });
    sosStatus = sosRes.status !== 404 ? "ok" : "not found";
  } catch (error) {
    sosStatus = "down or timeout";
  }

  // 4. ตรวจสอบสถานะ API เช็คเบอร์มิจฉาชีพ
  try {
    const checkRes = await fetch(`${baseUrl}/api/check-number/0000000000`, { 
      signal: AbortSignal.timeout(3000) 
    });
    checkNumberStatus = checkRes.ok ? "ok" : `error (status: ${checkRes.status})`;
  } catch (error) {
    checkNumberStatus = "down or timeout";
  }

  // 5. ตรวจสอบสถานะ API แจ้งเบอร์มิจฉาชีพ
  try {
    const reportRes = await fetch(`${baseUrl}/api/report-number`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), 
      signal: AbortSignal.timeout(3000) 
    });
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

  // ==========================================
  // ส่วนตรวจสอบ API ใหม่ (Rewards System)
  // ==========================================

  // 6. ตรวจสอบสถานะ API ของรางวัล (/api/items)
  try {
    const itemsRes = await fetch(`${baseUrl}/api/items`, { 
      signal: AbortSignal.timeout(3000) 
    });
    itemsStatus = itemsRes.ok ? "ok" : `error (status: ${itemsRes.status})`;
  } catch (error) {
    itemsStatus = "down or timeout";
  }

  // 7. ตรวจสอบสถานะ API ผู้โชคดี (/api/lucky-spin/winners)
  try {
    const winnersRes = await fetch(`${baseUrl}/api/lucky-spin/winners`, { 
      signal: AbortSignal.timeout(3000) 
    });
    luckySpinWinnersStatus = winnersRes.ok ? "ok" : `error (status: ${winnersRes.status})`;
  } catch (error) {
    luckySpinWinnersStatus = "down or timeout";
  }

  // 8. ตรวจสอบสถานะ API ข้อมูลผู้ใช้ (/api/users/:id)
  try {
    // ลองส่ง ID 0 ไปเช็ค ถ้าตอบ 404 (User not found) แปลว่า API เชื่อม DB และทำงานได้ปกติ
    const usersRes = await fetch(`${baseUrl}/api/users/0`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (usersRes.status === 404 || usersRes.ok) {
      usersStatus = "ok";
    } else {
      usersStatus = `error (status: ${usersRes.status})`;
    }
  } catch (error) {
    usersStatus = "down or timeout";
  }

  const responseTime = Date.now() - start;
  
  // เช็คว่าบริการทุกตัวต้องทำงานปกติ สถานะโดยรวมจึงจะเป็น ok
  const isSystemOk = dbStatus === "ok" && 
                     newsStatus === "ok" && 
                     sosStatus === "ok" && 
                     checkNumberStatus === "ok" && 
                     reportNumberStatus === "ok" &&
                     itemsStatus === "ok" &&
                     luckySpinWinnersStatus === "ok" &&
                     usersStatus === "ok";

  res.json({
    status: isSystemOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),

    services: {
      api: "ok",
      database: dbStatus,
      news_api: newsStatus,
      sos_system: sosStatus,
      check_number_api: checkNumberStatus,
      report_number_api: reportNumberStatus,
      rewards_items_api: itemsStatus,
      rewards_winners_api: luckySpinWinnersStatus,
      users_api: usersStatus
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