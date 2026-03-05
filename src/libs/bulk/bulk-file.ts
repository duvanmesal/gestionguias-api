import * as XLSX from "xlsx";
import { BadRequestError } from "../errors";

export type TabularFormat = "csv" | "xlsx";

export type ParsedTabular = {
  format: TabularFormat;
  headers: string[];
  rows: Array<Record<string, string>>;
};

function baseContentType(ct?: string): string {
  if (!ct) return "";
  return ct.split(";")[0]?.trim().toLowerCase() ?? "";
}

function looksLikeXlsx(buffer: Buffer): boolean {
  // XLSX es un zip, firma típica "PK"
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function detectDelimiter(headerLine: string): string {
  const comma = (headerLine.match(/,/g) ?? []).length;
  const semi = (headerLine.match(/;/g) ?? []).length;
  if (semi > comma) return ";";
  return ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";

    if (ch === '"') {
      const next = line[i + 1];
      // Escaped quote
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

export function normalizeHeaderKey(input: string): string {
  // quita tildes/diacríticos + deja alfanumérico
  const s = input
    .trim()
    .normalize("NFD")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return s.replace(/[^a-z0-9]+/g, "");
}

export function parseTabularBuffer(args: {
  buffer: Buffer;
  contentType?: string;
}): ParsedTabular {
  const ct = baseContentType(args.contentType);

  const isXlsx =
    ct === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    (ct === "application/octet-stream" && looksLikeXlsx(args.buffer)) ||
    looksLikeXlsx(args.buffer);

  if (isXlsx) {
    const wb = XLSX.read(args.buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new BadRequestError("XLSX inválido (sin hojas)");

    const sheet = wb.Sheets[firstSheetName];
    if (!sheet) throw new BadRequestError("XLSX inválido (hoja vacía)");

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    }) as Array<Record<string, unknown>>;

    const rows: Array<Record<string, string>> = rawRows.map((r) => {
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        obj[String(k)] = String(v ?? "").trim();
      }
      return obj;
    });

    const headers = rawRows.length > 0 ? Object.keys(rawRows[0] ?? {}) : [];
    return { format: "xlsx", headers, rows };
  }

  const isCsv = ct === "text/csv" || ct === "text/plain" || ct === "application/octet-stream";
  if (!isCsv) {
    throw new BadRequestError(
      `Tipo de archivo no soportado (Content-Type: ${ct || "desconocido"})`
    );
  }

  const text = args.buffer.toString("utf8");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new BadRequestError("CSV vacío");

  const headerLine = lines[0] ?? "";
  const delimiter = detectDelimiter(headerLine);

  const headers = parseCsvLine(headerLine, delimiter).map((h) => h.trim());
  if (headers.length === 0) throw new BadRequestError("CSV inválido (sin headers)");

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const cols = parseCsvLine(line, delimiter);

    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] ?? `col${j}`;
      obj[key] = String(cols[j] ?? "").trim();
    }
    rows.push(obj);
  }

  return { format: "csv", headers, rows };
}