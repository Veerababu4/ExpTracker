import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { myFamilies, pickActiveFamily } from "@/server/services/families";
import { requireUser } from "./session";

/** The logged-in user, all their families, and the one they're looking at (null if they have none). */
export const getFamilyContext = cache(async () => {
  const user = await requireUser();
  const families = await myFamilies(user.id);
  const family = pickActiveFamily(families, user.activeFamilyId, user.lastFamilyId);
  return { user, families, family };
});

/** Like getFamilyContext, but sends users without a family to the create/join page. */
export async function requireFamily() {
  const ctx = await getFamilyContext();
  if (!ctx.family) redirect("/welcome");
  return { ...ctx, family: ctx.family };
}
