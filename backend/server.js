require("dotenv").config();
const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

// Import Routes
const newsRoutes = require("./routes/news");
const healthRoutes = require("./routes/health");
const refreshNews = require("./routes/refreshNews");
const ordersRoutes = require("./routes/orders");

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
app.use("/api/orders", ordersRoutes);

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

// Endpoint สำหรับขอ Token ระบบ LiveKit (ใช้สำหรับเข้าร่วมห้องประชุม)
// Endpoint สำหรับขอ Token ระบบ LiveKit (ใช้สำหรับเข้าร่วมห้องประชุม)
app.post('/api/get-token', async (req, res) => {
  try {
    const { roomName, participantName, userId } = req.body;

    if (!roomName || !participantName || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ดึงค่าจาก .env (ต้องแน่ใจว่าในไฟล์ .env มี 3 ตัวนี้นะครับ)
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(500).json({ error: 'LiveKit credentials are not set in .env' });
    }

    // สร้าง Access Token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId.toString(), 
      name: participantName // ใส่ชื่อเข้าไปด้วยเพื่อแสดงในห้อง
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,   
      canSubscribe: true, 
    });

    const token = await at.toJwt();

    res.json({ token, serverUrl: livekitUrl });
  } catch (error) {
    console.error("Get Token Error:", error);
    res.status(500).json({ error: error.message });
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

// ระบบแลกของรางวัล (Transaction-Safe)
app.post('/api/redeem', async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction(); // เริ่ม Transaction

        const { user_id, item_id } = req.body;

        // 🛡️ Security Check: ป้องกันคนแอบอ้าง ID คนอื่นมาแลก
        if (req.user.id.toString() !== user_id.toString()) {
            throw new Error("Unauthorized: สิทธิ์ไม่ถูกต้อง");
        }

        // 🔍 1. ดึงข้อมูล User และ Item (ใช้ FOR UPDATE เพื่อล็อคป้องกัน Race Condition)
        // [[user]] แบบนี้คือเอาเฉพาะ Object แถวแรกมาเลย
        const [[user]] = await connection.query(
            "SELECT name, phone, address, point FROM users WHERE id=? FOR UPDATE", 
            [user_id]
        );
        const [[item]] = await connection.query(
            "SELECT name, point, img_url FROM items WHERE id=?", 
            [item_id]
        );

        // 🚫 2. ตรวจสอบว่าข้อมูลมีอยู่จริง
        if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน");
        if (!item) throw new Error("ไม่พบของรางวัลที่เลือก");

        // 💰 3. ตรวจสอบคะแนน (ใช้ค่าจาก Object ได้โดยตรง ไม่ต้องมี [0])
        if (user.point < item.point) {
            throw new Error(`คะแนนไม่เพียงพอ (คุณมี ${user.point} แต่ของรางวัลราคา ${item.point})`);
        }

        // 📉 4. หักคะแนน User
        await connection.query(
            'UPDATE users SET point = point - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item.point, user_id]
        );

        // 📝 5. บันทึกลงตาราง orders
        await connection.query(
            `INSERT INTO orders (buyer_name, buyer_phone, buyer_address, item_name, item_url, item_point) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                user.name, 
                user.phone, 
                user.address || "", 
                item.name, 
                item.img_url || "", 
                item.point
            ]
        );

        await connection.commit(); // ✅ ยืนยัน Transaction ทั้งหมด
        
        res.json({ 
            success: true,
            message: `แลกรับ ${item.name} สำเร็จ!`, 
            deducted_points: item.point,
            remaining_points: user.point - item.point 
        });

    } catch (err) {
        if (connection) await connection.rollback(); // ❌ ยกเลิกทั้งหมดหากมี Error
        console.error("Redeem Error:", err.message);
        res.status(400).json({ error: err.message });
    } finally {
        if (connection) connection.release(); // 🚪 คืน Connection กลับสู่ Pool
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