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

// ดูข้อมูล User และคะแนน (ดึงตาม ID)
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// เพิ่ม/ลด คะแนน (เช่น ได้จากการทำ Daily Mission หรือหมุนวงล้อได้คะแนน)
app.put('/api/users/:id/points', async (req, res) => {
  try {
    const { id } = req.params;
    const { point_change } = req.body; // ใส่ค่าบวกเพื่อเพิ่ม ค่าลบเพื่อลด

    const result = await db.query(
      'UPDATE users SET point = point + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [point_change, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Points updated', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. LUCKY SPIN LOG API (วงล้อนำโชค)
// ==========================================

// บันทึกผู้โชคดีจากการหมุนวงล้อ
app.post('/api/lucky-spin/log', async (req, res) => {
  try {
    const { item_name, winner_name, winner_phone, winner_address } = req.body;
    
    const result = await db.query(
      `INSERT INTO lucky_spin_log (item_name, winner_name, winner_phone, winner_address) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [item_name, winner_name, winner_phone, winner_address]
    );
    
    res.status(201).json({ message: 'Log saved successfully', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ดึงรายชื่อผู้โชคดีล่าสุด (เอาไปแสดงในป้ายประกาศผล)
app.get('/api/lucky-spin/winners', async (req, res) => {
  try {
    // ดึง 10 คนล่าสุด
    const result = await db.query(
      'SELECT item_name, winner_name FROM lucky_spin_log ORDER BY created_at DESC LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. ITEMS & REDEEM API (ของรางวัลและการแลก)
// ==========================================

// ดึงรายการของรางวัลทั้งหมดไปแสดงในหน้า Rewards
app.get('/api/items', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM items ORDER BY point ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ระบบแลกของรางวัล (ใช้ Transaction เพื่อป้องกันข้อผิดพลาด)
app.post('/api/redeem', async (req, res) => {
  const client = await db.connect();
  try {
    const { user_id, item_id } = req.body;
    await client.query('BEGIN'); // เริ่ม Transaction

    // 1. ดึงข้อมูล User และ Item
    const userRes = await client.query('SELECT point FROM users WHERE id = $1', [user_id]);
    const itemRes = await client.query('SELECT name, point FROM items WHERE id = $1', [item_id]);

    if (userRes.rows.length === 0 || itemRes.rows.length === 0) {
      throw new Error('User or Item not found');
    }

    const userPoints = userRes.rows[0].point;
    const requiredPoints = itemRes.rows[0].point;
    const itemName = itemRes.rows[0].name;

    // 2. เช็คว่าคะแนนพอไหม
    if (userPoints < requiredPoints) {
      throw new Error('Not enough points');
    }

    // 3. หักคะแนน User
    await client.query(
      'UPDATE users SET point = point - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [requiredPoints, user_id]
    );

    await client.query('COMMIT'); // ยืนยัน Transaction
    res.json({ message: `Successfully redeemed: ${itemName}`, deducted_points: requiredPoints });
  } catch (err) {
    await client.query('ROLLBACK'); // ถ้ายกเลิกหรือ Error ให้ย้อนกลับข้อมูล
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Manual trigger for testing
app.get("/api/news-refresh", async (req, res) => {
  console.log("Manual refresh triggered...");
  const result = await refreshNews();
  res.json(result);
});

// API เช็คเบอร์มิจฉาชีพ
app.get('/api/check-number/:phone', async (req, res) => {
  let phone = req.params.phone;
  phone = phone.replace(/\D/g, ''); // ตัดทุกอย่างที่ไม่ใช่ตัวเลขทิ้ง
  
  const sql = `SELECT report_type, COUNT(*) as count FROM phone_reports WHERE phone_number = ? GROUP BY report_type`;
  
  try {
    // 🌟 แก้ตรงนี้: ใช้ await db.query() ได้เลย โค้ดจะสั้นและคลีนมาก
    // สังเกตว่าต้องใส่ [results] ครอบไว้ เพราะ mysql2/promise จะ return เป็น array [rows, fields]
    const [results] = await db.query(sql, [phone]);

    if (results.length > 0) {
      res.json({ safe: false, data: results, message: `แจ้งเตือน! เบอร์ ${phone} เคยถูกแจ้งเตือนว่าเป็น ${results[0].report_type}` });
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

  const cleanPhone = phone.replace(/\D/g, ''); 
  const sql = `INSERT INTO phone_reports (phone_number, report_type) VALUES (?, ?)`;
  
  try {
    // 🌟 แก้ตรงนี้เหมือนกัน: ไม่ต้องใช้ Callback หรือ new Promise แล้ว
    await db.query(sql, [cleanPhone, report_type]);
    
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