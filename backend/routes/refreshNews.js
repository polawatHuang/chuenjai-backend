const pool = require("../db");
// เรียกใช้ RSS Scraper ตัวใหม่ของเรา
const scrapeRSS = require("../scrapers/rssNews");

async function refreshNews() {
  try {
    console.log("Starting reliable RSS news refresh...");

    // 1️⃣ delete news older than 7 days
    const [deleted] = await pool.query(`
      DELETE FROM news
      WHERE created_at < NOW() - INTERVAL 7 DAY
    `);

    // 2️⃣ ดึงข่าวจาก RSS Feeds (ใส่เพิ่มได้ตามใจชอบ!)
    console.log("Fetching feeds...");
    const thairath = await scrapeRSS("https://www.thairath.co.th/rss/news", "thairath");
    const khaosod = await scrapeRSS("https://www.khaosod.co.th/feed", "khaosod");
    const matichon = await scrapeRSS("https://www.matichon.co.th/feed", "matichon");

    const allNews = [...thairath, ...khaosod, ...matichon];
    console.log(`Scraped news: ${allNews.length} items`);

    let inserted = 0;
    let skippedDuplicate = 0;
    let skippedEmpty = 0;

    for (let i = 0; i < allNews.length; i++) {
      const n = allNews[i];

      // โชว์ตัวอย่างข่าวแรกให้ชื่นใจ
      if (i === 0) console.log("👀 ข่าวตัวอย่าง:", n);

      if (!n.title || !n.link) {
        skippedEmpty++;
        continue;
      }

      try {
        const [existing] = await pool.query(
          "SELECT id FROM news WHERE source_url = ?",
          [n.link]
        );

        if (existing.length > 0) {
          skippedDuplicate++;
          continue; 
        }

        await pool.query(
          `
          INSERT INTO news
          (title, content, image_url, source, source_url, published_at)
          VALUES (?, ?, ?, ?, ?, NOW())
          `,
          [
            n.title, 
            n.content || null,
            n.image || null, 
            n.source, 
            n.link
          ]
        );

        inserted++;

      } catch (err) {
        console.error("🚨 DATABASE ERROR:", err.message);
      }
    }

    console.log(`📊 สรุป: Inserted: ${inserted} | แหว่ง: ${skippedEmpty} | ซ้ำ: ${skippedDuplicate}`);

    return {
      status: "ok",
      inserted,
      scraped: allNews.length
    };

  } catch (err) {
    console.error("Refresh news failed:", err);
    return { status: "error", message: err.message };
  }
}

module.exports = refreshNews;