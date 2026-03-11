const express = require("express");
const cors = require("cors");

require("./cron");

const newsRoutes = require("./routes/news");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/news", newsRoutes);

app.listen(4000, () => {
  console.log("News API running on port 4000");
});