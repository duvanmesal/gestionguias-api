import request from "supertest"
import app from "../app"
import { prisma } from "../prisma/client"
import { hashPassword } from "../libs/password"
import { RolType, StatusType } from "@prisma/client"

describe("Authentication Flow", () => {
  let superAdminUser: any
  let testUser: any
  let accessToken: string
  let refreshToken: string

  beforeAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany()
    await prisma.usuario.deleteMany()

    // Create test users
    const passwordHash = await hashPassword("Test123!")

    superAdminUser = await prisma.usuario.create({
      data: {
        email: "admin@test.com",
        passwordHash,
        nombres: "Admin",
        apellidos: "Test",
        rol: RolType.SUPER_ADMIN,
        activo: true,
      },
    })

    testUser = await prisma.usuario.create({
      data: {
        email: "user@test.com",
        passwordHash,
        nombres: "User",
        apellidos: "Test",
        rol: RolType.GUIA,
        activo: true,
      },
    })
  })

  afterAll(async () => {
    await prisma.refreshToken.deleteMany()
    await prisma.usuario.deleteMany()
    await prisma.$disconnect()
  })

  describe("POST /api/v1/auth/login", () => {
    it("should login successfully with valid credentials", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "admin@test.com",
          password: "Test123!",
        })
        .expect(200)

      expect(response.body.data.user).toMatchObject({
        email: "admin@test.com",
        nombres: "Admin",
        apellidos: "Test",
        rol: "SUPER_ADMIN",
      })

      expect(response.body.data.tokens).toHaveProperty("accessToken")
      expect(response.body.data.tokens).toHaveProperty("refreshToken")

      accessToken = response.body.data.tokens.accessToken
      refreshToken = response.body.data.tokens.refreshToken
    })

    it("should fail with invalid credentials", async () => {
      await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "admin@test.com",
          password: "wrongpassword",
        })
        .expect(401)
    })

    it("should fail with inactive user", async () => {
      await prisma.usuario.update({
        where: { id: testUser.id },
        data: { activo: false },
      })

      await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "user@test.com",
          password: "Test123!",
        })
        .expect(401)

      // Reactivate for other tests
      await prisma.usuario.update({
        where: { id: testUser.id },
        data: { activo: true },
      })
    })
  })

  describe("GET /api/v1/auth/me", () => {
    it("should return user profile with valid token", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)

      expect(response.body.data).toMatchObject({
        email: "admin@test.com",
        nombres: "Admin",
        apellidos: "Test",
        rol: "SUPER_ADMIN",
      })
    })

    it("should fail without token", async () => {
      await request(app).get("/api/v1/auth/me").expect(401)
    })

    it("should fail with invalid token", async () => {
      await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer invalid-token").expect(401)
    })
  })

  describe("POST /api/v1/auth/refresh", () => {
    it("should refresh tokens successfully", async () => {
      const response = await request(app)
        .post("/api/v1/auth/refresh")
        .send({
          refreshToken,
        })
        .expect(200)

      expect(response.body.data.tokens).toHaveProperty("accessToken")
      expect(response.body.data.tokens).toHaveProperty("refreshToken")

      // Update tokens for next tests
      accessToken = response.body.data.tokens.accessToken
      refreshToken = response.body.data.tokens.refreshToken
    })

    it("should fail with invalid refresh token", async () => {
      await request(app)
        .post("/api/v1/auth/refresh")
        .send({
          refreshToken: "invalid-refresh-token",
        })
        .expect(401)
    })
  })

  describe("POST /api/v1/auth/logout", () => {
    it("should logout successfully", async () => {
      await request(app)
        .post("/api/v1/auth/logout")
        .send({
          refreshToken,
        })
        .expect(204)
    })

    it("should fail to use revoked refresh token", async () => {
      await request(app)
        .post("/api/v1/auth/refresh")
        .send({
          refreshToken,
        })
        .expect(401)
    })
  })

  describe("POST /api/v1/auth/logout-all", () => {
    it("should logout all sessions", async () => {
      // Login again to get new tokens
      const loginResponse = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "admin@test.com",
          password: "Test123!",
        })
        .expect(200)

      const newAccessToken = loginResponse.body.data.tokens.accessToken

      await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${newAccessToken}`).expect(204)
    })
  })
})

describe("User Management", () => {
  let adminAccessToken: string
  let userAccessToken: string
  let createdUserId: string
  let testUser: any // Declare testUser here

  beforeAll(async () => {
    // Login as admin
    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: "admin@test.com",
      password: "Test123!",
    })

    adminAccessToken = adminLogin.body.data.tokens.accessToken

    // Login as regular user
    const userLogin = await request(app).post("/api/v1/auth/login").send({
      email: "user@test.com",
      password: "Test123!",
    })

    userAccessToken = userLogin.body.data.tokens.accessToken

    // Fetch testUser for later use
    const fetchedTestUser = await prisma.usuario.findUnique({
      where: { email: "user@test.com" },
    })
    testUser = fetchedTestUser
  })

  describe("POST /api/v1/users", () => {
    it("should create user as admin", async () => {
      const response = await request(app)
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          email: "newuser@test.com",
          password: "Test123!",
          nombres: "New",
          apellidos: "User",
          rol: "GUIA",
        })
        .expect(201)

      expect(response.body.data).toMatchObject({
        email: "newuser@test.com",
        nombres: "New",
        apellidos: "User",
        rol: "GUIA",
      })

      createdUserId = response.body.data.id
    })

    it("should fail to create user as non-admin", async () => {
      await request(app)
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${userAccessToken}`)
        .send({
          email: "another@test.com",
          password: "Test123!",
          nombres: "Another",
          apellidos: "User",
          rol: "GUIA",
        })
        .expect(403)
    })
  })

  describe("GET /api/v1/users", () => {
    it("should list users as admin", async () => {
      const response = await request(app)
        .get("/api/v1/users")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.meta).toHaveProperty("total")
    })

    it("should fail to list users as non-admin", async () => {
      await request(app).get("/api/v1/users").set("Authorization", `Bearer ${userAccessToken}`).expect(403)
    })
  })

  describe("GET /api/v1/users/:id", () => {
    it("should get user as admin", async () => {
      const response = await request(app)
        .get(`/api/v1/users/${createdUserId}`)
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .expect(200)

      expect(response.body.data).toMatchObject({
        email: "newuser@test.com",
        nombres: "New",
        apellidos: "User",
      })
    })

    it("should get own profile as user", async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testUser.id}`)
        .set("Authorization", `Bearer ${userAccessToken}`)
        .expect(200)

      expect(response.body.data.email).toBe("user@test.com")
    })
  })
})
