const request = require("supertest");
const db = require("../../config/db");
const { app } = require("../helpers");

let itemId;

beforeAll(async () => {
  const [result] = await db.query(
    "INSERT INTO items (name, point, img_url) VALUES (?, ?, ?)",
    ["Test Prize", 100, "https://example.com/prize.png"]
  );
  itemId = result.insertId;
});

afterAll(async () => {
  if (itemId) await db.query("DELETE FROM items WHERE id = ?", [itemId]);
});

describe("GET /api/items", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/items");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("items are sorted by point ascending", async () => {
    const res = await request(app).get("/api/items");
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].point).toBeGreaterThanOrEqual(res.body[i - 1].point);
    }
  });
});

describe("POST /api/items/redeem", () => {
  it("returns 400 when user_id and item_id are missing", async () => {
    const res = await request(app).post("/api/items/redeem").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid user_id (unauthorized)", async () => {
    const res = await request(app)
      .post("/api/items/redeem")
      .send({ user_id: 1, item_id: itemId });
    expect(res.status).toBe(400);
  });
});
