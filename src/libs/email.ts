// src/libs/email.ts
import { logger } from "./logger";
import { env } from "../config/env";
import { BadGatewayError } from "./errors";

const EMAIL_FROM = env.EMAIL_FROM;
const BREVO_API_BASE_URL = env.BREVO_API_BASE_URL.replace(/\/+$/, "");
const APP_LOGIN_URL = env.APP_LOGIN_URL;
const APP_VERIFY_EMAIL_URL = env.APP_VERIFY_EMAIL_URL;
const APP_NAME = process.env.APP_NAME || "Gestión de Guías Turísticos";
const SERVICE_USER_AGENT = "gestionguias-api/0.1.0";

export interface InvitationEmailData {
  email: string;
  tempPassword: string;
  inviterName?: string;
  expiresInHours: number;
}

export interface PasswordResetEmailData {
  to: string;
  resetUrl: string;
  ttlMinutes: number;
}

export interface VerifyEmailEmailData {
  to: string;
  verifyUrl: string;
  ttlMinutes: number;
  code?: string;
}

export interface LogoutAllCodeEmailData {
  to: string;
  code: string;
  ttlMinutes: number;
}

export interface OperationalRecaladaEmailData {
  to: string;
  guiaName?: string;
  codigoRecalada: string;
  buqueNombre?: string | null;
  paisOrigenNombre?: string | null;
  fechaLlegada: Date | string;
  fechaSalida?: Date | string | null;
  terminal?: string | null;
  muelle?: string | null;
}

export interface OperationalAtencionEmailData {
  to: string;
  guiaName?: string;
  atencionId: number;
  codigoRecalada: string;
  buqueNombre?: string | null;
  fechaInicio: Date | string;
  fechaFin: Date | string;
  turnosTotal: number;
  descripcion?: string | null;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
};

export type EmailProvider = "brevo" | "outbox";

export type SendEmailResult = {
  provider: EmailProvider;
  messageId: string;
  response?: string;
  accepted: string[];
  rejected: string[];
};

export type OutboxEmailMessage = SendEmailInput & {
  id: string;
  from: string;
  createdAt: string;
};

const emailOutbox: OutboxEmailMessage[] = [];

export function getEmailOutboxMessages(): OutboxEmailMessage[] {
  return [...emailOutbox];
}

export function clearEmailOutbox(): void {
  emailOutbox.length = 0;
}

// ============================================
// DESIGN TOKENS (Premium Dark Theme)
// ============================================
const COLORS = {
  // Backgrounds
  outerBg: "#0A0E12",
  cardBg: "#0F1419",
  surfaceBg: "#192028",
  surfaceHover: "#232D37",
  // Brand
  primaryGreen: "#228B54",
  primaryGreenLight: "#2CA866",
  accentGold: "#BF9B30",
  accentGoldLight: "#D4AF37",
  // Status
  warningBg: "#2D2313",
  warningBorder: "#BF9B30",
  warningText: "#D4AF37",
  dangerRed: "#B93737",
  // Text
  textPrimary: "#F5F7FA",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  // Borders
  borderSubtle: "#2A3441",
  borderMedium: "#374151",
};

// ============================================
// SHARED EMAIL STYLES
// ============================================
function getBaseStyles(): string {
  return `
    body {
      margin: 0;
      padding: 0;
      background-color: ${COLORS.outerBg};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .outer-wrapper {
      width: 100%;
      background-color: ${COLORS.outerBg};
      padding: 40px 20px;
    }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: ${COLORS.cardBg};
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid ${COLORS.borderSubtle};
    }
    .header {
      background: linear-gradient(135deg, ${COLORS.surfaceBg} 0%, ${COLORS.cardBg} 100%);
      padding: 48px 40px 40px 40px;
      text-align: center;
      border-bottom: 1px solid ${COLORS.borderSubtle};
    }
    .header-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px auto;
      background: linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: ${COLORS.textPrimary};
      letter-spacing: -0.5px;
    }
    .header-subtitle {
      margin: 12px 0 0 0;
      font-size: 15px;
      color: ${COLORS.textSecondary};
      font-weight: 400;
    }
    .content {
      padding: 40px;
    }
    .content p {
      line-height: 1.7;
      margin: 0 0 18px 0;
      color: ${COLORS.textSecondary};
      font-size: 15px;
    }
    .content p strong {
      color: ${COLORS.textPrimary};
      font-weight: 600;
    }
    /* Credentials Panel */
    .credentials-panel {
      background-color: ${COLORS.surfaceBg};
      border: 1px solid ${COLORS.borderSubtle};
      border-radius: 12px;
      padding: 24px;
      margin: 28px 0;
    }
    .credential-item {
      margin-bottom: 20px;
    }
    .credential-item:last-child {
      margin-bottom: 0;
    }
    .credential-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: ${COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .credential-value {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
      background-color: ${COLORS.surfaceHover};
      padding: 14px 18px;
      border-radius: 8px;
      color: ${COLORS.textPrimary};
      font-size: 15px;
      font-weight: 500;
      border: 1px solid ${COLORS.borderMedium};
      display: block;
      word-break: break-all;
    }
    .credential-value.highlight {
      color: ${COLORS.primaryGreenLight};
      border-color: ${COLORS.primaryGreen};
      background: linear-gradient(135deg, rgba(34, 139, 84, 0.15) 0%, rgba(44, 168, 102, 0.08) 100%);
    }
    /* CTA Button */
    .cta-wrapper {
      text-align: center;
      margin: 32px 0;
    }
    .cta-button {
      display: inline-block;
      padding: 16px 48px;
      background: linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%);
      color: #FFFFFF !important;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 15px;
      text-align: center;
      letter-spacing: 0.3px;
    }
    .cta-secondary {
      background: linear-gradient(135deg, ${COLORS.surfaceHover} 0%, ${COLORS.surfaceBg} 100%);
      border: 1px solid ${COLORS.borderMedium};
      color: ${COLORS.textPrimary} !important;
    }
    /* Fallback Link */
    .fallback-section {
      text-align: center;
      margin: 24px 0;
      padding: 20px;
      background-color: ${COLORS.surfaceBg};
      border-radius: 10px;
      border: 1px solid ${COLORS.borderSubtle};
    }
    .fallback-label {
      font-size: 13px;
      color: ${COLORS.textMuted};
      margin: 0 0 12px 0;
    }
    .fallback-url {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: ${COLORS.primaryGreenLight};
      word-break: break-all;
      line-height: 1.5;
    }
    .fallback-url a {
      color: ${COLORS.primaryGreenLight};
      text-decoration: none;
    }
    /* Warning/Alert Box */
    .alert-box {
      background: linear-gradient(135deg, ${COLORS.warningBg} 0%, rgba(45, 35, 19, 0.6) 100%);
      border: 1px solid ${COLORS.warningBorder};
      border-radius: 10px;
      padding: 18px 20px;
      margin: 28px 0;
    }
    .alert-box p {
      margin: 0;
      color: ${COLORS.warningText};
      font-size: 14px;
      line-height: 1.6;
    }
    .alert-box strong {
      color: ${COLORS.accentGoldLight};
    }
    /* Info Box */
    .info-box {
      background-color: ${COLORS.surfaceBg};
      border: 1px solid ${COLORS.borderSubtle};
      border-radius: 10px;
      padding: 18px 20px;
      margin: 24px 0;
    }
    .info-box p {
      margin: 0;
      color: ${COLORS.textSecondary};
      font-size: 14px;
      line-height: 1.6;
    }
    /* Security Note */
    .security-note {
      background-color: ${COLORS.surfaceBg};
      border-left: 3px solid ${COLORS.borderMedium};
      padding: 16px 20px;
      margin: 28px 0;
      border-radius: 0 8px 8px 0;
    }
    .security-note p {
      margin: 0;
      font-size: 13px;
      color: ${COLORS.textMuted};
      line-height: 1.6;
    }
    .security-note strong {
      color: ${COLORS.textSecondary};
    }
    /* Code Display */
    .code-display {
      background: linear-gradient(135deg, ${COLORS.surfaceBg} 0%, ${COLORS.surfaceHover} 100%);
      border: 2px solid ${COLORS.primaryGreen};
      border-radius: 14px;
      padding: 28px;
      margin: 28px 0;
      text-align: center;
    }
    .code-label {
      font-size: 12px;
      font-weight: 600;
      color: ${COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 16px 0;
    }
    .code-value {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 10px;
      color: ${COLORS.primaryGreenLight};
      text-shadow: 0 0 20px rgba(34, 139, 84, 0.4);
      margin: 0;
    }
    /* Divider */
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, ${COLORS.borderSubtle} 50%, transparent 100%);
      margin: 28px 0;
    }
    .divider-text {
      text-align: center;
      color: ${COLORS.textMuted};
      font-size: 13px;
      margin: 28px 0;
      position: relative;
    }
    /* Footer */
    .footer {
      background-color: ${COLORS.surfaceBg};
      padding: 32px 40px;
      text-align: center;
      border-top: 1px solid ${COLORS.borderSubtle};
    }
    .footer-brand {
      font-size: 14px;
      font-weight: 700;
      color: ${COLORS.textPrimary};
      margin: 0 0 8px 0;
    }
    .footer-tagline {
      font-size: 13px;
      color: ${COLORS.textMuted};
      margin: 0 0 20px 0;
    }
    .footer-help {
      font-size: 12px;
      color: ${COLORS.textMuted};
      margin: 0;
      padding-top: 20px;
      border-top: 1px solid ${COLORS.borderSubtle};
    }
    .footer a {
      color: ${COLORS.primaryGreenLight};
      text-decoration: none;
    }
    /* Preheader (hidden) */
    .preheader {
      display: none !important;
      visibility: hidden;
      opacity: 0;
      color: transparent;
      height: 0;
      width: 0;
      max-height: 0;
      max-width: 0;
      overflow: hidden;
      mso-hide: all;
    }
  `;
}

export function getEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER) return env.EMAIL_PROVIDER;
  return env.NODE_ENV === "production" ? "brevo" : "outbox";
}

function assertBrevoConfigured() {
  if (!env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is required when EMAIL_PROVIDER=brevo");
  }

  if (!EMAIL_FROM) {
    throw new Error("EMAIL_FROM is required when EMAIL_PROVIDER=brevo");
  }
}

function parseEmailAddress(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>\s*$/);

  if (match) {
    const name = match[1]?.trim();
    return {
      email: match[2],
      ...(name ? { name } : {}),
    };
  }

  return { email: value.trim() };
}

function buildOutboxMessageId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `outbox_${Date.now()}_${random}`;
}

async function sendWithOutbox(input: SendEmailInput): Promise<SendEmailResult> {
  const messageId = buildOutboxMessageId();
  emailOutbox.push({
    id: messageId,
    from: EMAIL_FROM,
    createdAt: new Date().toISOString(),
    ...input,
  });

  logger.info(
    {
      provider: "outbox",
      to: input.to,
      subject: input.subject,
      messageId,
      hasHtml: !!input.html,
      hasText: !!input.text,
    },
    "[email] outbox message generated",
  );

  return {
    provider: "outbox",
    messageId,
    response: "Stored in local outbox",
    accepted: [input.to],
    rejected: [],
  };
}

async function parseBrevoError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      code?: string;
      name?: string;
      error?: string;
    };
    return (
      payload.message ||
      payload.error ||
      payload.code ||
      payload.name ||
      `Brevo API returned ${response.status}`
    );
  } catch {
    return `Brevo API returned ${response.status}`;
  }
}

async function sendWithBrevo(input: SendEmailInput): Promise<SendEmailResult> {
  assertBrevoConfigured();

  const response = await fetch(`${BREVO_API_BASE_URL}/v3/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": SERVICE_USER_AGENT,
    },
    body: JSON.stringify({
      sender: parseEmailAddress(EMAIL_FROM),
      to: [{ email: input.to }],
      subject: input.subject,
      ...(input.html ? { htmlContent: input.html } : {}),
      ...(input.text && !input.html ? { textContent: input.text } : {}),
      headers: input.headers,
    }),
  });

  if (!response.ok) {
    const message = await parseBrevoError(response);
    throw new BadGatewayError("Email provider rejected the message", {
      provider: "brevo",
      status: response.status,
      reason: message,
    });
  }

  const payload = (await response.json()) as { messageId?: string };
  const messageId = payload.messageId || `brevo_${Date.now()}`;

  return {
    provider: "brevo",
    messageId,
    response: `Brevo accepted email with status ${response.status}`,
    accepted: [input.to],
    rejected: [],
  };
}

// ---- INVITATION TEMPLATE ----
function generateInvitationHTML(data: InvitationEmailData): string {
  const { email, tempPassword, inviterName, expiresInHours } = data;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Invitación a ${APP_NAME}</title>
  <style type="text/css">
    ${getBaseStyles()}
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body>
  <span class="preheader">Tu acceso inicial y contraseña temporal caducan en ${expiresInHours} horas. &#847; &#847; &#847;</span>
  
  <div class="outer-wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <div style="width:64px;height:64px;margin:0 auto 20px auto;background:linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%);border-radius:16px;line-height:64px;font-size:28px;">
                🎫
              </div>
              <h1>Bienvenido a ${APP_NAME}</h1>
              <p class="header-subtitle">Tu cuenta ha sido creada exitosamente</p>
            </td>
          </tr>
        </table>
      </div>
      
      <!-- Content -->
      <div class="content">
        <p>Hola,</p>
        <p>
          ${inviterName ? `<strong>${inviterName}</strong> te ha invitado` : "Has sido invitado"} a unirte a la plataforma <strong>${APP_NAME}</strong>.
        </p>
        <p>Puedes acceder inmediatamente usando estas credenciales temporales:</p>
        
        <!-- Credentials Panel -->
        <div class="credentials-panel">
          <div class="credential-item">
            <span class="credential-label">📧 Usuario (Email)</span>
            <span class="credential-value">${email}</span>
          </div>
          <div class="credential-item">
            <span class="credential-label">🔑 Contraseña Temporal</span>
            <span class="credential-value highlight">${tempPassword}</span>
          </div>
        </div>
        
        <!-- CTA Button -->
        <div class="cta-wrapper">
          <a href="${APP_LOGIN_URL}" class="cta-button">Iniciar Sesión</a>
        </div>
        
        <!-- Fallback Link -->
        <div class="fallback-section">
          <p class="fallback-label">O copia este enlace en tu navegador:</p>
          <p class="fallback-url"><a href="${APP_LOGIN_URL}">${APP_LOGIN_URL}</a></p>
        </div>
        
        <!-- Warning -->
        <div class="alert-box">
          <p>⏰ <strong>Importante:</strong> Esta invitación y contraseña temporal son válidas por <strong>${expiresInHours} horas</strong>. Después de ese tiempo, necesitarás una nueva invitación.</p>
        </div>
        
        <!-- Info Box -->
        <div class="info-box">
          <p>📝 Al iniciar sesión por primera vez, se te pedirá que completes tu perfil (incluye documento de identidad y teléfono).</p>
        </div>
        
        <!-- Security Note -->
        <div class="security-note">
          <p><strong>🔒 Nota de seguridad:</strong> No compartas este correo. Si no solicitaste este acceso, puedes ignorarlo de forma segura.</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p class="footer-brand">${APP_NAME}</p>
        <p class="footer-tagline">Sistema de gestión de turnos y atenciones</p>
        <p class="footer-help">¿Necesitas ayuda? Contacta al administrador del sistema.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ---- PASSWORD RESET TEMPLATE ----
function generatePasswordResetHTML(data: PasswordResetEmailData): string {
  const { resetUrl, ttlMinutes } = data;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Recuperación de contraseña - ${APP_NAME}</title>
  <style type="text/css">
    ${getBaseStyles()}
    .header-icon-reset {
      background: linear-gradient(135deg, ${COLORS.accentGold} 0%, ${COLORS.accentGoldLight} 100%) !important;
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body>
  <span class="preheader">Enlace válido por ${ttlMinutes} minutos. &#847; &#847; &#847;</span>
  
  <div class="outer-wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <div style="width:64px;height:64px;margin:0 auto 20px auto;background:linear-gradient(135deg, ${COLORS.accentGold} 0%, ${COLORS.accentGoldLight} 100%);border-radius:16px;line-height:64px;font-size:28px;">
                🔐
              </div>
              <h1>Recuperación de Contraseña</h1>
              <p class="header-subtitle">Solicitud de restablecimiento de acceso</p>
            </td>
          </tr>
        </table>
      </div>
      
      <!-- Content -->
      <div class="content">
        <p>Hola,</p>
        <p>Recibimos una solicitud para restablecer tu contraseña en <strong>${APP_NAME}</strong>.</p>
        <p>Haz clic en el botón para crear una nueva contraseña:</p>
        
        <!-- CTA Button -->
        <div class="cta-wrapper">
          <a href="${resetUrl}" class="cta-button" style="background:linear-gradient(135deg, ${COLORS.accentGold} 0%, ${COLORS.accentGoldLight} 100%);">Restablecer Contraseña</a>
        </div>
        
        <!-- Fallback Link -->
        <div class="fallback-section">
          <p class="fallback-label">Si el botón no funciona, copia y pega este enlace:</p>
          <p class="fallback-url"><a href="${resetUrl}">${resetUrl}</a></p>
        </div>
        
        <!-- Warning -->
        <div class="alert-box">
          <p>⏰ <strong>Importante:</strong> Este enlace expira en <strong>${ttlMinutes} minutos</strong>. Si expira, deberás solicitar un nuevo restablecimiento.</p>
        </div>
        
        <!-- Security Note -->
        <div class="security-note">
          <p><strong>🔒 Nota de seguridad:</strong> Si tú no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña actual permanecerá sin cambios.</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p class="footer-brand">${APP_NAME}</p>
        <p class="footer-tagline">Este correo fue enviado automáticamente</p>
        <p class="footer-help">No respondas a este mensaje.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ---- VERIFY EMAIL TEMPLATE ----
function generateVerifyEmailHTML(data: VerifyEmailEmailData): string {
  const { verifyUrl, ttlMinutes, code } = data;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Verifica tu correo - ${APP_NAME}</title>
  <style type="text/css">
    ${getBaseStyles()}
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body>
  <span class="preheader">${code ? `Código: ${code} – ` : ""}Enlace válido por ${ttlMinutes} minutos. &#847; &#847; &#847;</span>
  
  <div class="outer-wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <div style="width:64px;height:64px;margin:0 auto 20px auto;background:linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%);border-radius:16px;line-height:64px;font-size:28px;">
                ✅
              </div>
              <h1>Verifica tu Correo</h1>
              <p class="header-subtitle">Confirma que esta dirección te pertenece</p>
            </td>
          </tr>
        </table>
      </div>
      
      <!-- Content -->
      <div class="content">
        <p>Hola,</p>
        <p>Para activar tu cuenta en <strong>${APP_NAME}</strong>, necesitamos confirmar que este correo te pertenece.</p>
        
        ${
          code
            ? `
        <!-- Code Section (Mobile App) -->
        <p style="text-align:center;color:${COLORS.textSecondary};margin:24px 0 0 0;">Si estás en la <strong>app móvil</strong>, ingresa este código:</p>
        
        <div class="code-display">
          <p class="code-label">Código de Verificación</p>
          <p class="code-value">${code}</p>
        </div>
        
        <p class="divider-text">— o bien —</p>
        
        <p style="text-align:center;color:${COLORS.textSecondary};margin:0 0 8px 0;">Si prefieres, verifica desde un <strong>navegador</strong>:</p>
        `
            : `
        <p>Haz clic en el botón para verificar tu email:</p>
        `
        }
        
        <!-- CTA Button -->
        <div class="cta-wrapper">
          <a href="${verifyUrl}" class="cta-button">Verificar Correo</a>
        </div>
        
        <!-- Fallback Link -->
        <div class="fallback-section">
          <p class="fallback-label">Si el botón no funciona, copia y pega este enlace:</p>
          <p class="fallback-url"><a href="${verifyUrl}">${verifyUrl}</a></p>
        </div>
        
        <!-- Warning -->
        <div class="alert-box">
          <p>⏰ <strong>Importante:</strong> ${code ? "El código y el enlace expiran" : "Este enlace expira"} en <strong>${ttlMinutes} minutos</strong>.</p>
        </div>
        
        <!-- Security Note -->
        <div class="security-note">
          <p><strong>🔒 Nota de seguridad:</strong> Si tú no solicitaste esta verificación, puedes ignorar este correo de forma segura.</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p class="footer-brand">${APP_NAME}</p>
        <p class="footer-tagline">Este correo fue enviado automáticamente</p>
        ${APP_LOGIN_URL ? `<p class="footer-help">Login: <a href="${APP_LOGIN_URL}">${APP_LOGIN_URL}</a></p>` : ""}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateLogoutAllCodeHTML(data: LogoutAllCodeEmailData): string {
  const { code, ttlMinutes } = data;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Código de seguridad - ${APP_NAME}</title>
  <style type="text/css">
    ${getBaseStyles()}
  </style>
</head>
<body>
  <span class="preheader">Código para cerrar todas las sesiones: ${code}. Válido por ${ttlMinutes} minutos.</span>
  <div class="outer-wrapper">
    <div class="container">
      <div class="header">
        <div style="width:64px;height:64px;margin:0 auto 20px auto;background:linear-gradient(135deg, ${COLORS.dangerRed} 0%, ${COLORS.accentGold} 100%);border-radius:16px;line-height:64px;font-size:28px;">
          🔐
        </div>
        <h1>Código de Seguridad</h1>
        <p class="header-subtitle">Confirmación para cerrar todas tus sesiones</p>
      </div>
      <div class="content">
        <p>Hola,</p>
        <p>Recibimos una solicitud para cerrar todas las sesiones activas de tu cuenta en <strong>${APP_NAME}</strong>.</p>
        <p>Ingresa este código en la aplicación para confirmar la operación:</p>
        <div class="code-display">
          <p class="code-label">Código de confirmación</p>
          <p class="code-value">${code}</p>
        </div>
        <div class="alert-box">
          <p>⏰ <strong>Importante:</strong> Este código expira en <strong>${ttlMinutes} minutos</strong>.</p>
        </div>
        <div class="security-note">
          <p><strong>🔒 Nota de seguridad:</strong> Si tú no solicitaste cerrar todas las sesiones, ignora este correo y cambia tu contraseña.</p>
        </div>
      </div>
      <div class="footer">
        <p class="footer-brand">${APP_NAME}</p>
        <p class="footer-tagline">Este correo fue enviado automáticamente</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "No definida";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function generateOperationalNoticeHTML(args: {
  title: string;
  subtitle: string;
  greetingName?: string;
  intro: string;
  rows: Array<{ label: string; value: string | number | null | undefined }>;
  note?: string;
}): string {
  const rowsHtml = args.rows
    .map(
      (row) => `
        <div class="credential-item">
          <span class="credential-label">${row.label}</span>
          <span class="credential-value">${row.value ?? "No definido"}</span>
        </div>
      `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${args.title} - ${APP_NAME}</title>
  <style type="text/css">
    ${getBaseStyles()}
  </style>
</head>
<body>
  <span class="preheader">${args.subtitle}</span>
  <div class="outer-wrapper">
    <div class="container">
      <div class="header">
        <div style="width:64px;height:64px;margin:0 auto 20px auto;background:linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%);border-radius:16px;line-height:64px;font-size:28px;">
          ⚓
        </div>
        <h1>${args.title}</h1>
        <p class="header-subtitle">${args.subtitle}</p>
      </div>
      <div class="content">
        <p>Hola${args.greetingName ? `, <strong>${args.greetingName}</strong>` : ""},</p>
        <p>${args.intro}</p>
        <div class="credentials-panel">
          ${rowsHtml}
        </div>
        ${
          args.note
            ? `<div class="info-box"><p>${args.note}</p></div>`
            : ""
        }
      </div>
      <div class="footer">
        <p class="footer-brand">${APP_NAME}</p>
        <p class="footer-tagline">Notificación operativa automática</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ---- low-level sender (reutilizable) ----
export async function sendEmail({
  to,
  subject,
  html,
  text,
  headers,
}: SendEmailInput): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  const payload = { to, subject, html, text, headers };
  const info =
    provider === "brevo"
      ? await sendWithBrevo(payload)
      : await sendWithOutbox(payload);

  logger.info(
    {
      provider: info.provider,
      to,
      subject,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
    },
    "[email] sent",
  );

  return info;
}

// ---- API: invitación ----
export async function sendInvitationEmail(
  data: InvitationEmailData,
): Promise<void> {
  try {
    const html = generateInvitationHTML(data);
    const subject = "Has sido invitado a Gestión de Guías – activa tu cuenta";
    const preheader = `Tu acceso inicial y contraseña temporal caducan en ${data.expiresInHours} horas.`;

    const info = await sendEmail({
      to: data.email,
      subject,
      html,
      text: `
Has sido invitado a ${APP_NAME}.

Usuario: ${data.email}
Contraseña Temporal: ${data.tempPassword}

Accede aquí: ${APP_LOGIN_URL}

Esta invitación expira en ${data.expiresInHours} horas.
No compartas este correo. Si no solicitaste acceso, ignóralo.
      `.trim(),
      headers: { "X-Preheader": preheader },
    });

    logger.info(
      { email: data.email, messageId: info.messageId },
      "Invitation email sent successfully",
    );
  } catch (error) {
    logger.error(
      {
        email: data.email,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to send invitation email",
    );

    throw error;
  }
}

// ---- API: reset password ----
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<void> {
  try {
    const html = generatePasswordResetHTML(data);
    const subject = `Recupera tu contraseña – ${APP_NAME}`;
    const preheader = `Enlace válido por ${data.ttlMinutes} minutos.`;

    const info = await sendEmail({
      to: data.to,
      subject,
      html,
      text: `
Recuperación de contraseña - ${APP_NAME}

Recibimos una solicitud para restablecer tu contraseña.

Abre este enlace para continuar:
${data.resetUrl}

Este enlace expira en ${data.ttlMinutes} minutos.

Si no solicitaste este cambio, ignora este correo.
      `.trim(),
      headers: { "X-Preheader": preheader },
    });

    logger.info(
      { to: data.to, messageId: info.messageId },
      "Password reset email sent successfully",
    );
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to send password reset email");
    throw error;
  }
}

// ---- API: verify email ----
export async function sendVerifyEmailEmail(
  data: VerifyEmailEmailData,
): Promise<void> {
  try {
    const html = generateVerifyEmailHTML(data);
    const subject = `Verifica tu correo – ${APP_NAME}`;
    const preheader = data.code
      ? `Código y enlace válidos por ${data.ttlMinutes} minutos.`
      : `Enlace válido por ${data.ttlMinutes} minutos.`;

    const info = await sendEmail({
      to: data.to,
      subject,
      html,
      text: `
Verificación de correo - ${APP_NAME}

${data.code ? `Tu código de verificación es: ${data.code}\n\n` : ""}Para activar tu cuenta, usa el enlace:
${data.verifyUrl}

Este enlace expira en ${data.ttlMinutes} minutos.

Si no solicitaste esta verificación, ignora este correo.
      `.trim(),
      headers: { "X-Preheader": preheader },
    });

    logger.info(
      { to: data.to, messageId: info.messageId },
      "Verify email sent successfully",
    );
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to send verify email");
    throw error;
  }
}

export async function sendLogoutAllCodeEmail(
  data: LogoutAllCodeEmailData,
): Promise<void> {
  try {
    const html = generateLogoutAllCodeHTML(data);
    const subject = `Código para cerrar sesiones – ${APP_NAME}`;
    const preheader = `Código válido por ${data.ttlMinutes} minutos.`;

    const info = await sendEmail({
      to: data.to,
      subject,
      html,
      text: `
Código de seguridad - ${APP_NAME}

Tu código para cerrar todas las sesiones es: ${data.code}

Este código expira en ${data.ttlMinutes} minutos.

Si no solicitaste esta acción, ignora este correo y cambia tu contraseña.
      `.trim(),
      headers: { "X-Preheader": preheader },
    });

    logger.info(
      { to: data.to, messageId: info.messageId },
      "Logout-all verification code sent successfully",
    );
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to send logout-all code email");
    throw error;
  }
}

export async function sendOperationalRecaladaCreatedEmail(
  data: OperationalRecaladaEmailData,
): Promise<void> {
  const subject = "Nueva recalada programada";
  const html = generateOperationalNoticeHTML({
    title: "Nueva recalada programada",
    subtitle: `${data.codigoRecalada} quedó registrada en la agenda operativa`,
    greetingName: data.guiaName,
    intro:
      "Se registró una nueva recalada. Revisa la aplicación móvil para confirmar disponibilidad cuando corresponda.",
    rows: [
      { label: "Código", value: data.codigoRecalada },
      { label: "Buque", value: data.buqueNombre },
      { label: "País de origen", value: data.paisOrigenNombre },
      { label: "Llegada programada", value: formatDateTime(data.fechaLlegada) },
      { label: "Salida programada", value: formatDateTime(data.fechaSalida) },
      { label: "Terminal", value: data.terminal },
      { label: "Muelle", value: data.muelle },
    ],
  });

  await sendEmail({
    to: data.to,
    subject,
    html,
    text: `
Nueva recalada programada

Código: ${data.codigoRecalada}
Buque: ${data.buqueNombre ?? "No definido"}
País de origen: ${data.paisOrigenNombre ?? "No definido"}
Llegada programada: ${formatDateTime(data.fechaLlegada)}
Salida programada: ${formatDateTime(data.fechaSalida)}
Terminal: ${data.terminal ?? "No definido"}
Muelle: ${data.muelle ?? "No definido"}

Revisa la aplicación móvil para confirmar disponibilidad cuando corresponda.
    `.trim(),
    headers: { "X-Preheader": `${data.codigoRecalada} quedó registrada.` },
  });
}

export async function sendOperationalAtencionCreatedEmail(
  data: OperationalAtencionEmailData,
): Promise<void> {
  const subject = "Nueva atención disponible";
  const html = generateOperationalNoticeHTML({
    title: "Nueva atención disponible",
    subtitle: `Atención ${data.atencionId} asociada a ${data.codigoRecalada}`,
    greetingName: data.guiaName,
    intro:
      "Se abrió una nueva atención operativa. Revisa la aplicación móvil para registrar tu disponibilidad.",
    rows: [
      { label: "Atención", value: data.atencionId },
      { label: "Recalada", value: data.codigoRecalada },
      { label: "Buque", value: data.buqueNombre },
      { label: "Inicio", value: formatDateTime(data.fechaInicio) },
      { label: "Fin", value: formatDateTime(data.fechaFin) },
      { label: "Cupos", value: data.turnosTotal },
      { label: "Descripción", value: data.descripcion },
    ],
    note: "La asignación de turnos depende de la disponibilidad registrada y las reglas operativas vigentes.",
  });

  await sendEmail({
    to: data.to,
    subject,
    html,
    text: `
Nueva atención disponible

Atención: ${data.atencionId}
Recalada: ${data.codigoRecalada}
Buque: ${data.buqueNombre ?? "No definido"}
Inicio: ${formatDateTime(data.fechaInicio)}
Fin: ${formatDateTime(data.fechaFin)}
Cupos: ${data.turnosTotal}
Descripción: ${data.descripcion ?? "No definida"}

Revisa la aplicación móvil para registrar tu disponibilidad.
    `.trim(),
    headers: { "X-Preheader": `Atención ${data.atencionId} asociada a ${data.codigoRecalada}.` },
  });
}

// ---- API: prueba de mailing ----
export async function sendTestEmail(
  to: string,
  subject = "Prueba de correo - Gestión de Guías",
  message = "Hola, esto es una prueba de envío de correo.",
): Promise<void> {
  try {
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style type="text/css">
    body { margin:0; padding:0; background-color:${COLORS.outerBg}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
    .wrapper { width:100%; background-color:${COLORS.outerBg}; padding:40px 20px; }
    .card { max-width:500px; margin:0 auto; background-color:${COLORS.cardBg}; border-radius:12px; border:1px solid ${COLORS.borderSubtle}; overflow:hidden; }
    .header { background:linear-gradient(135deg, ${COLORS.primaryGreen} 0%, ${COLORS.primaryGreenLight} 100%); padding:24px; text-align:center; }
    .header h2 { margin:0; color:#fff; font-size:18px; font-weight:700; }
    .body { padding:28px; }
    .body p { margin:0 0 14px 0; color:${COLORS.textSecondary}; line-height:1.6; font-size:14px; }
    .body p:last-child { margin:0; }
    .footer { padding:20px 28px; border-top:1px solid ${COLORS.borderSubtle}; text-align:center; }
    .footer p { margin:0; color:${COLORS.textMuted}; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h2>🚀 Prueba de correo</h2>
      </div>
      <div class="body">
        <p>Este mensaje confirma que el servicio de mailing está <strong style="color:${COLORS.textPrimary};">funcionando correctamente</strong>.</p>
        <p>${message}</p>
      </div>
      <div class="footer">
        <p>${APP_NAME}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    const info = await sendEmail({
      to,
      subject,
      html,
      text: message,
      headers: { "X-Preheader": "Prueba de transporte de email" },
    });

    logger.info(
      { to, subject, messageId: info.messageId },
      "Test email sent successfully",
    );
  } catch (error) {
    logger.error({ error, to }, "Failed to send test email");
    throw error;
  }
}

// ---- Health-check del transporte ----
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const provider = getEmailProvider();
    if (provider === "brevo") {
      assertBrevoConfigured();
    }

    logger.info({ provider }, "Email service configuration verified");
    return true;
  } catch (error) {
    logger.error({ error }, "Email service connection failed");
    return false;
  }
}
