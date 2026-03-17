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
const usersRoutes = require("./routes/users");
const authenticateToken = require("./middleware/auth");

require("./cron");

const app = express();

// =============================
// ENV CHECK
// =============================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET missing");
  process.exit(1);
}

// =============================
// SECURITY
// =============================
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20 // ป้องกัน brute force login
});

app.use(cors());
app.use("/api/", apiLimiter);

// =============================
// WEBHOOK (ต้องมาก่อน json)
// =============================
app.use("/webhook", sosRoutes);

// =============================
// BODY PARSER
// =============================
app.use(express.json());

// =============================
// HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "Hangan News API",
    time: new Date()
  });
});

// =============================
// ROUTES
// =============================
app.use("/api/orders", ordersRoutes);
app.use("/api/users", authenticateToken, usersRoutes); // ✅ CRUD users
app.use("/api/news", newsRoutes);
app.use("/api/health", authenticateToken, healthRoutes);

// =============================
// AUTH
// =============================

// REGISTER
app.post("/api/register", authLimiter, async (req, res) => {
  try {
    let { phone, password, name, address } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    phone = phone.replace(/\D/g, "");

    const [existing] = await db.query(
      "SELECT id FROM users WHERE phone=?",
      [phone]
    );

    if (existing.length) {
      return res.status(400).json({ error: "Phone exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, phone, password, address, point, money)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [name, phone, hashedPassword, address || ""]
    );

    const [user] = await db.query(
      "SELECT id,name,phone,address,point,money FROM users WHERE id=?",
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
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    let { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    phone = phone.replace(/\D/g, "");

    const [users] = await db.query(
      `SELECT * FROM users WHERE phone=?`,
      [phone]
    );

    if (!users.length) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = users[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Wrong password" });
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
    res.status(400).json({ error: err.message });
  }
});

// FORGET PASSWORD
app.post("/api/forget-password", authLimiter, async (req, res) => {
  try {
    let { phone, new_password } = req.body;

    if (!phone || !new_password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    phone = phone.replace(/\D/g, "");

    const [users] = await db.query(
      "SELECT id FROM users WHERE phone=?",
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

    res.json({ message: "Password updated" });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================
// REDEEM (TRANSACTION SAFE)
// =============================
app.post("/api/redeem", authenticateToken, async (req, res) => {

  let connection;

  try {

    connection = await db.getConnection();
    await connection.beginTransaction();

    const { user_id, item_id } = req.body;

    if (req.user.id !== user_id) {
      throw new Error("Unauthorized");
    }

    const [[user]] = await connection.query(
      "SELECT point FROM users WHERE id=? FOR UPDATE",
      [user_id]
    );

    const [[item]] = await connection.query(
      "SELECT name,point FROM items WHERE id=?",
      [item_id]
    );

    if (!user || !item) throw new Error("Not found");

    if (user.point < item.point) {
      throw new Error("Not enough points");
    }

    await connection.query(
      "UPDATE users SET point=point-? WHERE id=?",
      [item.point, user_id]
    );

    await connection.commit();

    res.json({
      message: `Redeemed ${item.name}`,
      used_points: item.point
    });

  } catch (err) {

    if (connection) await connection.rollback();

    res.status(400).json({ error: err.message });

  } finally {

    if (connection) connection.release();

  }

});

app.use((req, res, next) => {
  res.setTimeout(10000, () => {
    res.status(503).json({ error: "Request timeout" });
  });
  next();
});

// =============================
// NEWS REFRESH
// =============================
app.get("/api/news-refresh", async (req, res) => {
  const result = await refreshNews();
  res.json(result);
});

// =============================
// CRON
// =============================
cron.schedule("0 7 * * *", async () => {
  await refreshNews();
});

// =============================
// START
// =============================
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});