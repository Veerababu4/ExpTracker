import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { myBooks, pickActiveFamily } from "@/server/services/families";
import { requireUser } from "./session";

/**
 * The logged-in user, their books (My expenses first, then their families), their families alone, and the book
 * they're looking at (M8: everyone has My expenses, so it's only null if that book is somehow missing).
 */
export const getFamilyContext = cache(async () => {
  const user = await requireUser();
  const books = await myBooks(user.id);
  const families = books.filter((b) => b.kind === "FAMILY");
  const family = pickActiveFamily(books, user.activeFamilyId, user.lastFamilyId);
  return { user, books, families, family };
});

/** Like getFamilyContext, but always with a book to show. */
export async function requireFamily() {
  const ctx = await getFamilyContext();
  if (!ctx.family) redirect("/welcome");
  return { ...ctx, family: ctx.family };
}
