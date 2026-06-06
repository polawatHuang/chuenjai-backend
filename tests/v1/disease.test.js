const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

let token;
let elderlyId;
let diseaseId;

beforeAll(async () => {
  token = await getToken();
  const prisma = require("../../config/prisma");
  const elderly = await prisma.elderly.create({
    data: {
      organizationId: BigInt(ctx().orgId),
      firstName: "ทดสอบ",
      lastName:  "โรค",
      status:    "ACTIVE",
    },
  });
  elderlyId = elderly.id.toString();
});

afterAll(async () => {
  const prisma = require("../../config/prisma");
  if (diseaseId) await prisma.disease.delete({ where: { id: BigInt(diseaseId) } }).catch(() => {});
  await prisma.elderly.delete({ where: { id: BigInt(elderlyId) } }).catch(() => {});
});

describe("GET /api/v1/diseases", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/v1/diseases");
    expect(res.status).toBe(401);
  });

  it("returns disease list for an elderly", async () => {
    const res = await request(app)
      .get(`/api/v1/diseases?elderlyId=${elderlyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /api/v1/diseases", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/v1/diseases").send({});
    expect(res.status).toBe(401);
  });

  it("creates a disease record", async () => {
    const res = await request(app)
      .post("/api/v1/diseases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        elderlyId:   elderlyId,
        diseaseName: "เบาหวาน",
        severity:    "MEDIUM",
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    diseaseId = res.body.data.id;
  });
});

describe("PUT /api/v1/diseases/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).put("/api/v1/diseases/1").send({});
    expect(res.status).toBe(401);
  });

  it("updates a disease record", async () => {
    if (!diseaseId) return;
    const res = await request(app)
      .put(`/api/v1/diseases/${diseaseId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ severity: "HIGH" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("DELETE /api/v1/diseases/:id", () => {
  it("deletes a disease record", async () => {
    if (!diseaseId) return;
    const res = await request(app)
      .delete(`/api/v1/diseases/${diseaseId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    diseaseId = null;
  });
});
