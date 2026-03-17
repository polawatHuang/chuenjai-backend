require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const db = require("./db");

// Routes
const newsRoutes = require("./routes/news");
const healthRoutes = require("./routes/health");
const refreshNews = require("./routes/refreshNews");
const sosRoutes = require("./sos-messaging-system");
const ordersRoutes = require("./routes/orders");

require("./cron");

const app = express();

// =============================
// Environment validation
// =============================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing in .env");
  process.exit(1);
}

// =============================
// Security middleware
// =============================
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

app.use(limiter);
app.use(cors());

// =============================
// Webhook (must be before json)
// =============================
app.use("/webhook", sosRoutes);

// =============================
// JSON parser
// =============================
app.use(express.json());

// =============================
// JWT Authentication Middleware
// =============================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Token required" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = user;
    next();
  });
};

// =============================
// API Routes
// =============================
app.use("/api/orders", ordersRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/health", authenticateToken, healthRoutes);

// =============================
// AUTH APIs
// =============================

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { phone, password, name, address } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [existing] = await db.query(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, phone, password, address, point)
       VALUES (?, ?, ?, ?, 0)`,
      [name, phone, hashedPassword, address || ""]
    );

    const [user] = await db.query(
      "SELECT id, name, phone, address, point FROM users WHERE id = ?",
      [result.insertId]
    );

    const token = jwt.sign(user[0], process.env.JWT_SECRET, {
      expiresIn: "30d"
    });

    res.status(201).json({
      message: "Register success",
      user: user[0],
      token
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password required" });
    }

    const [users] = await db.query(
      `SELECT id, name, phone, password, address, point
       FROM users WHERE phone = ?`,
      [phone]
    );

    if (!users.length) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = users[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid password" });
    }

    delete user.password;

    const token = jwt.sign(user, process.env.JWT_SECRET, {
      expiresIn: "30d"
    });

    res.json({
      message: "Login success",
      user,
      token
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forget password
app.post("/api/forget-password", async (req, res) => {
  try {
    const { phone, new_password } = req.body;

    if (!phone || !new_password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [users] = await db.query(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );

    if (!users.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await db.query(
      "UPDATE users SET password=? WHERE phone=?",
      [hashedPassword, phone]
    );

    res.json({ message: "Password updated successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================
// USERS API
// =============================

app.get("/api/users/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [results] = await db.query(
      "SELECT id,name,phone,point,address FROM users WHERE id=?",
      [id]
    );

    if (!results.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(results[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:id/points", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { point_change } = req.body;

    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(
      `UPDATE users 
       SET point = point + ?, updated_at=CURRENT_TIMESTAMP 
       WHERE id=?`,
      [point_change, id]
    );

    const [updatedUser] = await db.query(
      "SELECT id,name,phone,point,address FROM users WHERE id=?",
      [id]
    );

    res.json({
      message: "Points updated",
      user: updatedUser[0]
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================
// Lucky Spin
// =============================

app.post("/api/lucky-spin/log", authenticateToken, async (req, res) => {
  try {
    const { item_name, winner_name, winner_phone, winner_address } = req.body;

    const [result] = await db.query(
      `INSERT INTO lucky_spin_log
       (item_name,winner_name,winner_phone,winner_address)
       VALUES (?,?,?,?)`,
      [item_name, winner_name, winner_phone, winner_address]
    );

    res.status(201).json({
      message: "Log saved",
      insertId: result.insertId
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/lucky-spin/winners", async (req, res) => {
  try {
    const [results] = await db.query(
      `SELECT item_name,winner_name
       FROM lucky_spin_log
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json(results);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================
// Items / Redeem
// =============================

app.get("/api/items", async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT * FROM items ORDER BY point ASC"
    );

    res.json(results);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/redeem", authenticateToken, async (req, res) => {

  let connection;

  try {

    connection = await db.getConnection();
    await connection.beginTransaction();

    const { user_id, item_id } = req.body;

    if (req.user.id.toString() !== user_id.toString()) {
      throw new Error("Unauthorized action");
    }

    const [userRes] = await connection.query(
      "SELECT point FROM users WHERE id=? FOR UPDATE",
      [user_id]
    );

    const [itemRes] = await connection.query(
      "SELECT name,point FROM items WHERE id=?",
      [item_id]
    );

    if (!userRes.length || !itemRes.length) {
      throw new Error("User or Item not found");
    }

    const userPoints = userRes[0].point;
    const requiredPoints = itemRes[0].point;

    if (userPoints < requiredPoints) {
      throw new Error("Not enough points");
    }

    await connection.query(
      `UPDATE users 
       SET point = point - ?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [requiredPoints, user_id]
    );

    await connection.commit();

    res.json({
      message: `Redeemed ${itemRes[0].name}`,
      deducted_points: requiredPoints
    });

  } catch (err) {

    if (connection) await connection.rollback();

    res.status(400).json({ error: err.message });

  } finally {

    if (connection) connection.release();

  }

});

// =============================
// Scam Checker
// =============================

app.get("/api/check-number/:phone", async (req, res) => {

  try {

    const phone = req.params.phone.replace(/\D/g, "");

    const [results] = await db.query(
      `SELECT report_type, COUNT(*) as count
       FROM phone_reports
       WHERE phone_number=?
       GROUP BY report_type`,
      [phone]
    );

    if (results.length > 0) {
      res.json({
        safe: false,
        data: results,
        message: `Warning: number ${phone} reported`
      });
    } else {
      res.json({
        safe: true,
        data: null,
        message: "No reports found"
      });
    }

  } catch (err) {

    res.status(500).json({
      error: "Internal server error"
    });

  }

});

app.post("/api/report-number", async (req, res) => {

  try {

    const { phone, report_type } = req.body;

    if (!phone || !report_type) {
      return res.status(400).json({
        error: "Phone and report type required"
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");

    await db.query(
      "INSERT INTO phone_reports (phone_number,report_type) VALUES (?,?)",
      [cleanPhone, report_type]
    );

    res.status(201).json({
      success: true,
      message: "Report submitted"
    });

  } catch (err) {

    res.status(500).json({
      error: "Internal server error"
    });

  }

});

// =============================
// Manual News Refresh
// =============================

app.get("/api/news-refresh", async (req, res) => {
  const result = await refreshNews();
  res.json(result);
});

// =============================
// Cron Job
// =============================

cron.schedule("0 7 * * *", async () => {
  await refreshNews();
});

// =============================
// Start Server
// =============================

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});