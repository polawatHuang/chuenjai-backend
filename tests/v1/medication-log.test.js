const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

let token;
let elderlyId;
let medicationId;
let logId;

beforeAll(async () => {
  token = await getToken();
  const prisma = require("../../config/prisma");

  const elderly = await prisma.elderly.create({
    data: {
      organizationId: BigInt(ctx().orgId),
      firstName: "ทดสอบ",
      lastName:  "บันทึกยา",
      status:    "ACTIVE",
    },
  });
  elderlyId = elderly.id.toString();

  const med = await prisma.medication.create({
    data: {
      elderlyId:      elderly.id,
      medicationName: "ยาทดสอบ",
      isActive:       true,
    },
  });
  medicationId = med.id.toString();
});

afterAll(async () => {
  const prisma = require("../../config/prisma");
  if (logId) await prisma.medicationLog.delete({ where: { id: BigInt(logId) } }).catch(() => {});
  await prisma.medication.delete({ where: { id: BigInt(medicationId) } }).catch(() => {});
  await prisma.elderly.delete({ where: { id: BigInt(elderlyId) } }).catch(() => {});
});

describe("GET /api/v1/medication-logs", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).get("/api/v1/medication-logs")).status).toBe(401);
  });

  it("returns list for authenticated user", async () => {
    const res = await request(app)
      .get(`/api/v1/medication-logs?elderlyId=${elderlyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe("POST /api/v1/medication-logs", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).post("/api/v1/medication-logs").send({})).status).toBe(401);
  });

  it("creates a medication log", async () => {
    const res = await request(app)
      .post("/api/v1/medication-logs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        medicationId,
        elderlyId,
        status:       "TAKEN",
        source:       "OFFICER",
        scheduledTime: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    logId = res.body.data.id;
  });

  it("rejects an invalid status value", async () => {
    const res = await request(app)
      .post("/api/v1/medication-logs")
      .set("Authorization", `Bearer ${token}`)
      .send({ medicationId, elderlyId, status: "INVALID_STATUS" });
    expect(res.status).toBe(400);
  });
});
