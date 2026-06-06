const db = require("../config/db");

const create = async (req, res) => {
  try {
    const { buyer_name, buyer_phone, buyer_address, item_name, item_url, item_point } = req.body;
    if (!buyer_name || !buyer_phone || !item_name) {
      return res.status(400).json({ error: "buyer_name, buyer_phone and item_name required" });
    }
    const [result] = await db.query(
      "INSERT INTO orders (buyer_name,buyer_phone,buyer_address,item_name,item_url,item_point) VALUES (?,?,?,?,?,?)",
      [buyer_name, buyer_phone, buyer_address || "", item_name, item_url || "", item_point || 1]
    );
    res.status(201).json({ message: "Order created", order_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { buyer_name, buyer_phone, buyer_address, item_name, item_url, item_point } = req.body;
    await db.query(
      "UPDATE orders SET buyer_name=?,buyer_phone=?,buyer_address=?,item_name=?,item_url=?,item_point=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [buyer_name, buyer_phone, buyer_address, item_name, item_url, item_point, req.params.id]
    );
    res.json({ message: "Order updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await db.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, getById, update, remove };
