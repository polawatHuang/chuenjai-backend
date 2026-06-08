require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const app = express();

// ── Webhooks — must be before express.json (LINE requires raw body) ──────────
try {
  const sosRoutes = require("./sos-messaging-system");
  app.use("/webhook", sosRoutes);
} catch {
  // sos-messaging-system is optional; skip in test environments
}
app.use("/webhook", require("./routes/line-webhook.routes"));

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Legacy API routes ─────────────────────────────────────────────────────────
app.use("/api/health",     require("./routes/health.routes"));
app.use("/api/news",       require("./routes/news.routes"));
app.use("/api/orders",     require("./routes/orders.routes"));
app.use("/api",            require("./routes/users.routes"));       // /api/register, /api/login, /api/users/...
app.use("/api/items",      require("./routes/items.routes"));
app.use("/api/lucky-spin", require("./routes/lucky-spin.routes"));
app.use("/api",            require("./routes/phone-report.routes")); // /api/check-number/:phone, /api/report-number
app.use("/api",            require("./routes/livekit.routes"));      // /api/get-token

// ── Enterprise API v1 routes ──────────────────────────────────────────────────
app.use("/api/v1/auth",            require("./routes/auth.routes"));
app.use("/api/v1/elderlies",       require("./routes/elderly.routes"));
app.use("/api/v1/diseases",        require("./routes/disease.routes"));
app.use("/api/v1/medications",     require("./routes/medication.routes"));
app.use("/api/v1/medication-logs", require("./routes/medication-log.routes"));
app.use("/api/v1/voice",              require("./routes/voice.routes"));
app.use("/api/v1/alerts",             require("./routes/alert.routes"));
app.use("/api/v1/medication-center",  require("./routes/medication-center.routes"));
app.use("/api/v1/appointments",       require("./routes/appointment.routes"));
app.use("/api/v1/call-center",        require("./routes/call-center.routes"));
app.use("/api/v1/analytics",          require("./routes/analytics.routes"));
app.use("/api/v1/notifications",      require("./routes/notification.routes"));
app.use("/api/v1/reports",            require("./routes/report.routes"));
app.use("/api/v1/settings",           require("./routes/settings.routes"));
app.use("/api/v1/audit-logs",         require("./routes/audit-log.routes"));

module.exports = app;
