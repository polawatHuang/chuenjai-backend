const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeDailynews() {
  const url = "https://www.dailynews.co.th/";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const news = [];

  $("article").each((i, el) => {
    // 🕵️‍♂️ ค้นหาชื่อข่าวจากหลายๆ แท็ก เผื่อเว็บเปลี่ยนโครงสร้าง
    let title = $(el).find("h2").text().trim();
    if (!title) title = $(el).find("h3").text().trim();
    if (!title) title = $(el).find(".title").text().trim();
    if (!title) title = $(el).find("a").text().trim(); // ท่าไม้ตาย หาจากแท็ก a เลย

    const link = $(el).find("a").attr("href");
    const image = $(el).find("img").attr("src");

    // ถ้าดึงมาได้ทั้งชื่อและลิงก์ (ไม่เป็นค่าว่าง) ถึงจะเก็บเข้า Array
    if (title && link) {
      news.push({
        title: title.replace(/\s+/g, ' '), // จัดระเบียบช่องว่างที่เกินมา
        image: image || null,
        link: link,
        source: "dailynews",
      });
    }
  });

  return news;
}

module.exports = scrapeDailynews;