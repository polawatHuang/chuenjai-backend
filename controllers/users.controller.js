const db = require("../config/db");
const bcrypt = require("bcrypt");

// ── List all users (admin) ───────────────────────────────────────────────────

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id,name,phone,address,point,money,created_at FROM users ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Get user by ID ───────────────────────────────────────────────────────────

const getById = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id,name,phone,address,point,money FROM users WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Update user profile ──────────────────────────────────────────────────────

const update = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const { id } = req.params;
    if (req.user?.id?.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
    await db.query(
      "UPDATE users SET name=?,phone=?,address=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [name, phone, address, id]
    );
    res.json({ message: "User updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Update password ──────────────────────────────────────────────────────────

const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.id?.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
    const hashed = await bcrypt.hash(req.body.password, 10);
    await db.query(
      "UPDATE users SET password=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [hashed, id]
    );
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Delete user ──────────────────────────────────────────────────────────────

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.id?.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }
    await db.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Register ─────────────────────────────────────────────────────────────────

const register = async (req, res) => {
  try {
    const { phone, password, name, address } = req.body;
    const [existing] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
    if (existing.length) {
      return res.status(400).json({ error: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ" });
    }
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (name,phone,password,address,point) VALUES (?,?,?,?,0)",
      [name, phone, hashed, address || ""]
    );
    const [newUser] = await db.query(
      "SELECT id,name,phone,point,address FROM users WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ message: "สมัครสมาชิกสำเร็จ", user: newUser[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Legacy login ─────────────────────────────────────────────────────────────

const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const [users] = await db.query("SELECT * FROM users WHERE phone = ?", [phone]);
    if (!users.length) {
      return res.status(401).json({ error: "ไม่พบเบอร์โทรศัพท์นี้ในระบบ" });
    }
    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
    delete user.password;
    res.json({ message: "เข้าสู่ระบบสำเร็จ", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Forgot password ──────────────────────────────────────────────────────────

const forgotPassword = async (req, res) => {
  try {
    const { phone, new_password } = req.body;
    const [users] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
    if (!users.length) {
      return res.status(404).json({ error: "ไม่พบเบอร์โทรศัพท์นี้ในระบบ" });
    }
    const hashed = await bcrypt.hash(new_password, 10);
    await db.query(
      "UPDATE users SET password=? WHERE phone=?",
      [hashed, phone]
    );
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Update points ────────────────────────────────────────────────────────────

const updatePoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { point_change } = req.body;
    await db.query(
      "UPDATE users SET point = point + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [point_change, id]
    );
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Points updated", user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { list, getById, update, updatePassword, remove, register, login, forgotPassword, updatePoints };
