const db = require("../config/db");
const scrapeRSS = require("../scrapers/rssNews");

async function refreshNews() {
  try {
    console.log("Starting RSS news refresh...");

    await db.query("DELETE FROM news WHERE created_at < NOW() - INTERVAL 3 DAY");

    const [thairath, khaosod, matichon] = await Promise.all([
      scrapeRSS("https://www.thairath.co.th/rss/news", "thairath"),
      scrapeRSS("https://www.khaosod.co.th/feed", "khaosod"),
      scrapeRSS("https://www.matichon.co.th/feed", "matichon"),
    ]);

    const allNews = [...thairath, ...khaosod, ...matichon];
    console.log(`Scraped ${allNews.length} items`);

    let inserted = 0;
    let skipped = 0;

    for (const n of allNews) {
      if (!n.title || !n.link) { skipped++; continue; }

      const [existing] = await db.query(
        "SELECT id FROM news WHERE source_url = ?",
        [n.link]
      );
      if (existing.length > 0) { skipped++; continue; }

      await db.query(
        "INSERT INTO news (title, content, image_url, source, source_url, published_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [n.title, n.content || null, n.image || null, n.source, n.link]
      );
      inserted++;
    }

    console.log(`Done: inserted=${inserted} skipped=${skipped}`);
    return { status: "ok", inserted, scraped: allNews.length };
  } catch (err) {
    console.error("[NewsService] refreshNews failed:", err);
    return { status: "error", message: err.message };
  }
}

module.exports = refreshNews;
