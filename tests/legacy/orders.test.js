const request = require("supertest");
const db = require("../../config/db");
const { app } = require("../helpers");

let orderId;

afterAll(async () => {
  if (orderId) await db.query("DELETE FROM `orders` WHERE id = ?", [orderId]);
});

describe("POST /api/orders", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/orders").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("creates an order with valid data", async () => {
    const res = await request(app).post("/api/orders").send({
      buyer_name:    "John Test",
      buyer_phone:   "0800000000",
      buyer_address: "123 Test St",
      item_name:     "Test Item",
      item_point:    10,
    });
    expect(res.status).toBe(201);
    expect(res.body.order_id).toBeDefined();
    orderId = res.body.order_id;
  });
});

describe("GET /api/orders", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns 200 for an existing order", async () => {
    if (!orderId) return;
    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.buyer_name).toBe("John Test");
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await request(app).get("/api/orders/9999999");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/orders/:id", () => {
  it("updates an existing order", async () => {
    if (!orderId) return;
    const res = await request(app).put(`/api/orders/${orderId}`).send({
      buyer_name:    "Jane Test",
      buyer_phone:   "0800000001",
      buyer_address: "456 Updated St",
      item_name:     "Updated Item",
      item_url:      "",
      item_point:    20,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order updated");
  });
});

describe("DELETE /api/orders/:id", () => {
  it("deletes an existing order", async () => {
    if (!orderId) return;
    const res = await request(app).delete(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    orderId = null;
  });
});
