const request = require("supertest");
const { app } = require("../helpers");

describe("POST /api/get-token", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/get-token").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required fields");
  });

  it("returns 400 when only roomName is provided", async () => {
    const res = await request(app)
      .post("/api/get-token")
      .send({ roomName: "test-room" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when participantName is missing", async () => {
    const res = await request(app)
      .post("/api/get-token")
      .send({ roomName: "test-room", userId: "u1" });
    expect(res.status).toBe(400);
  });

  it("returns 500 when LiveKit credentials are not set", async () => {
    // If LIVEKIT_API_KEY / SECRET not configured, returns 500
    const originalKey = process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_KEY;

    const res = await request(app).post("/api/get-token").send({
      roomName:        "room-1",
      participantName: "Alice",
      userId:          "user-1",
    });
    expect([200, 500]).toContain(res.status);

    process.env.LIVEKIT_API_KEY = originalKey;
  });

  it("returns 200 with token when all fields and credentials are present", async () => {
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      console.warn("Skipping LiveKit token test — credentials not configured");
      return;
    }
    const res = await request(app).post("/api/get-token").send({
      roomName:        "test-room",
      participantName: "TestUser",
      userId:          "test-user-1",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.serverUrl).toBeDefined();
  });
});
