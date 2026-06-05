const ORIGINAL_ENV = process.env;

function applyBaseEnv(overrides: NodeJS.ProcessEnv = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gestion_guias",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
    REFRESH_TOKEN_PEPPER: "c".repeat(32),
    SEED_SUPERADMIN_EMAIL: "admin@test.com",
    SEED_SUPERADMIN_PASS: "Secret123456!",
    PASSWORD_PEPPER: "d".repeat(16),
    TOKEN_PEPPER: "e".repeat(16),
    LOG_LEVEL: "silent",
    ...overrides,
  };
}

async function loadEmailModule() {
  // Reset de modulos: la terapia de pareja entre env vars y Jest.
  jest.resetModules();
  return require("../../libs/email") as typeof import("../../libs/email.js");
}

describe("email provider", () => {
  beforeEach(() => {
    applyBaseEnv();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it("uses outbox by default in test without calling the network", async () => {
    // Correo fantasma: sale en test, no molesta a nadie.
    const email = await loadEmailModule();

    const result = await email.sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(email.getEmailProvider()).toBe("outbox");
    expect(result.provider).toBe("outbox");
    expect(result.messageId).toMatch(/^outbox_/);
    expect(result.accepted).toEqual(["user@example.com"]);
    expect(email.getEmailOutboxMessages()).toHaveLength(1);
    expect(email.getEmailOutboxMessages()[0]).toMatchObject({
      id: result.messageId,
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fails clearly when brevo is selected without BREVO_API_KEY", async () => {
    applyBaseEnv({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "" });
    const email = await loadEmailModule();

    await expect(
      email.sendEmail({
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toThrow("BREVO_API_KEY is required");
  });

  it("sends through Brevo HTTP API when configured", async () => {
    applyBaseEnv({
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "xkeysib_test_key",
      EMAIL_FROM: "Gestion de Guias <noreply@example.com>",
    });
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: "<email_123@relay.domain.com>" }),
    } as Response);
    const email = await loadEmailModule();

    const result = await email.sendEmail({
      to: "user@example.com",
      subject: "Welcome",
      html: "<p>Hello</p>",
      text: "Hello",
      headers: { "X-Preheader": "Welcome" },
    });

    expect(result).toMatchObject({
      provider: "brevo",
      messageId: "<email_123@relay.domain.com>",
      accepted: ["user@example.com"],
      rejected: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": "xkeysib_test_key",
          accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "gestionguias-api/0.1.0",
        }),
      }),
    );

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      sender: { name: "Gestion de Guias", email: "noreply@example.com" },
      to: [{ email: "user@example.com" }],
      subject: "Welcome",
      htmlContent: "<p>Hello</p>",
      headers: { "X-Preheader": "Welcome" },
    });
  });

  it("throws sanitized errors for Brevo API failures", async () => {
    applyBaseEnv({
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "xkeysib_secret_key",
      EMAIL_FROM: "Gestion de Guias <noreply@example.com>",
    });
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Domain not verified" }),
    } as Response);
    const email = await loadEmailModule();

    await expect(
      email.sendEmail({
        to: "user@example.com",
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: "BAD_GATEWAY",
      message: "Email provider rejected the message",
      details: {
        provider: "brevo",
        status: 422,
        reason: "Domain not verified",
      },
    });
  });
});

export {};
