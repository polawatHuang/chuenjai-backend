const cron = require("node-cron");
const pool = require("./db");

const scrapeThairath = require("./scrapers/thairath");
const scrapeDailynews = require("./scrapers/dailynews");

cron.schedule("0 7 * * *", async () => {
  console.log("Running daily news job");

  await pool.query(
    "DELETE FROM news WHERE created_at < NOW() - INTERVAL '7 days'"
  );

  const news1 = await scrapeThairath();
  const news2 = await scrapeDailynews();

  const news = [...news1, ...news2];

  for (const n of news) {
    await pool.query(
      `INSERT INTO news (title,image_url,source,source_url,published_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [n.title, n.image, n.source, n.link]
    );
  }
});