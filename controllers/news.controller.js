const db = require("../config/db");
const refreshNews = require("../services/news.service");

const list = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM news ORDER BY published_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM news WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "News not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const refresh = async (req, res) => {
  try {
    const result = await refreshNews();
    if (result.status === "error") return res.status(500).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "refresh failed", message: err.message });
  }
};

module.exports = { list, getById, refresh };
