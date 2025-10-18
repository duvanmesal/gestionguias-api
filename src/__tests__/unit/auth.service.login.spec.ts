// src/__tests__/unit/auth.service.login.spec.ts

import { authService } from "../../modules/auth/auth.service";
import { prisma } from "../../prisma/client";
import * as password from "../../libs/password";
import * as crypto from "../../libs/crypto";
import * as jwt from "../../libs/jwt";
import { UnauthorizedError } from "../../libs/errors";
import type { Platform } from "@prisma/client";

/**
 * Mock de Prisma: incluye `usuario.findUnique` y `session.create`,
 * además de otros métodos usados por el servicio.
 */
jest.mock("../../prisma/client", () => ({
  prisma: {
    usuario: {
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Espiamos (y luego mockeamos en cada test) las funciones de las libs
jest.spyOn(password, "verifyPassword");
jest.spyOn(crypto, "generateRefreshToken");
jest.spyOn(crypto, "hashRefreshToken");
jest.spyOn(jwt, "signAccessToken");

const baseLogin = {
  email: "user@test.com",
  password: "Secret123@",
  deviceId: "dev-1",
};

const platform: Platform = "WEB";
const ip = "127.0.0.1";
const userAgent = "jest-test";

describe("[AuthService] login", () => {
  afterEach(() => jest.clearAllMocks());

  test("usuario inexistente → UnauthorizedError", async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      authService.login(baseLogin, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("usuario inactivo → UnauthorizedError", async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "u1",
      email: baseLogin.email,
      activo: false,
      passwordHash: "x",
      rol: "GUIA",
    });

    await expect(
      authService.login(baseLogin, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("password incorrecto → UnauthorizedError", async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "u1",
      email: baseLogin.email,
      activo: true,
      passwordHash: "hash",
      rol: "GUIA",
    });
    (password.verifyPassword as jest.Mock).mockResolvedValueOnce(false);

    await expect(
      authService.login(baseLogin, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("OK → retorna access+refresh y crea Session", async () => {
    // Usuario válido
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "u1",
      email: baseLogin.email,
      activo: true,
      passwordHash: "hash",
      rol: "GUIA",
      nombres: "John",
      apellidos: "Doe",
    });

    // Password correcto
    (password.verifyPassword as jest.Mock).mockResolvedValueOnce(true);

    // RT como string + hash calculado por separado (alineado con tu servicio)
    (crypto.generateRefreshToken as jest.Mock).mockReturnValue("REFRESH_VALUE");
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("REFRESH_HASH");

    // Creación de sesión OK
    (prisma.session.create as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      platform,
      createdAt: new Date(),
      refreshTokenHash: "REFRESH_HASH",
    });

    // Access token firmado
    (jwt.signAccessToken as jest.Mock).mockReturnValue("ACCESS_TOKEN");

    const result = await authService.login(baseLogin, platform, ip, userAgent);

    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          platform,
          ip,
          userAgent,
          refreshTokenHash: "REFRESH_HASH",
          // si tu servicio guarda deviceId en la sesión, puedes validar también:
          // deviceId: baseLogin.deviceId,
        }),
      })
    );

    expect(result.tokens.accessToken).toBe("ACCESS_TOKEN");
    expect(result.tokens.refreshToken).toBe("REFRESH_VALUE"); // en WEB el controlador puede ocultarlo del body
    expect(result.user.email).toBe(baseLogin.email);
  });
});
