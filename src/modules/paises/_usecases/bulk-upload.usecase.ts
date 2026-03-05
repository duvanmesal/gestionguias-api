import type { StatusType } from "@prisma/client";
import { z } from "zod";
import { paisRepository } from "../_data/pais.repository";
import type { BulkPaisItemInput, BulkPaisRequestBody, BulkUploadMode } from "../pais.schemas";

export type BulkUploadError = {
  index: number;
  codigo?: string;
  message: string;
  details?: any;
};

export type BulkUploadResult = {
  mode: BulkUploadMode;
  dryRun: boolean;
  requested: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: BulkUploadError[];
};

const itemSchema = z.object({
  codigo: z.string().trim().min(2).max(10),
  nombre: z.string().trim().min(2).optional(),
  status: z.custom<StatusType>().optional(),
});

function prismaErrorMessage(err: any): string {
  if (err?.code === "P2002") {
    const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(", ") : "unique";
    return `Unique constraint failed (${target})`;
  }
  if (err?.code === "P2003") return "Foreign key constraint failed";
  return err?.message ?? "Unexpected error";
}

export async function bulkUploadPaisesUsecase(body: BulkPaisRequestBody): Promise<BulkUploadResult> {
  const mode = body.mode;
  const dryRun = body.dryRun;

  const requested = body.items.length;

  const errors: BulkUploadError[] = [];
  const invalid = new Set<number>();

  // 1) Validación base por item (sin tumbar todo el lote)
  const normalized: Array<{ index: number; raw: BulkPaisItemInput; codigo: string }> = [];
  for (let i = 0; i < body.items.length; i++) {
    const raw = body.items[i] ?? {};
    const codigo = (raw.codigo ?? "").trim();

    if (!codigo || codigo.length < 2 || codigo.length > 10) {
      errors.push({ index: i, codigo: raw.codigo, message: "codigo requerido (min 2, max 10)" });
      invalid.add(i);
      continue;
    }

    normalized.push({ index: i, raw, codigo });
  }

  // 2) Duplicados en payload (codigo)
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
  const existingRows = await paisRepository.findByCodigos(codigos);
  const existingMap = new Map<string, { id: number; codigo: string; nombre: string; status: StatusType }>();
  for (const r of existingRows) existingMap.set(r.codigo, r as any);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = errors.length;

  // 4) Procesar (parcial)
  for (const it of normalized) {
    if (invalid.has(it.index)) continue;

    const raw = it.raw;
    const codigo = it.codigo;

    // valida nombre si viene
    if (raw.nombre !== undefined && raw.nombre.trim().length > 0 && raw.nombre.trim().length < 2) {
      errors.push({ index: it.index, codigo, message: "nombre inválido (min 2)" });
      failed++;
      continue;
    }

    const exists = existingMap.get(codigo);

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
        await paisRepository.create({
          codigo,
          nombre,
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
        await paisRepository.create({
          codigo,
          nombre,
          status: (raw.status ?? "ACTIVO") as StatusType,
        });
        created++;
      } catch (err: any) {
        errors.push({ index: it.index, codigo, message: prismaErrorMessage(err), details: err?.meta ?? null });
        failed++;
      }
      continue;
    }

    // update parcial
    const patch: Partial<{ nombre: string; status: StatusType }> = {};

    if (raw.nombre !== undefined) {
      const nombre = raw.nombre.trim();
      if (nombre.length >= 2 && nombre !== exists.nombre) patch.nombre = nombre;
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
      await paisRepository.update(exists.id, patch);
      updated++;
    } catch (err: any) {
      errors.push({ index: it.index, codigo, message: prismaErrorMessage(err), details: err?.meta ?? null });
      failed++;
    }
  }

  return {
    mode,
    dryRun,
    requested,
    created,
    updated,
    skipped,
    failed,
    errors,
  };
}