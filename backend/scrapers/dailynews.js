const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeDailynews() {
  const url = "https://www.dailynews.co.th/";
  const { data } = await axios.get(url);

  const $ = cheerio.load(data);

  const news = [];

  $("article").each((i, el) => {
    const title = $(el).find("h2").text();
    const link = $(el).find("a").attr("href");
    const image = $(el).find("img").attr("src");

    news.push({
      title,
      image,
      link,
      source: "dailynews",
    });
  });

  return news;
}

module.exports = scrapeDailynews;