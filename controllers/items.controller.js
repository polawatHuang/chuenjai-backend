const db = require("../config/db");

const list = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM items ORDER BY point ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const redeem = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { user_id, item_id } = req.body;

    if (req.user?.id?.toString() !== user_id?.toString()) {
      throw new Error("Unauthorized: สิทธิ์ไม่ถูกต้อง");
    }

    const [[user]] = await connection.query(
      "SELECT name,phone,address,point FROM users WHERE id=? FOR UPDATE",
      [user_id]
    );
    const [[item]] = await connection.query(
      "SELECT name,point,img_url FROM items WHERE id=?",
      [item_id]
    );

    if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน");
    if (!item) throw new Error("ไม่พบของรางวัลที่เลือก");
    if (user.point < item.point) {
      throw new Error(`คะแนนไม่เพียงพอ (คุณมี ${user.point} แต่ของรางวัลราคา ${item.point})`);
    }

    await connection.query(
      "UPDATE users SET point = point - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [item.point, user_id]
    );
    await connection.query(
      "INSERT INTO orders (buyer_name,buyer_phone,buyer_address,item_name,item_url,item_point) VALUES (?,?,?,?,?,?)",
      [user.name, user.phone, user.address || "", item.name, item.img_url || "", item.point]
    );

    await connection.commit();
    res.json({
      success: true,
      message: `แลกรับ ${item.name} สำเร็จ!`,
      deducted_points: item.point,
      remaining_points: user.point - item.point,
    });
  } catch (err) {
    if (connection) await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { list, redeem };
