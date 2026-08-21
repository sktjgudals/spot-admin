import { z } from "zod";

/** Treat empty form values as "not provided" instead of coercing them to 0. */
export function emptyToUndefined(value: unknown): unknown {
  return value === "" || value === null || value === undefined ? undefined : value;
}

export function optionalIntField(min: number, max?: number) {
  const number = z.coerce.number().int().min(min);
  const bounded = max === undefined ? number : number.max(max);
  return z.preprocess(emptyToUndefined, bounded.optional());
}
