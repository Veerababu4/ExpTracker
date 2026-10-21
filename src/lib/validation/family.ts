// Family form rules (DESIGN §3.2).
import * as z from "zod";
import { isJoinCode, normalizeJoinCode } from "@/lib/rules/join-code";
import { displayName, email, mobile, password, username } from "@/lib/validation/auth";

export const familyNameSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, { error: "Family name must be at least 2 characters." })
        .max(60, { error: "Family name can be at most 60 characters." }),
    ),
});

export const joinCodeSchema = z.object({
  code: z
    .string()
    .transform(normalizeJoinCode)
    .pipe(z.string().refine(isJoinCode, { error: "Family codes have 8 letters and digits, like ABCD-2345." })),
});

const ALWAYS = { when: () => true };

/** Head creates a login for a family member (F5). */
export const memberLoginSchema = z
  .object({ username, displayName, tempPassword: password, mobile, email })
  .superRefine((v, ctx) => {
    if (String(v.tempPassword).toLowerCase() === String(v.username).toLowerCase()) {
      ctx.addIssue({ code: "custom", path: ["tempPassword"], message: "Password can't be the same as the username." });
    }
  }, ALWAYS);

/** Head resets a member's password (F6). */
export const resetPasswordSchema = z.object({ tempPassword: password });

export const uuidSchema = z.uuid({ error: "Unknown item." });
