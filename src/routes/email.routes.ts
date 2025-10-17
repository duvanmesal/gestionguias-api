import { Router } from "express";
import { verifyEmailConnection, sendTestEmail } from "../libs/email";
import { ok } from "../libs/http";

const router = Router();

// Verificar conexión SMTP
router.get("/verify", async (_req, res, next) => {
  try {
    const isOk = await verifyEmailConnection();
    return res.json(ok({ ok: isOk }));
  } catch (err) {
    return next(err);
  }
});

// Enviar correo de prueba
router.post("/test", async (req, res, next) => {
  try {
    const { to, subject, message } = req.body ?? {};
    await sendTestEmail(to, subject, message);
    return res.json(ok({ to, subject }));
  } catch (err) {
    return next(err);
  }
});

export { router as emailRoutes };
