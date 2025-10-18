import request from "supertest";
import app from "../app";

describe("[404] Ruta inexistente", () => {
  test("GET /api/v1/unknown -> 404 con payload estándar", async () => {
    const res = await request(app).get("/api/v1/unknown");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      data: null,
      meta: null,
      error: {
        code: "NOT_FOUND",
        message: expect.any(String),
      },
    });
  });
});
