require("dotenv").config();
const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const bcrypt = require('bcrypt');

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

// ==========================================
// 🔐 AUTHENTICATION API
// ==========================================

// 1. สมัครสมาชิก (Register)
app.post('/api/register', async (req, res) => {
  try {
    const { phone, password, name, address } = req.body;

    // เช็คว่ามีเบอร์นี้ในระบบแล้วหรือยัง
    const [existing] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ' });
    }

    // เข้ารหัสผ่านก่อนบันทึกลงฐานข้อมูล
    const hashedPassword = await bcrypt.hash(password, 10);

    // บันทึก User ใหม่
    const [result] = await db.query(
      'INSERT INTO users (name, phone, password, address, point) VALUES (?, ?, ?, ?, 0)',
      [name, phone, hashedPassword, address || '']
    );

    // ดึงข้อมูลส่งกลับไปให้ Frontend (ไม่ส่งรหัสผ่านกลับไป)
    const [newUser] = await db.query('SELECT id, name, phone, point, address FROM users WHERE id = ?', [result.insertId]);

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', user: newUser[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. เข้าสู่ระบบ (Login)
app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    const [users] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ' });
    }

    const user = users[0];
    
    // ตรวจสอบรหัสผ่านว่าตรงกันไหม
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }

    // ลบรหัสผ่านออกจาก object ก่อนส่งกลับให้ Frontend
    delete user.password;
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. ลืมรหัสผ่าน (Forget Password)
app.post('/api/forget-password', async (req, res) => {
  try {
    const { phone, new_password } = req.body;
    
    // เช็คว่ามีเบอร์นี้อยู่จริงไหม
    const [users] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ' });
    }

    // เข้ารหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // อัปเดตรหัสผ่านลงฐานข้อมูล
    await db.query('UPDATE users SET password = ? WHERE phone = ?', [hashedPassword, phone]);

    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. USERS API (จัดการผู้ใช้งานและคะแนน)
// ==========================================

// ดูข้อมูล User และคะแนน (ดึงตาม ID)
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // 🌟 เปลี่ยน $1 เป็น ? และใส่ [results]
    const [results] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    
    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// เพิ่ม/ลด คะแนน (เช่น ได้จากการทำ Daily Mission หรือหมุนวงล้อได้คะแนน)
app.put('/api/users/:id/points', async (req, res) => {
  try {
    const { id } = req.params;
    const { point_change } = req.body; // ใส่ค่าบวกเพื่อเพิ่ม ค่าลบเพื่อลด

    // 🌟 MySQL ไม่มี RETURNING * จึงต้องสั่ง UPDATE ก่อน แล้วค่อย SELECT กลับมาดู
    await db.query(
      'UPDATE users SET point = point + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [point_change, id]
    );

    const [updatedUser] = await db.query('SELECT * FROM users WHERE id = ?', [id]);

    if (updatedUser.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Points updated', user: updatedUser[0] });
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
    
    // 🌟 เปลี่ยน $1, $2.. เป็น ?, ?.. และเอา RETURNING * ออก
    const [result] = await db.query(
      `INSERT INTO lucky_spin_log (item_name, winner_name, winner_phone, winner_address) 
       VALUES (?, ?, ?, ?)`,
      [item_name, winner_name, winner_phone, winner_address]
    );
    
    res.status(201).json({ 
      message: 'Log saved successfully', 
      insertId: result.insertId // คืนค่า ID ที่เพิ่ง insert ลงไป
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ดึงรายชื่อผู้โชคดีล่าสุด (เอาไปแสดงในป้ายประกาศผล)
app.get('/api/lucky-spin/winners', async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT item_name, winner_name FROM lucky_spin_log ORDER BY created_at DESC LIMIT 10'
    );
    res.json(results);
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
    const [results] = await db.query('SELECT * FROM items ORDER BY point ASC');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ระบบแลกของรางวัล (ใช้ Transaction เพื่อป้องกันข้อผิดพลาด)
app.post('/api/redeem', async (req, res) => {
  // 🌟 สำหรับ MySQL (mysql2/promise) จะใช้ getConnection() 
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction(); // เริ่ม Transaction

    const { user_id, item_id } = req.body;

    // 1. ดึงข้อมูล User และ Item
    const [userRes] = await connection.query('SELECT point FROM users WHERE id = ?', [user_id]);
    const [itemRes] = await connection.query('SELECT name, point FROM items WHERE id = ?', [item_id]);

    if (userRes.length === 0 || itemRes.length === 0) {
      throw new Error('User or Item not found');
    }

    const userPoints = userRes[0].point;
    const requiredPoints = itemRes[0].point;
    const itemName = itemRes[0].name;

    // 2. เช็คว่าคะแนนพอไหม
    if (userPoints < requiredPoints) {
      throw new Error('Not enough points');
    }

    // 3. หักคะแนน User
    await connection.query(
      'UPDATE users SET point = point - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [requiredPoints, user_id]
    );

    await connection.commit(); // ยืนยัน Transaction
    res.json({ message: `Successfully redeemed: ${itemName}`, deducted_points: requiredPoints });
  } catch (err) {
    if (connection) await connection.rollback(); // ถ้ายกเลิกหรือ Error ให้ย้อนกลับข้อมูล
    res.status(400).json({ error: err.message });
  } finally {
    if (connection) connection.release(); // สำคัญมาก! ต้องคืน connection กลับสู่ pool เสมอ
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