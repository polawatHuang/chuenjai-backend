const request = require("supertest");
const db = require("../../config/db");
const { app } = require("../helpers");

let logId;

afterAll(async () => {
  if (logId) await db.query("DELETE FROM lucky_spin_log WHERE id = ?", [logId]);
});

describe("POST /api/lucky-spin/log", () => {
  it("creates a spin log entry", async () => {
    const res = await request(app).post("/api/lucky-spin/log").send({
      item_name:      "Gold Prize",
      winner_name:    "Test Winner",
      winner_phone:   "0800000000",
      winner_address: "123 Test St",
    });
    expect(res.status).toBe(201);
    expect(res.body.insertId).toBeDefined();
    logId = res.body.insertId;
  });
});

describe("GET /api/lucky-spin/winners", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/lucky-spin/winners");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns at most 10 winners", async () => {
    const res = await request(app).get("/api/lucky-spin/winners");
    expect(res.body.length).toBeLessThanOrEqual(10);
  });

  it("each winner has item_name and winner_name fields", async () => {
    const res = await request(app).get("/api/lucky-spin/winners");
    res.body.forEach((w) => {
      expect(w).toHaveProperty("item_name");
      expect(w).toHaveProperty("winner_name");
    });
  });
});
