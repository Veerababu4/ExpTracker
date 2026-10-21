"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalid, keepValues, readForm, type FormState } from "@/lib/form-state";
import { familyNameSchema, joinCodeSchema, memberLoginSchema, resetPasswordSchema, uuidSchema } from "@/lib/validation/family";
import { requireUser } from "@/server/auth/session";
import {
  cancelJoinRequest,
  createFamily,
  createMemberLogin,
  decideJoinRequest,
  leaveFamily,
  regenerateJoinCode,
  removeMember,
  requestToJoin,
  resetMemberPassword,
  switchFamily,
  transferHead,
} from "@/server/services/families";

/**
 * The header (family name, switcher, nav) lives in the layout, which Next.js keeps across a redirect.
 * When membership or the active family changes, the layout must be re-rendered too.
 */
function refreshLayout() {
  revalidatePath("/", "layout");
}

// Family Server Actions (DESIGN §3.2). The family id comes from the form so an action always applies to the
// family the user was looking at; the service then checks the user's role in that family.

/** Reads a uuid field; a tampered value is rejected before reaching the database. */
function idFrom(formData: FormData, name: string): string {
  const parsed = uuidSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error("Invalid request.");
  return parsed.data;
}

export async function createFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const form = readForm(formData, ["name"]);
  const parsed = familyNameSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);
  await createFamily(user.id, parsed.data.name, user.sessionId);
  refreshLayout();
  redirect("/family?created=1");
}

export async function joinFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const form = readForm(formData, ["code"]);
  const parsed = joinCodeSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, form);

  const result = await requestToJoin(user.id, parsed.data.code);
  if (!result.ok) {
    const messages = {
      invalid_code: "No family has this code. Check it with your family head — codes can be changed.",
      already_member: "You're already a member of this family.",
      already_pending: "You've already asked to join this family. Waiting for the head to approve.",
    };
    return { fieldErrors: { code: [messages[result.reason]] }, values: form };
  }
  refresh();
  return {
    ok: true,
    message: `Request sent to “${result.familyName}”. You'll get access as soon as the family head approves.`,
  };
}

export async function cancelJoinRequestAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await cancelJoinRequest(user.id, idFrom(formData, "requestId"));
  refresh();
}

export async function switchFamilyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await switchFamily(user.id, idFrom(formData, "familyId"), user.sessionId);
  refreshLayout();
  redirect("/");
}

export async function regenerateJoinCodeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await regenerateJoinCode(user.id, idFrom(formData, "familyId"));
  refresh();
}

export async function decideJoinRequestAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const approve = formData.get("decision") === "approve";
  await decideJoinRequest(user.id, idFrom(formData, "familyId"), idFrom(formData, "requestId"), approve);
  refresh();
}

export async function createMemberLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const form = readForm(formData, ["username", "displayName", "tempPassword", "mobile", "email"]);
  const values = keepValues(form, ["username", "displayName", "mobile", "email"]);
  const parsed = memberLoginSchema.safeParse(form);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createMemberLogin(user.id, familyId, parsed.data);
  if (!result.ok) return { fieldErrors: { username: ["This username is taken. Try another."] }, values };
  refresh();
  return {
    ok: true,
    message: `Login created for ${parsed.data.displayName}. Share the username “${parsed.data.username}” and the temporary password with them — they'll choose their own password at first login.`,
  };
}

export async function resetMemberPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const familyId = idFrom(formData, "familyId");
  const memberId = idFrom(formData, "memberId");
  const parsed = resetPasswordSchema.safeParse(readForm(formData, ["tempPassword"]));
  if (!parsed.success) return invalid(parsed.error);
  await resetMemberPassword(user.id, familyId, memberId, parsed.data.tempPassword);
  return { ok: true, message: "Password reset. Share the temporary password; they'll choose their own at next login." };
}

export async function transferHeadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await transferHead(user.id, idFrom(formData, "familyId"), idFrom(formData, "memberId"));
  refresh();
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await removeMember(user.id, idFrom(formData, "familyId"), idFrom(formData, "memberId"));
  refresh();
}

export async function leaveFamilyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await leaveFamily(user.id, idFrom(formData, "familyId"));
  if (!result.ok) return { message: "You're the family head. Make another member head before leaving." };
  refreshLayout();
  redirect("/");
}

