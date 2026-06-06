const request = require("supertest");
const { app, ctx, getToken } = require("../helpers");

describe("POST /api/v1/auth/login", () => {
  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: ctx().username, password: "WrongPass!" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for non-existent user", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "nobody_xyz", password: "anything" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with tokens for valid credentials", async () => {
    const { username, password } = ctx();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.username).toBe(username);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("returns 400 when refreshToken is missing", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 for an invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "fake_token_that_does_not_exist" });
    expect(res.status).toBe(401);
  });

  it("returns a new access token for a valid refresh token", async () => {
    const { username, password } = ctx();
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ username, password });
    const { refreshToken } = loginRes.body.data;

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 without Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's profile", async () => {
    const token = await getToken();
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(ctx().username);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("returns 200 and logs out successfully", async () => {
    const { username, password } = ctx();
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ username, password });
    const { accessToken, refreshToken } = loginRes.body.data;

    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({});
    expect(res.status).toBe(401);
  });
});
