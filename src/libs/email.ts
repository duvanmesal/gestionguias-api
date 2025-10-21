// src/libs/email.ts
import nodemailer from "nodemailer";
import { logger } from "./logger";

const SMTP_HOST = process.env.SMTP_HOST || "localhost";
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Gestión de Guías <noreply@gestionguias.com>";
const APP_LOGIN_URL = process.env.APP_LOGIN_URL || "http://localhost:3001/login";
const APP_NAME = process.env.APP_NAME || "Gestión de Guías Turísticos";

export interface InvitationEmailData {
  email: string;
  tempPassword: string;
  inviterName?: string;
  expiresInHours: number;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
};

// ---- transporter (Brevo 587 = STARTTLS) ----
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // 465 = SSL; 587 = STARTTLS
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    // Recomendado para Brevo con 587
    minVersion: "TLSv1.2",
  },
});

// ---- INVITATION TEMPLATE ----
function generateInvitationHTML(data: InvitationEmailData): string {
  const { email, tempPassword, inviterName, expiresInHours } = data;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invitación a ${APP_NAME}</title>
  <style>
    body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background:#f5f5f5; color:#333 }
    .container { max-width:600px; margin:40px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1) }
    .header { background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); padding:40px 30px; text-align:center; color:#fff }
    .header h1 { margin:0; font-size:28px; font-weight:600 }
    .content { padding:40px 30px }
    .content p { line-height:1.6; margin:0 0 16px 0; color:#555 }
    .credentials-box { background:#f8f9fa; border-left:4px solid #667eea; padding:20px; margin:24px 0; border-radius:4px }
    .credentials-box p { margin:8px 0; font-size:14px }
    .credentials-box strong { color:#333; font-weight:600 }
    .credentials-box .value { font-family:'Courier New',monospace; background:#fff; padding:8px 12px; border-radius:4px; display:inline-block; margin-top:4px; color:#667eea; font-weight:600 }
    .cta-button { display:block; width:fit-content; margin:32px auto; padding:16px 48px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:16px; text-align:center; transition:transform .2s }
    .cta-button:hover { transform:translateY(-2px) }
    .warning-box { background:#fff3cd; border-left:4px solid #ffc107; padding:16px; margin:24px 0; border-radius:4px }
    .warning-box p { margin:0; color:#856404; font-size:14px }
    .footer { background:#f8f9fa; padding:24px 30px; text-align:center; font-size:12px; color:#6c757d }
    .footer p { margin:8px 0 }
    .footer a { color:#667eea; text-decoration:none }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎫 Bienvenido a ${APP_NAME}</h1>
    </div>
    <div class="content">
      <p>Hola,</p>
      <p>
        ${inviterName ? `<strong>${inviterName}</strong> te ha invitado` : "Has sido invitado"} a unirte a la plataforma <strong>${APP_NAME}</strong>.
      </p>
      <p>Tu cuenta ha sido creada y puedes acceder inmediatamente usando estas credenciales temporales:</p>
      <div class="credentials-box">
        <p><strong>📧 Usuario (Email):</strong></p>
        <div class="value">${email}</div>
        <p style="margin-top:16px;"><strong>🔑 Contraseña Temporal:</strong></p>
        <div class="value">${tempPassword}</div>
      </div>
      <a href="${APP_LOGIN_URL}" class="cta-button">Ir al Login</a>
      <p style="text-align:center; color:#6c757d; font-size:14px;">
        O copia este enlace:<br/>
        <a href="${APP_LOGIN_URL}" style="color:#667eea;">${APP_LOGIN_URL}</a>
      </p>
      <div class="warning-box">
        <p>⏰ <strong>Importante:</strong> Esta invitación y contraseña temporal son válidas por <strong>${expiresInHours} horas</strong>. Después de ese tiempo, necesitarás una nueva invitación.</p>
      </div>
      <p style="margin-top:24px;">Al iniciar sesión por primera vez, se te pedirá que completes tu perfil (incluye documento de identidad y teléfono).</p>
      <p style="margin-top:24px; font-size:14px; color:#6c757d;">
        <strong>Nota de seguridad:</strong> No compartas este correo. Si no solicitaste este acceso, puedes ignorarlo.
      </p>
    </div>
    <div class="footer">
      <p><strong>${APP_NAME}</strong></p>
      <p>Sistema de gestión de turnos y atenciones</p>
      <p style="margin-top:16px;">¿Necesitas ayuda? Contacta al administrador del sistema.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ---- low-level sender (reutilizable) ----
export async function sendEmail({ to, subject, html, text, headers }: SendEmailInput) {
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
    headers,
  });

  logger.info(
    { to, subject, messageId: info.messageId, response: info.response, accepted: info.accepted, rejected: info.rejected },
    "[email] sent"
  );

  return info;
}

// ---- API: invitación ----
export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
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
      "Invitation email sent successfully"
    );
  } catch (error) {
    logger.error({ error, email: data.email }, "Failed to send invitation email");
    throw new Error("Failed to send invitation email");
  }
}

// ---- API: prueba de mailing ----
export async function sendTestEmail(to: string, subject = "Prueba SMTP – Gestión de Guías", message = "Hola, esto es una prueba de envío de correo."): Promise<void> {
  try {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 8px">🚀 Prueba de correo SMTP</h2>
        <p>Este mensaje confirma que el servicio de mailing está <b>funcionando</b>.</p>
        <p>${message}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <p style="color:#777;font-size:12px">${APP_NAME}</p>
      </div>
    `.trim();

    const info = await sendEmail({
      to,
      subject,
      html,
      text: message,
      headers: { "X-Preheader": "Prueba de transporte SMTP" },
    });

    logger.info({ to, subject, messageId: info.messageId }, "Test email sent successfully");
  } catch (error) {
    logger.error({ error, to }, "Failed to send test email");
    throw new Error("Failed to send test email");
  }
}

// ---- Health-check del transporte ----
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    logger.info("Email service connection verified");
    return true;
  } catch (error) {
    logger.error({ error }, "Email service connection failed");
    return false;
  }
}
