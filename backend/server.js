require("dotenv").config();
const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const db = require("./db");

// Import Routes
const newsRoutes = require("./routes/news");
const healthRoutes = require("./routes/health");
const refreshNews = require("./routes/refreshNews");

// Import SOS System (ทำเป็น Router)
const sosRoutes = require("./sos-messaging-system");

require("./cron");

const app = express();
app.use(cors());

// ==========================================
// 🚨 วาง LINE Webhook ไว้ตรงนี้ (ก่อน express.json)
// ==========================================
// สมมติว่าใน sosRoutes เราจัดการ LINE middleware ไว้แล้ว
app.use("/webhook", sosRoutes);

// ==========================================
// 📦 ตัวแปลง JSON สำหรับ API อื่นๆ (ต้องอยู่หลัง Webhook)
// ==========================================
app.use(express.json());

// ==========================================
// 🌐 API Routes อื่นๆ
// ==========================================
app.use("/api/news", newsRoutes);
app.use("/api/health", healthRoutes);

// Manual trigger for testing
app.get("/api/news-refresh", async (req, res) => {
  console.log("Manual refresh triggered...");
  const result = await refreshNews();
  res.json(result);
});

// API เช็คเบอร์มิจฉาชีพ
app.get('/api/check-number/:phone', async (req, res) => {
  const phone = req.params.phone;
  const sql = `SELECT report_type, COUNT(*) as count FROM phone_reports WHERE phone_number = ? GROUP BY report_type`;
  try {
    const results = await new Promise((resolve, reject) => {
      db.query(sql, [phone], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });

    if (results.length > 0) {
      res.json({ safe: false, data: results, message: `แจ้งเตือน! เบอร์ ${phone} เคยถูกแจ้งเตือนว่าเป็น${results[0].report_type} ซึ่งเป็นมิจฉาชีพ` });
    } else {
      res.json({ safe: true, data: null, message: `เบอร์ ${phone} ยังไม่เคยถูกแจ้งเตือนว่าเป็นมิจฉาชีพ` });
    }
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "ขออภัย! เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// API สำหรับรายงานเบอร์มิจฉาชีพ
app.post('/api/report-number', async (req, res) => {
  const { phone, report_type } = req.body;
  if (!phone || !report_type) {
    return res.status(400).json({ error: "กรุณากรอกเบอร์โทรศัพท์ของมิจฉาชีพและประเภทการรายงาน" });
  }
  const sql = `INSERT INTO phone_reports (phone_number, report_type) VALUES (?, ?)`;
  try {
    await new Promise((resolve, reject) => {
      db.query(sql, [phone, report_type], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
    res.status(201).json({ success: true, message: "ขอบคุณสำหรับการรายงาน! ข้อมูลของคุณจะช่วยให้ผู้อื่นปลอดภัยมากขึ้น" });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "ขออภัย! เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง" });
  }
});

// ==========================================
// ⏰ Cron Jobs
// ==========================================
cron.schedule("0 7 * * *", async () => {
  await refreshNews();
});

// Start Server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});