const db = require("../config/db");

const log = async (req, res) => {
  try {
    const { item_name, winner_name, winner_phone, winner_address } = req.body;
    const [result] = await db.query(
      "INSERT INTO lucky_spin_log (item_name,winner_name,winner_phone,winner_address) VALUES (?,?,?,?)",
      [item_name, winner_name, winner_phone, winner_address]
    );
    res.status(201).json({ message: "Log saved successfully", insertId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWinners = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT item_name,winner_name FROM lucky_spin_log ORDER BY created_at DESC LIMIT 10"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { log, getWinners };
