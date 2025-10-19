import { prisma } from "../../../prisma/client";
import { userService } from "../../../modules/users/user.service";
import {
    NotFoundError,
    UnauthorizedError,
    BusinessError,
} from "../../../libs/errors";

// Prisma mock igual que en tus otros tests
jest.mock("../../../prisma/client", () => ({
    prisma: {
        usuario: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        refreshToken: {
            updateMany: jest.fn(),
        },
    },
}));

// Mocks de password
jest.mock("../../../libs/password", () => ({
    verifyPassword: jest.fn(),
    hashPassword: jest.fn(),
}));

// Mock logger para no ensuciar salidas
jest.mock("../../../libs/logger", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { verifyPassword, hashPassword } from "../../../libs/password";

describe("[UserService] changePassword", () => {
    afterEach(() => jest.clearAllMocks());

    const baseUser = {
        id: "u-1",
        email: "test@example.com",
        passwordHash: "old-hash",
        activo: true,
    };

    test("rechaza si requesterId !== id (401)", async () => {
        await expect(
            userService.changePassword(
                "u-1",
                { currentPassword: "old", newPassword: "New#123" } as any,
                "u-2"
            )
        ).rejects.toThrow(UnauthorizedError);

        expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
        expect(prisma.usuario.update).not.toHaveBeenCalled();
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    test("404 si el usuario no existe", async () => {
        (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(null);

        await expect(
            userService.changePassword(
                "nope",
                { currentPassword: "old", newPassword: "New#123" } as any,
                "nope"
            )
        ).rejects.toThrow(NotFoundError);

        expect(prisma.usuario.update).not.toHaveBeenCalled();
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    test("BusinessError si el usuario está inactivo", async () => {
        (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
            ...baseUser,
            activo: false,
        });

        await expect(
            userService.changePassword(
                "u-1",
                { currentPassword: "old", newPassword: "New#123" } as any,
                "u-1"
            )
        ).rejects.toThrow(BusinessError);

        expect(prisma.usuario.update).not.toHaveBeenCalled();
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    test("UnauthorizedError si la contraseña actual es incorrecta", async () => {
        (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser);
        (verifyPassword as jest.Mock).mockResolvedValueOnce(false);

        await expect(
            userService.changePassword(
                "u-1",
                { currentPassword: "bad", newPassword: "New#123" } as any,
                "u-1"
            )
        ).rejects.toThrow(UnauthorizedError);

        expect(verifyPassword).toHaveBeenCalledWith("bad", "old-hash");
        expect(prisma.usuario.update).not.toHaveBeenCalled();
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    test("OK: hashea nueva contraseña, actualiza y revoca refresh tokens activos", async () => {
        (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser);
        (verifyPassword as jest.Mock).mockResolvedValueOnce(true);
        (hashPassword as jest.Mock).mockResolvedValueOnce("new-hash");

        await userService.changePassword(
            "u-1",
            { currentPassword: "old", newPassword: "New#123" } as any,
            "u-1"
        );

        // verificó la password actual
        expect(verifyPassword).toHaveBeenCalledWith("old", "old-hash");

        // guardó el nuevo hash
        expect(hashPassword).toHaveBeenCalledWith("New#123");
        expect(prisma.usuario.update).toHaveBeenCalledWith({
            where: { id: "u-1" },
            data: { passwordHash: "new-hash" },
        });

        // revocó todos los refresh tokens activos del usuario
        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
            where: { userId: "u-1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });
});
