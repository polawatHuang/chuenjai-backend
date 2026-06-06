const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

let token;
let elderlyId;

beforeAll(async () => {
  token = await getToken();
});

afterAll(async () => {
  if (elderlyId) {
    const prisma = require("../../config/prisma");
    await prisma.elderly.delete({ where: { id: BigInt(elderlyId) } }).catch(() => {});
  }
});

describe("GET /api/v1/elderlies", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/v1/elderlies");
    expect(res.status).toBe(401);
  });

  it("returns paginated list for authenticated user", async () => {
    const res = await request(app)
      .get("/api/v1/elderlies")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
  });

  it("accepts pagination query params", async () => {
    const res = await request(app)
      .get("/api/v1/elderlies?page=1&limit=5")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(5);
  });
});

describe("POST /api/v1/elderlies", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/v1/elderlies").send({});
    expect(res.status).toBe(401);
  });

  it("creates a new elderly record", async () => {
    const res = await request(app)
      .post("/api/v1/elderlies")
      .set("Authorization", `Bearer ${token}`)
      .send({
        firstName:  "สมชาย",
        lastName:   "ทดสอบ",
        gender:     "MALE",
        age:        75,
        phone:      "0800000001",
        status:     "ACTIVE",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    elderlyId = res.body.data.id;
  });

  it("rejects an invalid gender value", async () => {
    const res = await request(app)
      .post("/api/v1/elderlies")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: "ROBOT" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/elderlies/:id", () => {
  it("returns 404 for a non-existent ID", async () => {
    const res = await request(app)
      .get("/api/v1/elderlies/9999999999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns the elderly record by ID", async () => {
    if (!elderlyId) return;
    const res = await request(app)
      .get(`/api/v1/elderlies/${elderlyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(elderlyId);
  });
});

describe("PUT /api/v1/elderlies/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/v1/elderlies/1").send({});
    expect(res.status).toBe(401);
  });

  it("updates an existing elderly record", async () => {
    if (!elderlyId) return;
    const res = await request(app)
      .put(`/api/v1/elderlies/${elderlyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ age: 76, status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("DELETE /api/v1/elderlies/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/v1/elderlies/1");
    expect(res.status).toBe(401);
  });

  it("deletes an existing elderly record", async () => {
    if (!elderlyId) return;
    const res = await request(app)
      .delete(`/api/v1/elderlies/${elderlyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    elderlyId = null; // already deleted; skip afterAll cleanup
  });
});
