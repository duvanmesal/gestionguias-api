import { RolType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { userService } from "../../../modules/users/user.service"
import { ConflictError } from "../../../libs/errors"

jest.mock("../../../prisma/client", () => ({
    prisma: {
        usuario: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
    },
}))

jest.mock("../../../libs/password", () => ({
    hashPassword: jest.fn().mockResolvedValue("hashed:pwd"),
    verifyPassword: jest.fn(),
}))

import { hashPassword } from "../../../libs/password"

describe("[UserService] create", () => {
    afterEach(() => jest.clearAllMocks())

    test("lanza ConflictError si el email ya existe", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce({
            id: "u-dup",
            email: "dup@test.com",
        })

        await expect(
            userService.create(
                {
                    email: "dup@test.com",
                    password: "Secret#123",
                    nombres: "Ana",
                    apellidos: "García",
                    rol: RolType.GUIA,
                } as any,
                "admin-1",
            ),
        ).rejects.toThrow(ConflictError)

        expect(prisma.usuario.create).not.toHaveBeenCalled()
    })

    test("crea usuario nuevo: hashea password y devuelve campos públicos", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(null)

            ; (prisma.usuario.create as jest.Mock).mockResolvedValueOnce({
                id: "u-1",
                email: "ana@example.com",
                nombres: "Ana",
                apellidos: "García",
                rol: RolType.GUIA,
                activo: true,
                createdAt: new Date("2025-01-01T00:00:00Z"),
                updatedAt: new Date("2025-01-01T00:00:00Z"),
            })

        const out = await userService.create(
            {
                email: "ana@example.com",
                password: "Secret#123",
                nombres: "Ana",
                apellidos: "García",
                rol: RolType.GUIA,
            } as any,
            "admin-1",
        )

        // Se llamó a hashPassword con el password plano
        expect(hashPassword).toHaveBeenCalledWith("Secret#123")

        // Se llamó a prisma.usuario.create con los datos esperados (passwordHash y activo: true)
        expect(prisma.usuario.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    email: "ana@example.com",
                    passwordHash: "hashed:pwd",
                    nombres: "Ana",
                    apellidos: "García",
                    rol: RolType.GUIA,
                    activo: true,
                }),
                select: {
                    id: true,
                    email: true,
                    nombres: true,
                    apellidos: true,
                    rol: true,
                    activo: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
        )

        // Respuesta pública
        expect(out).toEqual(
            expect.objectContaining({
                id: "u-1",
                email: "ana@example.com",
                rol: RolType.GUIA,
                activo: true,
            }),
        )
    })
})
