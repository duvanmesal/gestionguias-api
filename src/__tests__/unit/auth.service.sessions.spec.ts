import { authService } from "../../modules/auth/auth.service";
import { prisma } from "../../prisma/client";
import { NotFoundError, BadRequestError } from "../../libs/errors";

jest.mock("../../prisma/client", () => ({
  prisma: {
    session: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

describe("[AuthService] sessions & revoke", () => {
  afterEach(() => jest.clearAllMocks());

  test("listSessions devuelve activas ordenadas", async () => {
    (prisma.session.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "s2",
        userId: "u1",
        revokedAt: null,
        refreshExpiresAt: new Date(Date.now() + 2_000),
        createdAt: new Date(Date.now() - 1_000),
        platform: "WEB",
      },
      {
        id: "s1",
        userId: "u1",
        revokedAt: null,
        refreshExpiresAt: new Date(Date.now() + 1_000),
        createdAt: new Date(Date.now() - 2_000),
        platform: "MOBILE",
      },
    ]);

    const sessions = await authService.listSessions("u1");

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          revokedAt: null,
          // el servicio también añade refreshExpiresAt > now (no lo validamos estrictamente)
        }),
        // tu servicio usa objeto, no array
        orderBy: expect.objectContaining({ createdAt: "desc" }),
      })
    );
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions[0].id).toBe("s2"); // más reciente primero
  });

  test("revokeSession marca revokedAt solo si pertenece al user", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      revokedAt: null,
    });
    (prisma.session.update as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      revokedAt: new Date(),
    });

    await authService.revokeSession("s1", "u1");

    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  test("revokeSession: sesión no encontrada → NotFoundError", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      authService.revokeSession("sX", "u1")
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test("revokeSession: ya revocada → BadRequestError", async () => {
    (prisma.session.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      revokedAt: new Date(),
    });

    await expect(
      authService.revokeSession("s1", "u1")
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("logoutAll revoca todas", async () => {
    (prisma.session.updateMany as jest.Mock).mockResolvedValueOnce({
      count: 3,
    });

    await authService.logoutAll("u1");

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", revokedAt: null }),
        // el servicio además setea lastRotatedAt: now
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          // permitir extra key:
          // lastRotatedAt: expect.any(Date) // opcional, no obligatorio en el assert
        }),
      })
    );
  });
});
