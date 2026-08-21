import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/** Zod v4 schemas are structurally compatible at runtime with the hookform resolver. */
export function formResolver<TValues extends FieldValues>(
  schema: ZodType,
): Resolver<TValues> {
  return zodResolver(schema as never) as Resolver<TValues>;
}
