const request = require("supertest");
const { app } = require("../helpers");

describe("GET /api/health", () => {
  it("returns 200 with a status field", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(["ok", "degraded"]).toContain(res.body.status);
  });

  it("includes services, system, and performance blocks", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.services).toBeDefined();
    expect(res.body.system).toBeDefined();
    expect(res.body.performance).toBeDefined();
  });

  it("includes database and api service keys", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.services.api).toBe("ok");
    expect(res.body.services.database).toBeDefined();
  });

  it("includes node_version and uptime in system block", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body.system.node_version).toBeDefined();
    expect(typeof res.body.system.uptime).toBe("number");
  });
});
