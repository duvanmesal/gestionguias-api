import { RolType } from "@prisma/client"
import { prisma } from "../../../prisma/client"
import { userService } from "../../../modules/users/user.service"

jest.mock("../../../prisma/client", () => ({
    prisma: {
        usuario: {
            findMany: jest.fn(),
            count: jest.fn(),
            },
        },
}))

describe("[UserService] list (robustez)", () => {
    afterEach(() => jest.clearAllMocks())

    test("clampa pageSize a [1,100] y normaliza page negativa/NaN", async () => {
        ;(prisma.usuario.count as jest.Mock).mockResolvedValue(250)
        ;(prisma.usuario.findMany as jest.Mock).mockResolvedValue([])

        // page negativa / pageSize enorme -> clamp a 100
        await userService.list({ page: -5 as any, pageSize: 999 as any })
        expect(prisma.usuario.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0, take: 100 })
        )

        // page válida / pageSize 0 -> usa DEFAULT 20 (de tu servicio), no 1
        await userService.list({ page: 2, pageSize: 0 as any })
        expect(prisma.usuario.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 20, take: 20 })
        )
    })

    test("totalPages usa el pageSize efectivo (coherente con 'take')", async () => {
        ;(prisma.usuario.count as jest.Mock).mockResolvedValue(250)
        ;(prisma.usuario.findMany as jest.Mock).mockResolvedValue([])

        const out = await userService.list({ page: 1, pageSize: 999 as any }) // se clamp a 100
        expect(out.meta.pageSize).toBe(100)
        expect(out.meta.totalPages).toBe(Math.ceil(250 / 100))
    })

    test("search trim y OR con mode:'insensitive' + rol + activo", async () => {
        ;(prisma.usuario.count as jest.Mock).mockResolvedValue(1)
        ;(prisma.usuario.findMany as jest.Mock).mockResolvedValue([
        {
            id: "u-1",
            email: "duvan@test.com",
            nombres: "Duván",
            apellidos: "Mesa",
            rol: RolType.GUIA,
            activo: true,
            profileStatus: "INCOMPLETE",
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ])

        await userService.list({ search: "  duvan  ", rol: RolType.GUIA, activo: true })

        expect(prisma.usuario.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                rol: RolType.GUIA,
                activo: true,
                    OR: expect.arrayContaining([
                        expect.objectContaining({ nombres: expect.objectContaining({ contains: "duvan", mode: "insensitive" }) }),
                        expect.objectContaining({ apellidos: expect.objectContaining({ contains: "duvan", mode: "insensitive" }) }),
                        expect.objectContaining({ email: expect.objectContaining({ contains: "duvan", mode: "insensitive" }) }),
                    ]),
                }),
            })
        )
    })
})
