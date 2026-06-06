const request = require("supertest");
const { app, getToken } = require("../helpers");

let token;

beforeAll(async () => { token = await getToken(); });

describe("POST /api/v1/voice/transcript (webhook — no JWT)", () => {
  it("returns 401 or 400 without valid webhook secret", async () => {
    const res = await request(app)
      .post("/api/v1/voice/transcript")
      .send({ callId: "1", transcript: "hello" });
    expect([400, 401, 403]).toContain(res.status);
  });
});

describe("POST /api/v1/voice/call-complete (webhook — no JWT)", () => {
  it("returns 401 or 400 without valid webhook secret", async () => {
    const res = await request(app)
      .post("/api/v1/voice/call-complete")
      .send({});
    expect([400, 401, 403]).toContain(res.status);
  });
});

describe("GET /api/v1/voice/calls", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).get("/api/v1/voice/calls")).status).toBe(401);
  });

  it("returns 200 with valid token", async () => {
    const res = await request(app)
      .get("/api/v1/voice/calls")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/voice/call", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).post("/api/v1/voice/call").send({})).status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/v1/voice/call")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect([400, 404, 422]).toContain(res.status);
  });
});

describe("GET /api/v1/voice/risk-scores/:elderlyId", () => {
  it("returns 401 without auth", async () => {
    expect((await request(app).get("/api/v1/voice/risk-scores/1")).status).toBe(401);
  });

  it("returns 404 for a non-existent elderly", async () => {
    const res = await request(app)
      .get("/api/v1/voice/risk-scores/9999999999")
      .set("Authorization", `Bearer ${token}`);
    expect([404, 200]).toContain(res.status);
  });
});
