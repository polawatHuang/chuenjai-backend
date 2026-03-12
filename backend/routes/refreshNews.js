const pool = require("../db");
const scrapeDailynews = require("../scrapers/dailynews");
const scrapeThairath = require("../scrapers/thairath");

async function refreshNews() {

  try {

    console.log("Starting news refresh...");

    // 1️⃣ delete news older than 7 days
    const [deleted] = await pool.query(`
      DELETE FROM news
      WHERE created_at < NOW() - INTERVAL 7 DAY
    `);

    console.log("Old news deleted:", deleted.affectedRows);

    // 2️⃣ scrape news
    const dailynews = await scrapeDailynews();
    const thairath = await scrapeThairath();

    const allNews = [...dailynews, ...thairath];

    console.log("Scraped news:", allNews.length);

    let inserted = 0;

    for (const n of allNews) {

      if (!n.title || !n.link) continue;

      try {

        await pool.query(
          `
          INSERT INTO news
          (title, image_url, source, source_url, published_at)
          VALUES (?, ?, ?, ?, NOW())
          `,
          [
            n.title,
            n.image || null,
            n.source,
            n.link
          ]
        );

        inserted++;

      } catch (err) {

        // duplicate protection
        // if (err.code !== "ER_DUP_ENTRY") {
        //  console.error("Insert error:", err.message);
        // }

        console.error("🚨 DATABASE ERROR:", err.message);

      }

    }

    console.log("Inserted:", inserted);

    return {
      status: "ok",
      inserted,
      deleted: deleted.affectedRows,
      scraped: allNews.length
    };

  } catch (err) {

    console.error("Refresh news failed:", err);

    return {
      status: "error",
      message: err.message
    };

  }

}

module.exports = refreshNews;