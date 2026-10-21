// Account form rules (DESIGN §3.1, A1–A9). The same schemas run in the Server Actions, so nothing here is
// trusted from the browser.
import * as z from "zod";
import { normalizeAnswer, QUESTION_CODES, type QuestionCode } from "@/lib/security-questions";

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(4, { error: "Username must be at least 4 characters." })
  .max(30, { error: "Username can be at most 30 characters." })
  .regex(/^[a-z][a-z0-9._]*$/, {
    error: "Use letters, digits, dot or underscore, starting with a letter.",
  });

export const password = z
  .string()
  .min(8, { error: "Password must be at least 8 characters." })
  .max(128, { error: "Password can be at most 128 characters." })
  .regex(/[A-Za-z]/, { error: "Password needs at least one letter." })
  .regex(/\d/, { error: "Password needs at least one digit." });

export const displayName = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, { error: "Name must be at least 2 characters." })
      .max(60, { error: "Name can be at most 60 characters." }),
  );

/** "+91 98480 12345", "098480-12345" → "9848012345"; null if it isn't an Indian mobile number. */
export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/[\s-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Optional mobile: blank → undefined. */
export const mobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return undefined;
    const normalized = normalizeMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return normalized;
  });

/** Optional email: blank → undefined. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(""), z.email({ error: "Enter a valid email address." })]))
  .transform((v) => (v === "" ? undefined : v));

const questionCode = z.enum(QUESTION_CODES as [QuestionCode, ...QuestionCode[]], { error: "Choose a question." });

const answer = z
  .string()
  .transform(normalizeAnswer)
  .pipe(
    z
      .string()
      .min(2, { error: "Answer must be at least 2 characters." })
      .max(60, { error: "Answer can be at most 60 characters." }),
  );

export const securityQuestionFields = {
  question1: questionCode,
  answer1: answer,
  question2: questionCode,
  answer2: answer,
};

type Ctx = z.RefinementCtx;

// Cross-field checks run even when another field already failed, so the user sees every problem at once.
const ALWAYS = { when: () => true };

function checkQuestionsDiffer(v: { question1: string; question2: string }, ctx: Ctx) {
  if (v.question1 === v.question2) {
    ctx.addIssue({ code: "custom", path: ["question2"], message: "Choose two different questions." });
  }
}

function checkNewPassword(
  v: { newPassword: string; confirmPassword: string },
  usernameValue: string,
  ctx: Ctx,
  field = "newPassword",
) {
  if (v.newPassword !== v.confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords don't match." });
  }
  if (usernameValue && String(v.newPassword).toLowerCase() === String(usernameValue).toLowerCase()) {
    ctx.addIssue({ code: "custom", path: [field], message: "Password can't be the same as the username." });
  }
}

export const registerSchema = z
  .object({
    username,
    displayName,
    newPassword: password,
    confirmPassword: z.string(),
    mobile,
    email,
    ...securityQuestionFields,
  })
  .superRefine((v, ctx) => {
    checkNewPassword(v, v.username, ctx);
    checkQuestionsDiffer(v, ctx);
  }, ALWAYS);

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: "Enter your username." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

/** Change password on the account page (needs the current one). */
export const changePasswordSchema = (forUsername: string) =>
  z
    .object({
      currentPassword: z.string().min(1, { error: "Enter your current password." }),
      newPassword: password,
      confirmPassword: z.string(),
    })
    .superRefine((v, ctx) => checkNewPassword(v, forUsername, ctx), ALWAYS);

/** First login after the head created the account or reset the password: new password only… */
export const firstLoginSchema = (forUsername: string) =>
  z
    .object({ newPassword: password, confirmPassword: z.string() })
    .superRefine((v, ctx) => checkNewPassword(v, forUsername, ctx), ALWAYS);

/** …plus security questions when the user has none yet (accounts the head created). */
export const firstLoginWithQuestionsSchema = (forUsername: string) =>
  z
    .object({ newPassword: password, confirmPassword: z.string(), ...securityQuestionFields })
    .superRefine((v, ctx) => {
      checkNewPassword(v, forUsername, ctx);
      checkQuestionsDiffer(v, ctx);
    }, ALWAYS);

export const profileSchema = z.object({ displayName, mobile, email });

export const changeQuestionsSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    ...securityQuestionFields,
  })
  .superRefine(checkQuestionsDiffer, ALWAYS);

export const recoveryStartSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: "Enter your username." }),
});

export const recoveryResetSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(1),
    answer1: z.string().transform(normalizeAnswer).pipe(z.string().min(1, { error: "Enter the answer." })),
    answer2: z.string().transform(normalizeAnswer).pipe(z.string().min(1, { error: "Enter the answer." })),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => checkNewPassword(v, v.username, ctx), ALWAYS);
