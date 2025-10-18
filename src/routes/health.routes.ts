import { Router } from "express";
import { liveness, readiness } from "../modules/health/health.controller";

const router = Router();

router.get("/", liveness);
router.get("/ready", readiness);

export default router;
