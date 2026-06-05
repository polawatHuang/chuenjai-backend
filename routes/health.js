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
  let itemsStatus = "error";
  let luckySpinWinnersStatus = "error";
  let usersStatus = "error";
  let livekitTokenStatus = "error"; // ✅ 1. เพิ่มตัวแปรสำหรับเก็บสถานะ Get Token

  // ✅ ดึง Base URL จาก Request จริงบน Plesk (รองรับ Proxy/HTTPS)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host;
  const baseUrl = `${protocol}://${host}`; 

  // 1. ตรวจสอบสถานะ Database
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbStatus = `error (${error.message})`;
  }

  // 2. ตรวจสอบสถานะ API /news
  try {
    const newsRes = await fetch(`${baseUrl}/api/news`, { 
      signal: AbortSignal.timeout(3000) 
    });
    newsStatus = newsRes.ok ? "ok" : `error (status: ${newsRes.status})`;
  } catch (error) {
    newsStatus = `down or timeout (${error.message})`;
  }

  // 3. ตรวจสอบสถานะ SOS Webhook
  try {
    const sosRes = await fetch(`${baseUrl}/webhook`, { 
      method: "POST",
      signal: AbortSignal.timeout(3000) 
    });
    sosStatus = sosRes.status !== 404 ? "ok" : "not found";
  } catch (error) {
    sosStatus = `down or timeout (${error.message})`;
  }

  // 4. ตรวจสอบสถานะ API เช็คเบอร์มิจฉาชีพ
  try {
    const checkRes = await fetch(`${baseUrl}/api/check-number/0000000000`, { 
      signal: AbortSignal.timeout(3000) 
    });
    checkNumberStatus = checkRes.ok ? "ok" : `error (status: ${checkRes.status})`;
  } catch (error) {
    checkNumberStatus = `down or timeout (${error.message})`;
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
    reportNumberStatus = `down or timeout (${error.message})`;
  }

  // 6. ตรวจสอบสถานะ API ของรางวัล (/api/items)
  try {
    const itemsRes = await fetch(`${baseUrl}/api/items`, { 
      signal: AbortSignal.timeout(3000) 
    });
    itemsStatus = itemsRes.ok ? "ok" : `error (status: ${itemsRes.status})`;
  } catch (error) {
    itemsStatus = `down or timeout (${error.message})`;
  }

  // 7. ตรวจสอบสถานะ API ผู้โชคดี (/api/lucky-spin/winners)
  try {
    const winnersRes = await fetch(`${baseUrl}/api/lucky-spin/winners`, { 
      signal: AbortSignal.timeout(3000) 
    });
    luckySpinWinnersStatus = winnersRes.ok ? "ok" : `error (status: ${winnersRes.status})`;
  } catch (error) {
    luckySpinWinnersStatus = `down or timeout (${error.message})`;
  }

  // 8. ตรวจสอบสถานะ API ข้อมูลผู้ใช้ (/api/users/:id)
  try {
    const usersRes = await fetch(`${baseUrl}/api/users/0`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (usersRes.status === 401 || usersRes.status === 404 || usersRes.ok) {
      usersStatus = "ok";
    } else {
      usersStatus = `error (status: ${usersRes.status})`;
    }
  } catch (error) {
    usersStatus = `down or timeout (${error.message})`;
  }

  // ✅ 9. ตรวจสอบสถานะ API ขอ Token สำหรับ LiveKit (/api/get-token)
  try {
    const tokenRes = await fetch(`${baseUrl}/api/get-token`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ส่ง Object ว่างไป เพื่อให้ API ตอบกลับเป็น 400 (Missing required fields)
      // ช่วยยืนยันว่า Endpoint ทำงานอยู่ โดยไม่ต้องเสียเวลาประมวลผลสร้าง JWT จริง
      body: JSON.stringify({}), 
      signal: AbortSignal.timeout(3000) 
    });
    
    // ถ้าเซิร์ฟเวอร์ตอบ 400 (ดักจับ Error สำเร็จ) หรือตอบ OK แสดงว่าระบบปกติ 100%
    if (tokenRes.status === 400 || tokenRes.ok) {
      livekitTokenStatus = "ok";
    } else {
      livekitTokenStatus = `error (status: ${tokenRes.status})`;
    }
  } catch (error) {
    livekitTokenStatus = `down or timeout (${error.message})`;
  }

  const responseTime = Date.now() - start;
  
  // ✅ อัปเดตเงื่อนไขให้ Health ตกเป็น degraded หาก livekitTokenStatus ล่ม
  const isSystemOk = dbStatus === "ok" && 
                     newsStatus === "ok" && 
                     sosStatus === "ok" && 
                     checkNumberStatus === "ok" && 
                     reportNumberStatus === "ok" &&
                     itemsStatus === "ok" &&
                     luckySpinWinnersStatus === "ok" &&
                     usersStatus === "ok" &&
                     livekitTokenStatus === "ok";

  res.json({
    status: isSystemOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    
    _debug: {
      baseUrl: baseUrl
    },

    services: {
      api: "ok",
      database: dbStatus,
      news_api: newsStatus,
      sos_system: sosStatus,
      check_number_api: checkNumberStatus,
      report_number_api: reportNumberStatus,
      rewards_items_api: itemsStatus,
      rewards_winners_api: luckySpinWinnersStatus,
      users_api: usersStatus,
      livekit_token_api: livekitTokenStatus // ✅ 2. แสดงผลใน JSON 
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