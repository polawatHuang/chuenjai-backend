const request = require("supertest");
const db = require("../../config/db");
const { app } = require("../helpers");

const TEST_PHONE = "0999888777";

afterAll(async () => {
  await db.query("DELETE FROM phone_reports WHERE phone_number = ?", [TEST_PHONE]);
});

describe("GET /api/check-number/:phone", () => {
  it("returns safe=true for an unreported number", async () => {
    const res = await request(app).get("/api/check-number/0111222333");
    expect(res.status).toBe(200);
    expect(res.body.safe).toBe(true);
  });

  it("strips non-digit characters from phone number", async () => {
    const res = await request(app).get("/api/check-number/011-122-2333");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });
});

describe("POST /api/report-number", () => {
  it("returns 400 when phone or report_type is missing", async () => {
    const res = await request(app).post("/api/report-number").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when report_type is missing", async () => {
    const res = await request(app)
      .post("/api/report-number")
      .send({ phone: TEST_PHONE });
    expect(res.status).toBe(400);
  });

  it("successfully reports a scam number", async () => {
    const res = await request(app).post("/api/report-number").send({
      phone:       TEST_PHONE,
      report_type: "call_center",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("returns safe=false after reporting a number", async () => {
    const res = await request(app).get(`/api/check-number/${TEST_PHONE}`);
    expect(res.status).toBe(200);
    expect(res.body.safe).toBe(false);
    expect(res.body.data).toBeDefined();
  });
});
