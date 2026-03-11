const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeThairath() {
  const url = "https://www.thairath.co.th/news";
  const { data } = await axios.get(url);

  const $ = cheerio.load(data);

  const news = [];

  $(".item").each((i, el) => {
    const title = $(el).find("h3").text();
    const link = $(el).find("a").attr("href");
    const image = $(el).find("img").attr("src");

    news.push({
      title,
      image,
      link: "https://www.thairath.co.th" + link,
      source: "thairath",
    });
  });

  return news;
}

module.exports = scrapeThairath;