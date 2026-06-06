require("dotenv").config();
const cron       = require("node-cron");
const app        = require("./app");
const refreshNews = require("./services/news.service");
const { bootstrap } = require("./jobs/bootstrap");

require("./cron");
cron.schedule("0 7 * * *", refreshNews);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bootstrap();
});
