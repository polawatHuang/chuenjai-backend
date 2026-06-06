const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

let token;
let elderlyId;
let alertId;

beforeAll(async () => {
  token = await getToken();
  const prisma = require("../../config/prisma");

  const elderly = await prisma.elderly.create({
    data: {
      organizationId: BigInt(ctx().orgId),
      firstName: "ทดสอบ",
      lastName:  "แจ้งเตือน",
      status:    "ACTIVE",
    },
  });
  elderlyId = elderly.id.toString();

  const alert = await prisma.alert.create({
    data: {
      elderlyId: elderly.id,
      alertType: "MEDICATION",
      severity:  "HIGH",
      title:     "Test Alert",
      status:    "OPEN",
    },
  });
  alertId = alert.id.toString();
});

afterAll(async () => {
  const prisma = require("../../config/prisma");
  await prisma.alert.deleteMany({ where: { elderlyId: BigInt(elderlyId) } }).catch(() => {});
  await prisma.elderly.delete({ where: { id: BigInt(elderlyId) } }).catch(() => {});
});

describe("GET /api/v1/alerts", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).get("/api/v1/alerts")).status).toBe(401);
  });

  it("returns paginated alert list", async () => {
    const res = await request(app)
      .get("/api/v1/alerts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
  });

  it("filters alerts by status", async () => {
    const res = await request(app)
      .get("/api/v1/alerts?status=OPEN")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((a) => expect(a.status).toBe("OPEN"));
  });

  it("filters alerts by severity", async () => {
    const res = await request(app)
      .get("/api/v1/alerts?severity=HIGH")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/alerts/:id", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).patch("/api/v1/alerts/1").send({})).status).toBe(401);
  });

  it("rejects an invalid status value", async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "INVALID" });
    expect(res.status).toBe(400);
  });

  it("updates alert status to IN_PROGRESS", async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("IN_PROGRESS");
  });

  it("resolves an alert and sets resolvedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("RESOLVED");
    expect(res.body.data.resolvedAt).toBeTruthy();
  });
});
