const cron = require("node-cron");
const db = require("./config/db");

const scrapeThairath  = require("./scrapers/thairath");
const scrapeDailynews = require("./scrapers/dailynews");

cron.schedule("0 7 * * *", async () => {
  console.log("[Cron] Running daily news scrape job");

  await db.query("DELETE FROM news WHERE created_at < NOW() - INTERVAL 7 DAY");

  const [news1, news2] = await Promise.all([scrapeThairath(), scrapeDailynews()]);
  const allNews = [...news1, ...news2];

  for (const n of allNews) {
    await db.query(
      "INSERT INTO news (title,image_url,source,source_url,published_at) VALUES (?,?,?,?,NOW())",
      [n.title, n.image, n.source, n.link]
    );
  }

  console.log(`[Cron] Inserted ${allNews.length} news items`);
});
