
import request from "supertest";
import app from "../../app";

jest.mock("../../prisma/client", () => ({
  prisma: {
    usuario: { findUnique: jest.fn() },
    session: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from "../../prisma/client";
import * as password from "../../libs/password";
import * as crypto from "../../libs/crypto";
import * as jwt from "../../libs/jwt";

jest.spyOn(password, "verifyPassword");
jest.spyOn(crypto, "generateRefreshToken");
jest.spyOn(crypto, "hashRefreshToken");
jest.spyOn(jwt, "signAccessToken");
jest.spyOn(jwt, "verifyAccessToken"); // necesario para poder mockearla

const agent = request(app);

describe("[HTTP] /api/v1/auth flow", () => {
  afterEach(() => jest.clearAllMocks());

  test("POST /auth/login sin X-Client-Platform → 400", async () => {
    const res = await agent
      .post("/api/v1/auth/login")
      .send({ email: "a@a.com", password: "Secret123@" });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("BAD_REQUEST");
  });

  test("POST /auth/login con credenciales válidas → 200 + tokens", async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "u1",
      email: "a@a.com",
      activo: true,
      passwordHash: "hash",
      rol: "GUIA",
      nombres: "John",
      apellidos: "Doe",
    });
    (password.verifyPassword as jest.Mock).mockResolvedValueOnce(true);
    (crypto.generateRefreshToken as jest.Mock).mockReturnValue("REFRESH_VALUE");
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("REFRESH_HASH");
    (prisma.session.create as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      platform: "WEB",
      createdAt: new Date(),
      refreshTokenHash: "REFRESH_HASH",
    });
    (jwt.signAccessToken as jest.Mock).mockReturnValue("ACCESS_TOKEN");

    const res = await agent
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: "a@a.com", password: "Secret123@" });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBe("ACCESS_TOKEN");

    // Para WEB el refresh va a cookie (el body NO lo incluye):
    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    expect(cookies.some((c: string) => typeof c === "string" && c.startsWith("rt="))).toBe(true);
    expect(res.body.data.tokens.refreshToken).toBeUndefined();
  });

  test("POST /auth/login rate limited → 429 al exceder", async () => {
    // Envía 5 requests inválidas (password corta) para gastar el límite:
    for (let i = 0; i < 5; i++) {
      await agent
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "web")
        .send({ email: "a@a.com", password: "short" });
    }
    // Sexta debe retornar 429
    const res = await agent
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "web")
      .send({ email: "a@a.com", password: "short" });

    expect(res.status).toBe(429);
  });

  test("GET /auth/me sin bearer → 401", async () => {
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /auth/me con bearer válido → 200", async () => {
    (jwt.verifyAccessToken as jest.Mock).mockReturnValue({
      userId: "u1",
      email: "a@a.com",
      rol: "GUIA",
      sid: "s1",
      aud: "web",
      iat: Math.floor(Date.now() / 1000),
    });

    // Guard de sesión
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 3600_000),
      lastRotatedAt: null,
    });
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 3600_000),
      lastRotatedAt: null,
    });

    // El controlador `me` busca el usuario → si no lo mockeamos, devuelve 404
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "u1",
      email: "a@a.com",
      activo: true,
      rol: "GUIA",
      nombres: "John",
      apellidos: "Doe",
    });

    const res = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer ACCESS")
      .set("X-Client-Platform", "web");

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body?.data?.user?.email ?? res.body?.data?.email).toBeDefined();
  });

  test("POST /auth/refresh (cookie rt en WEB) → 200/401 según caso", async () => {
    // Caso OK
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      refreshTokenHash: "RT_HASH",
      platform: "WEB",
      user: { activo: true },
      refreshExpiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
    });
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    (prisma.session.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.session.update as jest.Mock).mockResolvedValueOnce({ id: "s1" });

    const ok = await agent
      .post("/api/v1/auth/refresh")
      .set("X-Client-Platform", "web")
      .set("Cookie", "rt=SOME_VALUE")
      .send({});

    expect(ok.status).toBe(200);
    expect(ok.body.data.tokens.accessToken).toBeDefined();

    // Caso 401 (token inexistente)
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const unauth = await agent
      .post("/api/v1/auth/refresh")
      .set("X-Client-Platform", "web")
      .set("Cookie", "rt=SOME_VALUE")
      .send({});

    expect(unauth.status).toBe(401);
  });
});
