"use server";

import { redirect } from "next/navigation";
import { invalid, keepValues, readForm, type FormState } from "@/lib/form-state";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";
import {
  changePasswordSchema,
  changeQuestionsSchema,
  firstLoginSchema,
  firstLoginWithQuestionsSchema,
  loginSchema,
  profileSchema,
  recoveryResetSchema,
  recoveryStartSchema,
  registerSchema,
} from "@/lib/validation/auth";
import { endSession, requireUser, startSession } from "@/server/auth/session";
import {
  changePassword,
  changeSecurityQuestions,
  checkLogin,
  completeFirstLogin,
  hasSecurityQuestions,
  LOGIN_LOCK_MINUTES,
  recoverPassword,
  recoveryQuestions,
  registerUser,
  updateProfile,
} from "@/server/services/accounts";

// Server Actions = the "controllers": read the form, validate, call the service, answer the form.
// Anything the browser sends is re-validated here; redirect() must stay outside try/catch.

const indiaTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const QUESTION_FIELDS = ["question1", "answer1", "question2", "answer2"] as const;

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const form = readForm(formData, [
    "username",
    "displayName",
    "newPassword",
    "confirmPassword",
    "mobile",
    "email",
    ...QUESTION_FIELDS,
  ]);
  const values = keepValues(form, ["username", "displayName", "mobile", "email", "question1", "question2"]);
  const parsed = registerSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, values);

  const { newPassword, username, displayName, mobile, email, question1, answer1, question2, answer2 } = parsed.data;
  const result = await registerUser({
    username,
    displayName,
    mobile,
    email,
    password: newPassword,
    question1,
    answer1,
    question2,
    answer2,
  });
  if (!result.ok) {
    return { fieldErrors: { username: ["This username is taken. Try another."] }, values };
  }
  await startSession(result.userId);
  redirect("/");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const form = readForm(formData, ["username", "password"]);
  const values = keepValues(form, ["username"]);
  const parsed = loginSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await checkLogin(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? `Too many wrong attempts. For your safety this account is locked until ${indiaTime.format(result.lockedUntil)}.`
        : `Wrong username or password. After 5 wrong tries the account locks for ${LOGIN_LOCK_MINUTES} minutes.`;
    return { message, values };
  }
  await startSession(result.userId);
  redirect(result.mustChangePassword ? "/first-login" : "/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

// ── Forgot password: step 1 shows the questions, step 2 checks answers and sets the new password ──

export type RecoveryState = FormState & { questions?: [string, string]; username?: string };

export async function recoveryStartAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const form = readForm(formData, ["username"]);
  const parsed = recoveryStartSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  const [q1, q2] = await recoveryQuestions(parsed.data.username);
  return { username: parsed.data.username, questions: [SECURITY_QUESTIONS[q1], SECURITY_QUESTIONS[q2]] };
}

export async function recoveryResetAction(prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const form = readForm(formData, ["username", "answer1", "answer2", "newPassword", "confirmPassword"]);
  const keep = { username: prev.username, questions: prev.questions };
  const parsed = recoveryResetSchema.safeParse(form);
  if (!parsed.success) return { ...keep, ...invalid(parsed.error) };

  const { username, answer1, answer2, newPassword } = parsed.data;
  const result = await recoverPassword(username, answer1, answer2, newPassword);
  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? `Too many wrong answers. Try again after ${indiaTime.format(result.lockedUntil)}, or ask your family head to reset your password.`
        : "The answers don't match. Check the spelling, or ask your family head to reset your password.";
    return { ...keep, message };
  }
  await startSession(result.userId);
  redirect("/");
}

// ── Logged-in actions ─────────────────────────────────────────────────────────

export async function firstLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser({ allowTemporaryPassword: true });
  const needsQuestions = !(await hasSecurityQuestions(user.id));
  const form = readForm(formData, ["newPassword", "confirmPassword", ...QUESTION_FIELDS]);
  const values = keepValues(form, ["question1", "question2"]);

  if (needsQuestions) {
    const parsed = firstLoginWithQuestionsSchema(user.username).safeParse(form);
    if (!parsed.success) return invalid(parsed.error, values);
    const { newPassword, question1, answer1, question2, answer2 } = parsed.data;
    await completeFirstLogin(user.id, user.sessionId, newPassword, { question1, answer1, question2, answer2 });
  } else {
    const parsed = firstLoginSchema(user.username).safeParse(form);
    if (!parsed.success) return invalid(parsed.error, values);
    await completeFirstLogin(user.id, user.sessionId, parsed.data.newPassword);
  }
  redirect("/");
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const form = readForm(formData, ["displayName", "mobile", "email"]);
  const parsed = profileSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  await updateProfile(user.id, parsed.data);
  return { ok: true, message: "Profile saved.", values: form };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const form = readForm(formData, ["currentPassword", "newPassword", "confirmPassword"]);
  const parsed = changePasswordSchema(user.username).safeParse(form);
  if (!parsed.success) return invalid(parsed.error);
  const result = await changePassword(user.id, user.sessionId, parsed.data.currentPassword, parsed.data.newPassword);
  if (!result.ok) return { fieldErrors: { currentPassword: ["Current password is wrong."] } };
  return { ok: true, message: "Password changed. You've been signed out on your other devices." };
}

export async function changeQuestionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const form = readForm(formData, ["currentPassword", ...QUESTION_FIELDS]);
  const values = keepValues(form, ["question1", "question2"]);
  const parsed = changeQuestionsSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, values);
  const { currentPassword, ...questions } = parsed.data;
  const result = await changeSecurityQuestions(user.id, currentPassword, questions);
  if (!result.ok) return { fieldErrors: { currentPassword: ["Current password is wrong."] }, values };
  return { ok: true, message: "Security questions updated.", values };
}
