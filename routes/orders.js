const express = require("express");
const router = express.Router();
const db = require("../db");

// ===============================
// CREATE ORDER
// POST /api/orders
// ===============================
router.post("/", async (req, res) => {
  try {

    const {
      buyer_name,
      buyer_phone,
      buyer_address,
      item_name,
      item_url,
      item_point
    } = req.body;

    if (!buyer_name || !buyer_phone || !item_name) {
      return res.status(400).json({
        error: "buyer_name, buyer_phone and item_name required"
      });
    }

    const [result] = await db.query(
      `INSERT INTO orders
      (buyer_name,buyer_phone,buyer_address,item_name,item_url,item_point)
      VALUES (?,?,?,?,?,?)`,
      [
        buyer_name,
        buyer_phone,
        buyer_address || "",
        item_name,
        item_url || "",
        item_point || 1
      ]
    );

    res.status(201).json({
      message: "Order created",
      order_id: result.insertId
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// GET ALL ORDERS
// GET /api/orders
// ===============================
router.get("/", async (req, res) => {
  try {

    const [rows] = await db.query(
      `SELECT * FROM orders
       ORDER BY created_at DESC`
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// GET ORDER BY ID
// GET /api/orders/:id
// ===============================
router.get("/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT * FROM orders WHERE id=?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// UPDATE ORDER
// PUT /api/orders/:id
// ===============================
router.put("/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const {
      buyer_name,
      buyer_phone,
      buyer_address,
      item_name,
      item_url,
      item_point
    } = req.body;

    await db.query(
      `UPDATE orders SET
      buyer_name=?,
      buyer_phone=?,
      buyer_address=?,
      item_name=?,
      item_url=?,
      item_point=?,
      updated_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [
        buyer_name,
        buyer_phone,
        buyer_address,
        item_name,
        item_url,
        item_point,
        id
      ]
    );

    res.json({ message: "Order updated" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===============================
// DELETE ORDER
// DELETE /api/orders/:id
// ===============================
router.delete("/:id", async (req, res) => {
  try {

    const { id } = req.params;

    await db.query(
      `DELETE FROM orders WHERE id=?`,
      [id]
    );

    res.json({ message: "Order deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;