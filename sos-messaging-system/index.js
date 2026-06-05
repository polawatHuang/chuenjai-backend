const express = require('express');
const line = require('@line/bot-sdk');
const { getGreetingMessage } = require('../hellow-message');

const router = express.Router();

// 1. ตั้งค่า LINE Messaging API (แนะนำให้ดึงจากไฟล์ .env เพื่อความปลอดภัย)
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN, // ใส่ค่าในไฟล์ .env
  channelSecret: process.env.LINE_CHANNEL_SECRET           // ใส่ค่าในไฟล์ .env
};

const client = new line.Client(config);

// จำลองฐานข้อมูล (ในระบบจริงควรใช้ Database เช่น MongoDB)
const usersDb = {}; 

// 2. สร้าง Webhook Endpoint
// 💡 เนื่องจากใน server.js เราใช้ app.use("/webhook", sosRoutes) ไปแล้ว
// path ตรงนี้จึงใช้แค่ '/' ซึ่งจะหมายถึง '/webhook' โดยอัตโนมัติ
router.post('/', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Webhook Error:", err);
      res.status(500).end();
    });
});

// 3. ฟังก์ชันจัดการเหตุการณ์ (Event Handler)
async function handleEvent(event) {
  // รับเฉพาะ event ที่เป็นข้อความตัวอักษร
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();

  // ตรวจสอบและสร้างข้อมูล User ในฐานข้อมูลจำลอง (ถ้ายังไม่มี)
  if (!usersDb[userId]) {
    usersDb[userId] = { phone: null, state: 'NORMAL' };
  }
  const user = usersDb[userId];

  // ==========================================
  // Flow 1: ผู้ใช้กดปุ่ม "ปุ่มฉุกเฉิน"
  // ==========================================
  if (text === 'ปุ่มฉุกเฉิน') {
    if (!user.phone) {
      user.state = 'WAITING_PHONE'; 
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'น้องชื่นใจตรวจพบว่าคุณพี่ยังไม่ได้ลงทะเบียนเบอร์ติดต่อฉุกเฉินเลยครับ\n\nรบกวนพิมพ์เบอร์โทรศัพท์ (เช่น 0812345678) ส่งมาให้ชื่นใจอย่างน้อย 1 เบอร์นะครับ'
      });
    } else {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `ยืนยันว่าจะส่งข้อความ SOS ฉุกเฉิน ไปยังเบอร์ ${user.phone} ใช่หรือไม่ครับ?`,
        quickReply: {
          items: [
            {
              type: 'action',
              action: { type: 'message', label: '🚨 ยืนยันส่ง SOS', text: 'ยืนยันส่ง SOS' }
            },
            {
              type: 'action',
              action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก SOS' }
            }
          ]
        }
      });
    }
  }

  // ==========================================
  // Flow: ส่งคำอวยพร (รูปสวัสดีประจำวัน)
  // ==========================================
  if (text === 'ส่งคำอวยพร') {
    // เรียกใช้ฟังก์ชันสุ่มรูปที่เราเขียนแยกไว้
    const replyMessage = await getGreetingMessage();
    return client.replyMessage(event.replyToken, replyMessage);
  }

  // ==========================================
  // Flow 2: รอรับเบอร์โทรศัพท์ (สถานะ WAITING_PHONE)
  // ==========================================
  if (user.state === 'WAITING_PHONE') {
    const phoneRegex = /^[0-9]{9,10}$/;
    const cleanPhoneText = text.replace(/[\s-]/g, ''); 

    if (phoneRegex.test(cleanPhoneText)) {
      user.phone = cleanPhoneText; 
      user.state = 'NORMAL';       
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `น้องชื่นใจบันทึกเบอร์ฉุกเฉิน (${user.phone}) เรียบร้อยแล้วครับ! 🗂\n\nหากมีเหตุฉุกเฉิน สามารถกด "ปุ่มฉุกเฉิน" ได้ทุกเมื่อเลยนะครับ`
      });
    } else {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้องครับ รบกวนพิมพ์เป็นตัวเลขติดกัน (เช่น 0812345678) ใหม่อีกครั้งนะครับ'
      });
    }
  }

  // ==========================================
  // Flow 3: ยืนยันส่ง SOS -> ยิง SMS
  // ==========================================
  if (text === 'ยืนยันส่ง SOS' && user.phone) {
    const smsText = `🚨 ด่วน! มีการแจ้งเหตุฉุกเฉิน (SOS) จากผู้ใช้งานแอปชื่นใจ โปรดติดต่อกลับหรือตรวจสอบทันที!`;
    await sendSms(user.phone, smsText);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ดำเนินการส่ง SMS แจ้งเหตุฉุกเฉินไปยังลูกหลานหรือเบอร์ที่ตั้งไว้เรียบร้อยแล้วครับ น้องชื่นใจขอให้คุณพี่ปลอดภัยนะครับ 💙'
    });
  }

  if (text === 'ยกเลิก SOS') {
    user.state = 'NORMAL'; // เคลียร์สถานะเผื่อไว้
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ยกเลิกการส่งข้อความฉุกเฉินเรียบร้อยแล้วครับ'
    });
  }

  return Promise.resolve(null);
}

// ==========================================
// 4. ฟังก์ชันส่ง SMS จริงด้วย ThaiBulkSMS
// ==========================================
async function sendSms(phoneNumber, message) {
  console.log(`[SMS Gateway] 📡 กำลังส่ง SMS ไปที่เบอร์: ${phoneNumber}`);
  
  try {
    // เตรียมข้อมูลที่จะส่งไปให้ ThaiBulkSMS (ใช้ URLSearchParams ตามมาตรฐานของ API)
    const params = new URLSearchParams();
    params.append('apiKey', process.env.THAIBULKSMS_API_KEY);
    params.append('apiSecret', process.env.THAIBULKSMS_API_SECRET);
    params.append('msisdn', phoneNumber); // เบอร์โทรปลายทาง
    params.append('text', message);       // ข้อความที่จะส่ง

    // ยิง Request ไปที่ API ของ ThaiBulkSMS
    const response = await axios.post('https://api-v2.thaibulksms.com/sms', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log("✅ ส่ง SMS สำเร็จ! ข้อมูลจากระบบ:", response.data);
    return true;

  } catch (error) {
    // ถ้าส่งไม่สำเร็จ จะแสดง Error ตรงนี้
    console.error("❌ ส่ง SMS ล้มเหลว:");
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

// 5. Export ตัว Router เพื่อให้ server.js นำไปใช้งาน
module.exports = router;