import { http } from "../helpers/app-users"

jest.mock("../../modules/users/user.controller", () => ({
    userController: {
        list: jest.fn((req, res) =>
            res.json({
                data: [],
                meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
                error: null,
            }),
        ),
        get: jest.fn((req, res) =>
            res.json({ data: { id: req.params.id }, meta: null, error: null }),
        ),
        create: jest.fn((req, res) =>
            res.status(201).json({ data: { id: "new" }, meta: null, error: null }),
        ),
        update: jest.fn((req, res) =>
            res.json({
                data: { id: req.params.id, ...req.body },
                meta: null,
                error: null,
            }),
        ),
        changePassword: jest.fn((req, res) =>
            res.json({ data: { ok: true }, meta: null, error: null }),
        ),
        deactivate: jest.fn((req, res) =>
            res.json({ data: { ok: true }, meta: null, error: null }),
        ),
        activate: jest.fn((req, res) =>
            res.json({ data: { ok: true }, meta: null, error: null }),
        ),
        completeProfile: jest.fn((req, res) =>
            res.json({ data: { ok: true }, meta: null, error: null }),
        ),
    },
}))

/**
 * Mock de auth/rbac:
 * - requireAuth: inyecta req.user leyendo headers de prueba
 *   - x-test-user: userId
 *   - x-test-role: rol (p.ej. SUPER_ADMIN, SUPERVISOR, GUIA)
 *   Defaults: userId=u-auth, rol=SUPERVISOR
 * - requireOwnershipOrRole(roles): permite si owner o si rol ∈ roles
 * - requireSuperAdmin: rol === SUPER_ADMIN
 */
jest.mock("../../libs/auth", () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        const role = (req.header("x-test-role") || "SUPERVISOR") as string
        const userId = (req.header("x-test-user") || "u-auth") as string
        req.user = { userId, rol: role }
        next()
    },
    requireOwnershipOrRole:
        (roles: string[]) =>
            (req: any, res: any, next: any) => {
                const isOwner = req.params?.id && req.user?.userId === req.params.id
                const roleOk = roles?.length ? roles.includes(req.user?.rol) : false
                return isOwner || roleOk
                    ? next()
                    : res.status(403).json({ data: null, meta: null, error: { code: "FORBIDDEN" } })
            },
}))

jest.mock("../../libs/rbac", () => ({
    requireSuperAdmin: (req: any, res: any, next: any) => {
        return req.user?.rol === "SUPER_ADMIN"
            ? next()
            : res.status(403).json({ data: null, meta: null, error: { code: "FORBIDDEN" } })
    },
}))

describe("users.routes RBAC + validate", () => {
    test("GET / (list): 403 si no es SUPER_ADMIN", async () => {
        const res = await http().get("/api/v1/users?page=1&pageSize=10")
        expect(res.status).toBe(403)
    })

    test("GET / (list): 200 si es SUPER_ADMIN + valida query", async () => {
        const ok = await http()
            .get("/api/v1/users?page=2&pageSize=5&search=duvan&rol=GUIA&activo=true")
            .set("x-test-role", "SUPER_ADMIN")
            .set("x-test-user", "u-admin")

        expect(ok.status).toBe(200)
        expect(ok.body.meta).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 1 }) // del mock del controller

        // Query inválida (page=0) → 400 VALIDATION_ERROR
        const bad = await http()
            .get("/api/v1/users?page=0")
            .set("x-test-role", "SUPER_ADMIN")
            .set("x-test-user", "u-admin")

        expect(bad.status).toBe(400)
        expect(bad.body?.error?.code).toBe("VALIDATION_ERROR")
    })

    test("POST /: solo SUPER_ADMIN, body inválido → 400; válido → 201", async () => {
        // inválido (falta campos)
        const bad = await http()
            .post("/api/v1/users")
            .set("x-test-role", "SUPER_ADMIN")
            .set("x-test-user", "u-admin")
            .send({ email: "x" })

        expect(bad.status).toBe(400)
        expect(bad.body?.error?.code).toBe("VALIDATION_ERROR")

        // válido
        const ok = await http()
            .post("/api/v1/users")
            .set("x-test-role", "SUPER_ADMIN")
            .set("x-test-user", "u-admin")
            .send({
                email: "a@a.com",
                password: "Secret!123", // <-- cumple tu regex de password
                nombres: "A",
                apellidos: "B",
                rol: "GUIA",
            })

        expect(ok.status).toBe(201)
    })

    test("GET /:id: owner o SUPER_ADMIN; si no, 403", async () => {
        // supervisor “no owner”
        let res = await http().get("/api/v1/users/u-xyz")
        expect(res.status).toBe(403)

        // owner
        res = await http().get("/api/v1/users/u-xyz").set("x-test-user", "u-xyz").set("x-test-role", "GUIA")
        expect(res.status).toBe(200)
    })

    test("PATCH /:id: owner o SUPER_ADMIN; validate body", async () => {
        // owner, intenta subir rol (el service luego bloquearía con 401; aquí solo validamos paso por middlewares/validate)
        const bad = await http()
            .patch("/api/v1/users/u-1")
            .set("x-test-user", "u-1")
            .set("x-test-role", "GUIA")
            .send({ rol: "SUPER_ADMIN" })

        expect([200, 401, 403]).toContain(bad.status)

        // SUPER_ADMIN con body válido → 200
        const ok = await http()
            .patch("/api/v1/users/u-1")
            .set("x-test-user", "u-admin")
            .set("x-test-role", "SUPER_ADMIN")
            .send({ nombres: "Nuevo" })

        expect(ok.status).toBe(200)
    })

    test("PATCH /:id/password: solo owner + validate body", async () => {
        // no owner → 403
        let res = await http().patch("/api/v1/users/u-1/password").send({ currentPassword: "a", newPassword: "Secret!123" })
        expect(res.status).toBe(403)

        // owner, body inválido → 400
        const bad = await http()
            .patch("/api/v1/users/u-1/password")
            .set("x-test-user", "u-1")
            .set("x-test-role", "GUIA")
            .send({ currentPassword: "" })
        expect(bad.status).toBe(400)

        // owner, body válido → 200
        const ok = await http()
            .patch("/api/v1/users/u-1/password")
            .set("x-test-user", "u-1")
            .set("x-test-role", "GUIA")
            .send({ currentPassword: "old", newPassword: "Secret!123" })
        expect(ok.status).toBe(200)
    })

    test("DELETE /:id (deactivate): solo SUPER_ADMIN", async () => {
        // supervisor → 403
        let res = await http().delete("/api/v1/users/u-1")
        expect(res.status).toBe(403)

        // SUPER_ADMIN → 200
        res = await http().delete("/api/v1/users/u-1").set("x-test-user", "u-admin").set("x-test-role", "SUPER_ADMIN")
        expect(res.status).toBe(200)
    })
})
