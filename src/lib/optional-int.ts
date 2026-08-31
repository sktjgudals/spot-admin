import { z } from "zod/mini";

/** Treat empty form values as "not provided" instead of coercing them to 0. */
export function emptyToUndefined(value: unknown): unknown {
  return value === "" || value === null || value === undefined ? undefined : value;
}

export function optionalIntField(min: number, max?: number) {
  const bounded = z.coerce
    .number()
    .check(
      z.int(),
      z.minimum(min),
      ...(max === undefined ? [] : [z.maximum(max)]),
    );
  return z.pipe(z.transform(emptyToUndefined), z.optional(bounded));
}
