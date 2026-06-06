const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

let token;
let elderlyId;
let medicationId;

beforeAll(async () => {
  token = await getToken();
  const prisma = require("../../config/prisma");
  const elderly = await prisma.elderly.create({
    data: {
      organizationId: BigInt(ctx().orgId),
      firstName: "ทดสอบ",
      lastName:  "ยา",
      status:    "ACTIVE",
    },
  });
  elderlyId = elderly.id.toString();
});

afterAll(async () => {
  const prisma = require("../../config/prisma");
  if (medicationId) await prisma.medication.delete({ where: { id: BigInt(medicationId) } }).catch(() => {});
  await prisma.elderly.delete({ where: { id: BigInt(elderlyId) } }).catch(() => {});
});

describe("GET /api/v1/medications", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).get("/api/v1/medications")).status).toBe(401);
  });

  it("returns list for authenticated user", async () => {
    const res = await request(app)
      .get(`/api/v1/medications?elderlyId=${elderlyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /api/v1/medications", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).post("/api/v1/medications").send({})).status).toBe(401);
  });

  it("creates a medication record", async () => {
    const res = await request(app)
      .post("/api/v1/medications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        elderlyId:      elderlyId,
        medicationName: "เมทฟอร์มิน",
        dosage:         "500mg",
        frequency:      "วันละ 2 ครั้ง",
        isActive:       true,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    medicationId = res.body.data.id;
  });
});

describe("PUT /api/v1/medications/:id", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).put("/api/v1/medications/1").send({})).status).toBe(401);
  });

  it("updates a medication record", async () => {
    if (!medicationId) return;
    const res = await request(app)
      .put(`/api/v1/medications/${medicationId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dosage: "1000mg" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("DELETE /api/v1/medications/:id", () => {
  it("deletes a medication record", async () => {
    if (!medicationId) return;
    const res = await request(app)
      .delete(`/api/v1/medications/${medicationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    medicationId = null;
  });
});
