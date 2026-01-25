// src/libs/email.ts
import nodemailer from "nodemailer"
import { logger } from "./logger"
import { env } from "../config/env"

const SMTP_HOST = env.SMTP_HOST
const SMTP_PORT = env.SMTP_PORT
const SMTP_USER = env.SMTP_USER
const SMTP_PASS = env.SMTP_PASS
const EMAIL_FROM = env.EMAIL_FROM
const APP_LOGIN_URL = env.APP_LOGIN_URL
const APP_VERIFY_EMAIL_URL = env.APP_VERIFY_EMAIL_URL
const APP_NAME = process.env.APP_NAME || "Gestión de Guías Turísticos"

export interface InvitationEmailData {
  email: string
  tempPassword: string
  inviterName?: string
  expiresInHours: number
}

export interface PasswordResetEmailData {
  to: string
  resetUrl: string
  ttlMinutes: number
}

export interface VerifyEmailEmailData {
  to: string
  verifyUrl: string
  ttlMinutes: number
}

export type SendEmailInput = {
  to: string
  subject: string
  html?: string
  text?: string
  headers?: Record<string, string>
}

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
    minVersion: "TLSv1.2",
  },
})

// ---- INVITATION TEMPLATE ----
function generateInvitationHTML(data: InvitationEmailData): string {
  const { email, tempPassword, inviterName, expiresInHours } = data

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
  `.trim()
}

// ---- PASSWORD RESET TEMPLATE ----
function generatePasswordResetHTML(data: PasswordResetEmailData): string {
  const { resetUrl, ttlMinutes } = data

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Recuperación de contraseña - ${APP_NAME}</title>
  <style>
    body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background:#f5f5f5; color:#333 }
    .container { max-width:600px; margin:40px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1) }
    .header { background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%); padding:40px 30px; text-align:center; color:#fff }
    .header h1 { margin:0; font-size:26px; font-weight:700 }
    .content { padding:40px 30px }
    .content p { line-height:1.6; margin:0 0 16px 0; color:#555 }
    .cta-button { display:block; width:fit-content; margin:28px auto; padding:14px 36px; background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%); color:#fff; text-decoration:none; border-radius:8px; font-weight:700; font-size:15px; text-align:center; }
    .hint { text-align:center; color:#6c757d; font-size:13px; margin-top:10px }
    .warning-box { background:#fff3cd; border-left:4px solid #f59e0b; padding:16px; margin:22px 0; border-radius:4px }
    .warning-box p { margin:0; color:#856404; font-size:14px }
    .footer { background:#f8f9fa; padding:24px 30px; text-align:center; font-size:12px; color:#6c757d }
    a { color:#0ea5e9 }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Recuperación de contraseña</h1>
    </div>
    <div class="content">
      <p>Recibimos una solicitud para restablecer tu contraseña en <strong>${APP_NAME}</strong>.</p>
      <p>Haz clic en el botón para crear una nueva contraseña:</p>

      <a href="${resetUrl}" class="cta-button">Restablecer contraseña</a>

      <p class="hint">Si el botón no funciona, copia y pega este enlace:</p>
      <p class="mono">${resetUrl}</p>

      <div class="warning-box">
        <p>⏰ <strong>Importante:</strong> Este enlace expira en <strong>${ttlMinutes} minutos</strong>.</p>
      </div>

      <p style="margin-top:24px; font-size:14px; color:#6c757d;">
        <strong>Nota de seguridad:</strong> Si tú no solicitaste este cambio, puedes ignorar este correo.
      </p>
    </div>
    <div class="footer">
      <p><strong>${APP_NAME}</strong></p>
      <p>Este correo fue enviado automáticamente. No respondas a este mensaje.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

// ---- VERIFY EMAIL TEMPLATE ----
function generateVerifyEmailHTML(data: VerifyEmailEmailData): string {
  const { verifyUrl, ttlMinutes } = data

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verifica tu correo - ${APP_NAME}</title>
  <style>
    body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background:#f5f5f5; color:#333 }
    .container { max-width:600px; margin:40px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1) }
    .header { background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%); padding:40px 30px; text-align:center; color:#fff }
    .header h1 { margin:0; font-size:26px; font-weight:800 }
    .content { padding:40px 30px }
    .content p { line-height:1.6; margin:0 0 16px 0; color:#555 }
    .cta-button { display:block; width:fit-content; margin:28px auto; padding:14px 36px; background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%); color:#fff; text-decoration:none; border-radius:8px; font-weight:800; font-size:15px; text-align:center; }
    .hint { text-align:center; color:#6c757d; font-size:13px; margin-top:10px }
    .warning-box { background:#fff3cd; border-left:4px solid #f59e0b; padding:16px; margin:22px 0; border-radius:4px }
    .warning-box p { margin:0; color:#856404; font-size:14px }
    .footer { background:#f8f9fa; padding:24px 30px; text-align:center; font-size:12px; color:#6c757d }
    a { color:#10b981 }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Verifica tu correo</h1>
    </div>
    <div class="content">
      <p>Para activar tu cuenta en <strong>${APP_NAME}</strong>, necesitamos confirmar que este correo te pertenece.</p>
      <p>Haz clic en el botón para verificar tu email:</p>

      <a href="${verifyUrl}" class="cta-button">Verificar correo</a>

      <p class="hint">Si el botón no funciona, copia y pega este enlace:</p>
      <p class="mono">${verifyUrl}</p>

      <div class="warning-box">
        <p>⏰ <strong>Importante:</strong> Este enlace expira en <strong>${ttlMinutes} minutos</strong>.</p>
      </div>

      <p style="margin-top:24px; font-size:14px; color:#6c757d;">
        <strong>Nota de seguridad:</strong> Si tú no solicitaste esta verificación, puedes ignorar este correo.
      </p>
    </div>
    <div class="footer">
      <p><strong>${APP_NAME}</strong></p>
      <p>Este correo fue enviado automáticamente. No respondas a este mensaje.</p>
      ${APP_LOGIN_URL ? `<p style="margin-top:10px;">Login: <a href="${APP_LOGIN_URL}">${APP_LOGIN_URL}</a></p>` : ""}
    </div>
  </div>
</body>
</html>
  `.trim()
}

// ---- low-level sender (reutilizable) ----
export async function sendEmail({
  to,
  subject,
  html,
  text,
  headers,
}: SendEmailInput) {
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
    headers,
  })

  logger.info(
    {
      to,
      subject,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
    },
    "[email] sent",
  )

  return info
}

// ---- API: invitación ----
export async function sendInvitationEmail(
  data: InvitationEmailData,
): Promise<void> {
  try {
    const html = generateInvitationHTML(data)
    const subject = "Has sido invitado a Gestión de Guías – activa tu cuenta"
    const preheader = `Tu acceso inicial y contraseña temporal caducan en ${data.expiresInHours} horas.`

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
    })

    logger.info(
      { email: data.email, messageId: info.messageId },
      "Invitation email sent successfully",
    )
  } catch (error) {
    logger.error({ error, email: data.email }, "Failed to send invitation email")
    throw new Error("Failed to send invitation email")
  }
}

// ---- API: reset password ----
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<void> {
  try {
    const html = generatePasswordResetHTML(data)
    const subject = `Recupera tu contraseña – ${APP_NAME}`
    const preheader = `Enlace válido por ${data.ttlMinutes} minutos.`

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
    })

    logger.info(
      { to: data.to, messageId: info.messageId },
      "Password reset email sent successfully",
    )
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to send password reset email")
    throw new Error("Failed to send password reset email")
  }
}

// ---- API: verify email ----
export async function sendVerifyEmailEmail(
  data: VerifyEmailEmailData,
): Promise<void> {
  try {
    const html = generateVerifyEmailHTML(data)
    const subject = `Verifica tu correo – ${APP_NAME}`
    const preheader = `Enlace válido por ${data.ttlMinutes} minutos.`

    const info = await sendEmail({
      to: data.to,
      subject,
      html,
      text: `
Verificación de correo - ${APP_NAME}

Para activar tu cuenta, abre este enlace:
${data.verifyUrl}

Este enlace expira en ${data.ttlMinutes} minutos.

Si no solicitaste esta verificación, ignora este correo.
      `.trim(),
      headers: { "X-Preheader": preheader },
    })

    logger.info(
      { to: data.to, messageId: info.messageId },
      "Verify email sent successfully",
    )
  } catch (error) {
    logger.error({ error, to: data.to }, "Failed to send verify email")
    throw new Error("Failed to send verify email")
  }
}

// ---- API: prueba de mailing ----
export async function sendTestEmail(
  to: string,
  subject = "Prueba SMTP – Gestión de Guías",
  message = "Hola, esto es una prueba de envío de correo.",
): Promise<void> {
  try {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
        <h2 style="margin:0 0 8px">🚀 Prueba de correo SMTP</h2>
        <p>Este mensaje confirma que el servicio de mailing está <b>funcionando</b>.</p>
        <p>${message}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <p style="color:#777;font-size:12px">${APP_NAME}</p>
      </div>
    `.trim()

    const info = await sendEmail({
      to,
      subject,
      html,
      text: message,
      headers: { "X-Preheader": "Prueba de transporte SMTP" },
    })

    logger.info(
      { to, subject, messageId: info.messageId },
      "Test email sent successfully",
    )
  } catch (error) {
    logger.error({ error, to }, "Failed to send test email")
    throw new Error("Failed to send test email")
  }
}

// ---- Health-check del transporte ----
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify()
    logger.info("Email service connection verified")
    return true
  } catch (error) {
    logger.error({ error }, "Email service connection failed")
    return false
  }
}
