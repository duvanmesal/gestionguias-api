import request from "supertest";
import app from "../app";

jest.mock("../prisma/client", () => {
  return {
    prisma: {
      $queryRaw: jest.fn(),
    },
  };
});

const { prisma } = require("../prisma/client");

describe("[Health] /health y /health/ready", () => {
  afterEach(() => jest.clearAllMocks());

  test("GET /health -> 200 cuando la DB responde", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]); // SELECT 1 OK

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body?.data?.databaseStatus).toBe("connected");
    expect(res.body.error).toBeNull();
  });

  test("GET /health -> 503 cuando la DB NO está conectada", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("DB down"));

    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      data: null,
      meta: null,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: expect.any(String),
      },
    });
  });

  test("GET /health/ready -> 200 con databaseStatus=connected cuando DB responde", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body?.data?.databaseStatus).toBe("connected");
    expect(res.body.error).toBeNull();
  });

  test("GET /health/ready -> 503 cuando la DB NO está conectada", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("DB down"));

    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
