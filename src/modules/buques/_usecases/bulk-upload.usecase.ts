import type { StatusType } from "@prisma/client";
import { buqueRepository } from "../_data/buque.repository";
import type { BulkBuqueItemInput, BulkBuqueRequestBody, BulkUploadMode } from "../buque.schemas";

export type BulkUploadError = {
  index: number;
  codigo?: string;
  message: string;
  details?: any;
};

export type BulkUploadResult = {
  mode: BulkUploadMode;
  dryRun: boolean;
  force: boolean;
  requested: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: BulkUploadError[];
};

function prismaErrorMessage(err: any): string {
  if (err?.code === "P2002") {
    const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(", ") : "unique";
    return `Unique constraint failed (${target})`;
  }
  if (err?.code === "P2003") return "Foreign key constraint failed";
  return err?.message ?? "Unexpected error";
}

export async function bulkUploadBuquesUsecase(body: BulkBuqueRequestBody): Promise<BulkUploadResult> {
  const mode = body.mode;
  const dryRun = body.dryRun;
  const force = body.force;

  const requested = body.items.length;

  const errors: BulkUploadError[] = [];
  const invalid = new Set<number>();

  // 1) Validación mínima por item (sin tumbar el lote)
  const normalized: Array<{ index: number; raw: BulkBuqueItemInput; codigo: string }> = [];
  for (let i = 0; i < body.items.length; i++) {
    const raw = body.items[i] ?? {};
    const codigo = (raw.codigo ?? "").trim();

    if (!codigo || codigo.length < 2 || codigo.length > 20) {
      errors.push({ index: i, codigo: raw.codigo, message: "codigo requerido (min 2, max 20)" });
      invalid.add(i);
      continue;
    }

    // naviera si viene, que no sea basura
    if (raw.naviera !== undefined && raw.naviera.trim().length > 0 && raw.naviera.trim().length < 2) {
      errors.push({ index: i, codigo, message: "naviera inválida (min 2)" });
      invalid.add(i);
      continue;
    }

    normalized.push({ index: i, raw, codigo });
  }

  // 2) Duplicados por codigo en payload
  const seenCodigo = new Map<string, number>();
  for (const it of normalized) {
    const prev = seenCodigo.get(it.codigo);
    if (prev !== undefined) {
      errors.push({
        index: it.index,
        codigo: it.codigo,
        message: `Duplicated codigo in payload (first seen at index ${prev})`,
      });
      invalid.add(it.index);
      continue;
    }
    seenCodigo.set(it.codigo, it.index);
  }

  // 3) Prefetch existentes
  const codigos = Array.from(seenCodigo.keys());
  const existingRows = await buqueRepository.findByCodigos(codigos);
  const existingMap = new Map<
    string,
    {
      id: number;
      codigo: string;
      nombre: string;
      paisId: number | null;
      capacidad: number | null;
      naviera: string | null;
      status: StatusType;
    }
  >();

  const existingIds: number[] = [];
  for (const r of existingRows) {
    existingMap.set(r.codigo, r as any);
    existingIds.push((r as any).id);
  }

  // 4) Recaladas por buqueId (UPSERT SAFE)
  const recaladasCountMap = await buqueRepository.countRecaladasByBuqueIds(existingIds);

  // 5) Validación masiva de paisId
  const paisIds = Array.from(
    new Set(
      normalized
        .map((x) => x.raw.paisId)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
    ),
  );

  const existingPaisIds = await buqueRepository.findExistingPaisIds(paisIds);
  const paisSet = new Set<number>(existingPaisIds);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = errors.length;

  for (const it of normalized) {
    if (invalid.has(it.index)) continue;

    const raw = it.raw;
    const codigo = it.codigo;
    const exists = existingMap.get(codigo);

    // helper: valida paisId si viene
    if (raw.paisId !== undefined && !paisSet.has(raw.paisId)) {
      errors.push({ index: it.index, codigo, message: `El país (paisId=${raw.paisId}) no existe` });
      failed++;
      continue;
    }

    // CREATE_ONLY
    if (mode === "CREATE_ONLY") {
      if (exists) {
        skipped++;
        continue;
      }

      const nombre = (raw.nombre ?? "").trim();
      if (!nombre || nombre.length < 2) {
        errors.push({ index: it.index, codigo, message: "nombre requerido para crear (min 2)" });
        failed++;
        continue;
      }

      if (dryRun) {
        created++;
        continue;
      }

      try {
        await buqueRepository.create({
          codigo,
          nombre,
          paisId: raw.paisId ?? null,
          capacidad: raw.capacidad ?? null,
          naviera: raw.naviera ?? null,
          status: (raw.status ?? "ACTIVO") as StatusType,
        });
        created++;
      } catch (err: any) {
        errors.push({ index: it.index, codigo, message: prismaErrorMessage(err), details: err?.meta ?? null });
        failed++;
      }
      continue;
    }

    // UPSERT
    if (!exists) {
      const nombre = (raw.nombre ?? "").trim();
      if (!nombre || nombre.length < 2) {
        errors.push({ index: it.index, codigo, message: "nombre requerido para crear (min 2)" });
        failed++;
        continue;
      }

      if (dryRun) {
        created++;
        continue;
      }

      try {
        await buqueRepository.create({
          codigo,
          nombre,
          paisId: raw.paisId ?? null,
          capacidad: raw.capacidad ?? null,
          naviera: raw.naviera ?? null,
          status: (raw.status ?? "ACTIVO") as StatusType,
        });
        created++;
      } catch (err: any) {
        errors.push({ index: it.index, codigo, message: prismaErrorMessage(err), details: err?.meta ?? null });
        failed++;
      }
      continue;
    }

    // UPDATE (UPSERT SAFE)
    const recaladas = recaladasCountMap.get(exists.id) ?? 0;
    if (!force && recaladas > 0) {
      // Bloquear cambios “sensibles” si ya hay historial (recaladas)
      const wantsNombre = raw.nombre !== undefined && raw.nombre.trim().length >= 2 && raw.nombre.trim() !== exists.nombre;
      const wantsPais =
        raw.paisId !== undefined &&
        raw.paisId !== null &&
        raw.paisId !== exists.paisId;

      if (wantsNombre) {
        errors.push({
          index: it.index,
          codigo,
          message: "No se permite cambiar nombre: buque tiene recaladas (use force=true si aplica)",
          details: { recaladas },
        });
        failed++;
        continue;
      }

      if (wantsPais) {
        errors.push({
          index: it.index,
          codigo,
          message: "No se permite cambiar paisId: buque tiene recaladas (use force=true si aplica)",
          details: { recaladas },
        });
        failed++;
        continue;
      }
    }

    // patch parcial
    const patch: Partial<{
      nombre: string;
      paisId: number | null;
      capacidad: number | null;
      naviera: string | null;
      status: StatusType;
    }> = {};

    if (raw.nombre !== undefined) {
      const nombre = raw.nombre.trim();
      if (nombre.length >= 2 && nombre !== exists.nombre) patch.nombre = nombre;
    }

    if (raw.paisId !== undefined && raw.paisId !== exists.paisId) {
      patch.paisId = raw.paisId;
    }

    if (raw.capacidad !== undefined && raw.capacidad !== exists.capacidad) {
      patch.capacidad = raw.capacidad;
    }

    if (raw.naviera !== undefined && raw.naviera !== exists.naviera) {
      patch.naviera = raw.naviera;
    }

    if (raw.status !== undefined && raw.status !== exists.status) {
      patch.status = raw.status as StatusType;
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    if (dryRun) {
      updated++;
      continue;
    }

    try {
      await buqueRepository.update(exists.id, patch);
      updated++;
    } catch (err: any) {
      errors.push({ index: it.index, codigo, message: prismaErrorMessage(err), details: err?.meta ?? null });
      failed++;
    }
  }

  return {
    mode,
    dryRun,
    force,
    requested,
    created,
    updated,
    skipped,
    failed,
    errors,
  };
}