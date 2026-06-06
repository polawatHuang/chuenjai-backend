const db = require("../config/db");

const check = async (req, res) => {
  const start = Date.now();

  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const baseUrl = `${protocol}://${req.headers.host}`;

  let dbStatus = "ok";
  try { await db.query("SELECT 1"); } catch (e) { dbStatus = `error (${e.message})`; }

  async function probe(url, method = "GET", body = null) {
    try {
      const opts = { method, signal: AbortSignal.timeout(3000) };
      if (body) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(body);
      }
      const r = await fetch(url, opts);
      return r.ok || r.status === 400 || r.status === 401 || r.status === 404
        ? "ok"
        : `error (${r.status})`;
    } catch (e) {
      return `down (${e.message})`;
    }
  }

  const [newsStatus, checkNumberStatus, reportNumberStatus, itemsStatus,
    luckySpinWinnersStatus, usersStatus, livekitTokenStatus] = await Promise.all([
    probe(`${baseUrl}/api/news`),
    probe(`${baseUrl}/api/check-number/0000000000`),
    probe(`${baseUrl}/api/report-number`, "POST", {}),
    probe(`${baseUrl}/api/items`),
    probe(`${baseUrl}/api/lucky-spin/winners`),
    probe(`${baseUrl}/api/users/0`),
    probe(`${baseUrl}/api/get-token`, "POST", {}),
  ]);

  const allOk = [dbStatus, newsStatus, checkNumberStatus, reportNumberStatus,
    itemsStatus, luckySpinWinnersStatus, usersStatus, livekitTokenStatus]
    .every((s) => s === "ok");

  res.json({
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      api: "ok",
      database: dbStatus,
      news_api: newsStatus,
      check_number_api: checkNumberStatus,
      report_number_api: reportNumberStatus,
      rewards_items_api: itemsStatus,
      rewards_winners_api: luckySpinWinnersStatus,
      users_api: usersStatus,
      livekit_token_api: livekitTokenStatus,
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
    },
    performance: { response_time_ms: Date.now() - start },
  });
};

module.exports = { check };
