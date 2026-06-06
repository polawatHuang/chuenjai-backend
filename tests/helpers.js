const request = require("supertest");
const fs      = require("fs");
const path    = require("path");
const app     = require("../app");

function ctx() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, ".test-context.json"), "utf-8"));
}

async function getToken() {
  const { username, password } = ctx();
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ username, password });
  return res.body?.data?.accessToken ?? null;
}

module.exports = { ctx, getToken, app };
