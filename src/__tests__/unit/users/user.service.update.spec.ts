import { RolType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { userService } from "../../../modules/users/user.service"
import { NotFoundError, UnauthorizedError } from "../../../libs/errors"

// Mock Prisma (mismo estilo que tus otros tests)
jest.mock("../../../prisma/client", () => ({
    prisma: {
        usuario: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    },
}))

// Mock logger para no ensuciar salida
jest.mock("../../../libs/logger", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

describe("[UserService] update", () => {
    afterEach(() => jest.clearAllMocks())

    const baseUser = {
        id: "u-1",
        email: "test@example.com",
        nombres: "Nombre",
        apellidos: "Apellido",
        rol: RolType.GUIA,
        activo: true,
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2025-01-01T00:00:00Z"),
    }

    test("404 si el usuario no existe", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(null)

        await expect(
            userService.update("nope", { nombres: "X" } as any, "admin-1", RolType.SUPER_ADMIN),
        ).rejects.toThrow(NotFoundError)

        expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    test("un usuario NO admin solo puede actualizar su propio perfil (nombres/apellidos)", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)
            ; (prisma.usuario.update as jest.Mock).mockResolvedValueOnce({
                ...baseUser,
                nombres: "Nuevo",
                apellidos: "Apellido",
                updatedAt: new Date("2025-01-02T00:00:00Z"),
            })

        const out = await userService.update(
            "u-1",
            { nombres: "Nuevo" } as any,
            "u-1",               // updatedBy = mismo usuario
            RolType.GUIA,        // rol no admin
        )

        expect(prisma.usuario.update).toHaveBeenCalledWith({
            where: { id: "u-1" },
            data: { nombres: "Nuevo" },
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
        })

        expect(out).toEqual(
            expect.objectContaining({
                id: "u-1",
                nombres: "Nuevo",
                rol: RolType.GUIA,
            }),
        )
    })

    test("un usuario NO admin no puede actualizar a otro usuario (401)", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)

        await expect(
            userService.update(
                "u-1",
                { nombres: "X" } as any,
                "u-2",             // updatedBy ≠ id
                RolType.GUIA,      // rol no admin
            ),
        ).rejects.toThrow(UnauthorizedError)

        expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    test("un usuario NO admin no puede cambiar rol ni activo (401)", async () => {
    ;(prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)

    await expect(
        userService.update(
        "u-1",
        { rol: RolType.SUPERVISOR } as any,
        "u-1",
        RolType.GUIA,
        ),
    ).rejects.toThrow(UnauthorizedError)

    // 👉 Mock de nuevo para la segunda invocación:
    ;(prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)

    await expect(
        userService.update(
        "u-1",
        { activo: false } as any,
        "u-1",
        RolType.GUIA,
        ),
    ).rejects.toThrow(UnauthorizedError)

    expect(prisma.usuario.update).not.toHaveBeenCalled()
    })


    test("SUPER_ADMIN puede cambiar rol y activo, además de nombres/apellidos", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)

            ; (prisma.usuario.update as jest.Mock).mockResolvedValueOnce({
                ...baseUser,
                nombres: "Nuevo",
                apellidos: "Apellido",
                rol: RolType.SUPERVISOR,
                activo: false,
                updatedAt: new Date("2025-01-02T00:00:00Z"),
            })

        const out = await userService.update(
            "u-1",
            { nombres: "Nuevo", rol: RolType.SUPERVISOR, activo: false } as any,
            "admin-1",
            RolType.SUPER_ADMIN,
        )

        expect(prisma.usuario.update).toHaveBeenCalledWith({
            where: { id: "u-1" },
            data: { nombres: "Nuevo", rol: RolType.SUPERVISOR, activo: false },
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
        })

        expect(out).toEqual(
            expect.objectContaining({
                id: "u-1",
                nombres: "Nuevo",
                rol: RolType.SUPERVISOR,
                activo: false,
            }),
        )
    })

    test("solo aplica los campos presentes (update parcial)", async () => {
        ; (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(baseUser)
            ; (prisma.usuario.update as jest.Mock).mockResolvedValueOnce({
                ...baseUser,
                apellidos: "Cambiado",
                updatedAt: new Date("2025-01-02T00:00:00Z"),
            })

        await userService.update("u-1", { apellidos: "Cambiado" } as any, "u-1", RolType.GUIA)

        expect(prisma.usuario.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { apellidos: "Cambiado" }, // sólo el campo enviado
            }),
        )
    })
})
