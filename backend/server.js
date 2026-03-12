require("dotenv").config();
const cron = require("node-cron");
const express = require("express");
const cors = require("cors");

require("./cron");

const newsRoutes = require("./routes/news");
const healthRoutes = require("./routes/health");
const refreshNews = require("./routes/refreshNews");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/news", newsRoutes);
// Manual trigger for testing
app.get("/api/news-refresh", async (req, res) => {
  console.log("Manual refresh triggered...");
  const result = await refreshNews();
  res.json(result);
});

app.use("/api/health", healthRoutes);

cron.schedule("0 7 * * *", async () => {
  await refreshNews();
});

app.listen(4000, () => {
  console.log("Server running on port 4000");
});