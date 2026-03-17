const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");

// 👇 import middleware
const authenticateToken = require("../middleware/auth");

// ===============================
// GET ALL USERS (admin only)
// ===============================
router.get("/", authenticateToken, async (req, res) => {
  try {

    const [rows] = await db.query(
      `SELECT id,name,phone,address,point,money,created_at 
       FROM users ORDER BY created_at DESC`
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// GET USER (self only)
// ===============================
router.get("/:id", authenticateToken, async (req, res) => {
  try {

    const { id } = req.params;

    // 🔐 user ดูได้แค่ของตัวเอง
    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [rows] = await db.query(
      `SELECT id,name,phone,address,point,money 
       FROM users WHERE id=?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// UPDATE USER
// ===============================
router.put("/:id", authenticateToken, async (req, res) => {
  try {

    const { id } = req.params;
    const { name, phone, address } = req.body;

    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(
      `UPDATE users SET
      name=?,
      phone=?,
      address=?,
      updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [name, phone, address, id]
    );

    res.json({ message: "User updated" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// UPDATE PASSWORD
// ===============================
router.put("/:id/password", authenticateToken, async (req, res) => {
  try {

    const { id } = req.params;
    const { password } = req.body;

    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      `UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [hashedPassword, id]
    );

    res.json({ message: "Password updated" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// DELETE USER (optional: admin only)
// ===============================
router.delete("/:id", authenticateToken, async (req, res) => {
  try {

    const { id } = req.params;

    if (req.user.id.toString() !== id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query("DELETE FROM users WHERE id=?", [id]);

    res.json({ message: "User deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;