// Result returned by Server Actions to forms (used with React's useActionState).
import * as z from "zod";

export type FormState = {
  /** Field name → messages shown under that field. */
  fieldErrors?: Record<string, string[] | undefined>;
  /** Message for the whole form (error or success). */
  message?: string;
  ok?: boolean;
  /** Submitted non-secret values, so the form can show them again after an error. */
  values?: Record<string, string>;
};

/** Reads the named text fields from a form. Missing fields become "". */
export function readForm<K extends string>(formData: FormData, names: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

/** Copies only the safe fields (never passwords or answers) to send back to the form. */
export function keepValues(values: Record<string, string>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, values[n] ?? ""]));
}

export function invalid(error: z.ZodError, values?: Record<string, string>): FormState {
  return { fieldErrors: z.flattenError(error).fieldErrors, values };
}
