require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./cron");

const newsRoutes = require("./routes/news");
const healthRoutes = require("./routes/health");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/news", newsRoutes);
app.use("/api/health", healthRoutes);

app.listen(4000, () => {
  console.log("Server running on port 4000");
});