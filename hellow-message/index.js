const fs = require('fs');
const path = require('path');

async function getGreetingMessage() {
  // 1. หาวันปัจจุบัน (อิงตาม Timezone ประเทศไทย UTC+7)
  const daysInThai = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  const now = new Date();
  const thaiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const todayStr = daysInThai[thaiTime.getDay()]; 
  
  // จะได้ชื่อโฟลเดอร์ เช่น "สวัสดีวันพฤหัส"
  const folderName = `สวัสดีวัน${todayStr}`; 

  // 2. กำหนด Path บนเซิร์ฟเวอร์ Plesk ของคุณ
  // ⚠️ สำคัญ: คุณต้องเปลี่ยน basePath ให้ตรงกับ Path จริงๆ ในเซิร์ฟเวอร์ Plesk ของคุณ
  // โดยปกติ Plesk จะอยู่ประมาณ /var/www/vhosts/ชื่อโดเมนหลัก/ชื่อซับโดเมน/img
  const basePath = process.env.IMG_BASE_PATH || '/var/www/vhosts/xn--12clh6dc4eub3cdb2qwc.com/news.xn--12clh6dc4eub3cdb2qwc.com/img';
  const imgFolderPath = path.join(basePath, folderName);

  try {
    // 3. อ่านไฟล์ในโฟลเดอร์
    const files = fs.readdirSync(imgFolderPath);
    
    // กรองเอาเฉพาะไฟล์รูปภาพ
    const images = files.filter(file => file.match(/\.(jpg|jpeg|png)$/i));
    
    if (images.length === 0) {
      return { 
        type: 'text', 
        text: `วันนี้วัน${todayStr} น้องชื่นใจยังไม่มีรูปเลยครับ เดี๋ยวรีบหามาให้นะครับ!` 
      };
    }

    // 4. สุ่มเลือก 1 รูป
    const randomImage = images[Math.floor(Math.random() * images.length)];

    // 5. สร้าง URL โดเมนของคุณเพื่อส่งให้ LINE
    const baseUrl = 'https://news.xn--12clh6dc4eub3cdb2qwc.com/img';
    
    // ต้องเข้ารหัส URL (encodeURI) เพราะชื่อโฟลเดอร์เป็นภาษาไทย ไม่งั้น LINE จะไม่อ่าน
    const imageUrl = encodeURI(`${baseUrl}/${folderName}/${randomImage}`);

    // ส่งโครงสร้างข้อความแบบรูปภาพกลับไป
    return {
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl // รูปย่อโชว์ในแชท (ใช้ลิงก์เดียวกันได้)
    };

  } catch (error) {
    console.error(`❌ ไม่สามารถเข้าถึงโฟลเดอร์รูปภาพได้ที่ ${imgFolderPath}:`, error);
    return { 
      type: 'text', 
      text: 'ขออภัยครับ ตอนนี้น้องชื่นใจหารูปอวยพรไม่เจอ รบกวนลองใหม่ทีหลังนะครับ' 
    };
  }
}

module.exports = { getGreetingMessage };