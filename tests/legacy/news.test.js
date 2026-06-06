const request = require("supertest");
const db = require("../../config/db");
const { app } = require("../helpers");

let insertedId;

beforeAll(async () => {
  const [result] = await db.query(
    "INSERT INTO news (title, source, published_at) VALUES (?, ?, NOW())",
    ["Test News Article", "test_source"]
  );
  insertedId = result.insertId;
});

afterAll(async () => {
  if (insertedId) await db.query("DELETE FROM news WHERE id = ?", [insertedId]);
});

describe("GET /api/news", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/news");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/news/:id", () => {
  it("returns 200 for an existing news item", async () => {
    const res = await request(app).get(`/api/news/${insertedId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(insertedId);
    expect(res.body.title).toBe("Test News Article");
  });

  it("returns 404 for a non-existent news item", async () => {
    const res = await request(app).get("/api/news/9999999");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/news/refresh", () => {
  it("returns 200 or 500 (depends on RSS availability)", async () => {
    const res = await request(app).post("/api/news/refresh");
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.status).toBe("ok");
      expect(typeof res.body.inserted).toBe("number");
    }
  });
});
