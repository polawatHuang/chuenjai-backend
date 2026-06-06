const db = require("../config/db");

const check = async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, "");
    const [rows] = await db.query(
      "SELECT report_type, COUNT(*) as count FROM phone_reports WHERE phone_number = ? GROUP BY report_type",
      [phone]
    );
    if (rows.length) {
      res.json({ safe: false, data: rows, message: `แจ้งเตือน! เบอร์ ${phone} เคยถูกแจ้งเตือนว่าเป็น ${rows[0].report_type}` });
    } else {
      res.json({ safe: true, data: null, message: `เบอร์ ${phone} ยังไม่เคยถูกแจ้งเตือนว่าเป็นมิจฉาชีพ` });
    }
  } catch (err) {
    res.status(500).json({ error: "ขออภัย! เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง" });
  }
};

const report = async (req, res) => {
  try {
    const { phone, report_type } = req.body;
    if (!phone || !report_type) {
      return res.status(400).json({ error: "กรุณากรอกเบอร์โทรศัพท์ของมิจฉาชีพและประเภทการรายงาน" });
    }
    const cleanPhone = phone.replace(/\D/g, "");
    await db.query(
      "INSERT INTO phone_reports (phone_number,report_type) VALUES (?,?)",
      [cleanPhone, report_type]
    );
    res.status(201).json({ success: true, message: "ขอบคุณสำหรับการรายงาน! ข้อมูลของคุณจะช่วยให้ผู้อื่นปลอดภัยมากขึ้น" });
  } catch (err) {
    res.status(500).json({ error: "ขออภัย! เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง" });
  }
};

module.exports = { check, report };
