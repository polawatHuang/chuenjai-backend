const Parser = require('rss-parser');

const parser = new Parser({
  customFields: {
    item: ['enclosure', 'content:encoded', 'description'],
  }
});

async function scrapeRSS(feedUrl, sourceName) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const news = [];

    for (const item of feed.items) {
      let imageUrl = null;
      if (item.enclosure && item.enclosure.url) {
        imageUrl = item.enclosure.url;
      } else if (item['content:encoded']) {
        const match = item['content:encoded'].match(/src="(https?:\/\/[^"]+)"/);
        if (match) imageUrl = match[1];
      } else if (item.description) {
        const match = item.description.match(/src="(https?:\/\/[^"]+)"/);
        if (match) imageUrl = match[1];
      }

      // 🕵️‍♂️ เพิ่มส่วนนี้: ดึงเนื้อหาข่าว (พยายามหาจากหลายๆ แท็กของ RSS)
      // บางเว็บใช้ content:encoded บางเว็บใช้ description
      let newsContent = item['content:encoded'] || item.content || item.description || item.contentSnippet || "";
      
      // ลบ HTML Tags ออกบางส่วนเพื่อความสะอาด (ถ้าอยากเก็บ HTML ไว้โชว์บนเว็บ ก็เอา .replace() ออกได้ครับ)
      newsContent = newsContent.replace(/<[^>]+>/g, '').trim();

      if (item.title && item.link) {
        news.push({
          title: item.title.trim(),
          content: newsContent, // ✅ ส่งเนื้อหาเข้าไปใน Array ด้วย
          image: imageUrl,
          link: item.link.trim(),
          source: sourceName,
        });
      }
    }
    
    return news;
  } catch (error) {
    console.error(`❌ Error pulling RSS from ${sourceName}:`, error.message);
    return [];
  }
}

module.exports = scrapeRSS;