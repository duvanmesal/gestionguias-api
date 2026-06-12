import { z } from "zod";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "on", "si"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", ""]);

export const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
  }

  return value;
}, z.boolean());
