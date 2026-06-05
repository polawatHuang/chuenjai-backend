const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeThairath() {
  const url = "https://www.thairath.co.th/news";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const news = [];

  // 🕵️‍♂️ ดักจับ class หลายๆ แบบเผื่อไทยรัฐเปลี่ยน
  $(".item, article, .news-item, .box-news").each((i, el) => {
    let title = $(el).find("h3").text().trim();
    if (!title) title = $(el).find("h2").text().trim();
    if (!title) title = $(el).find("a").text().trim();

    let link = $(el).find("a").attr("href");
    let image = $(el).find("img").attr("src");

    if (link && !link.startsWith("http")) {
      link = "https://www.thairath.co.th" + link;
    }

    if (title && link) {
      news.push({
        title: title.replace(/\s+/g, ' '),
        image: image || null,
        link: link,
        source: "thairath",
      });
    }
  });

  return news;
}

module.exports = scrapeThairath;