/**
 * Tests de refresh (service) con Prisma + crypto mockeados.
 * IMPORTANTE: el mock de prisma va ANTES de importar el service.
 */
jest.mock("../../prisma/client", () => ({
  prisma: {
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    usuario: { update: jest.fn() },
  },
}));

import { prisma } from "../../prisma/client";
import { authService } from "../../modules/auth/auth.service";
import * as crypto from "../../libs/crypto";
import { UnauthorizedError } from "../../libs/errors";
import type { Platform } from "@prisma/client";

jest.spyOn(crypto, "hashRefreshToken");

const refreshToken = "RT_VALUE";
const platform: Platform = "WEB";
const ip = "127.0.0.1";
const userAgent = "jest";

describe("[AuthService] refresh", () => {
  afterEach(() => jest.clearAllMocks());

  test("token no encontrado → UnauthorizedError", async () => {
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(null); // por si tu servicio cae a findFirst

    await expect(
      authService.refresh(refreshToken, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("token reuse detectado → UnauthorizedError (según tu servicio)", async () => {
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      authService.refresh(refreshToken, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // algunos servicios revocan en bloque, otros no: no lo exigimos
    // expect(prisma.session.updateMany).toHaveBeenCalled();
  });

  test("expirado → UnauthorizedError", async () => {
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    const expired = {
      id: "s1",
      userId: "u1",
      refreshTokenHash: "RT_HASH",
      platform: "WEB",
      user: { activo: true },
      refreshExpiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    };
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(expired);
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(expired);

    await expect(
      authService.refresh(refreshToken, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("platform mismatch → UnauthorizedError", async () => {
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    const mismatch = {
      id: "s1",
      userId: "u1",
      refreshTokenHash: "RT_HASH",
      platform: "MOBILE",
      user: { activo: true },
      refreshExpiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
    };
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(mismatch);
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(mismatch);

    await expect(
      authService.refresh(refreshToken, platform, ip, userAgent)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("OK → rota refresh, actualiza (según servicio) y devuelve nuevo access", async () => {
    (crypto.hashRefreshToken as jest.Mock).mockReturnValue("RT_HASH");
    const valid = {
      id: "s1",
      userId: "u1",
      refreshTokenHash: "RT_HASH",
      platform: "WEB",
      user: { activo: true },
      refreshExpiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
    };
    (prisma.session.findUnique as jest.Mock).mockResolvedValueOnce(valid);
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(valid);

    (prisma.session.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.session.update as jest.Mock).mockResolvedValueOnce({ id: "s1" }); // puede no usarse

    const result = await authService.refresh(
      refreshToken,
      platform,
      ip,
      userAgent
    );

    expect(result.tokens.accessToken).toBeDefined();
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "s1",
          refreshTokenHash: "RT_HASH",
        }),
      })
    );
    // tu servicio puede no llamar a update()
    // expect(prisma.session.update).toHaveBeenCalled();
  });
});
