import type { NextRequest } from "next/server";
import { ownerLabel } from "@/components/expense-list";
import { toCsv } from "@/lib/csv";
import { PAYMENT_MODES, UNCATEGORISED } from "@/lib/expense-options";
import { paiseToInput } from "@/lib/money";
import { todayInIndia } from "@/lib/rules/dates";
import { uuidSchema } from "@/lib/validation/family";
import { searchSchema } from "@/lib/validation/search";
import { getCurrentUser } from "@/server/auth/session";
import { NotAllowedError } from "@/server/services/families";
import { exportExpenses } from "@/server/services/reports";

// GET /export/expenses?family=…&from=…&to=…[&member&category&mode] — the expenses of a search or a month as a
// CSV file for Excel (DESIGN §3.6 B4). Same filters and rules as /search; only members of that family get it.

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Please log in to download expenses.", { status: 401, headers: noStore });

  const params = request.nextUrl.searchParams;
  const one = (name: string) => params.get(name) ?? "";
  const family = uuidSchema.safeParse(one("family"));
  const filters = searchSchema(todayInIndia()).safeParse({
    from: one("from"),
    to: one("to"),
    member: one("member"),
    category: one("category"),
    mode: one("mode"),
  });
  if (!family.success || !filters.success) return new Response("This download link isn't valid.", { status: 400, headers: noStore });

  let rows;
  try {
    rows = await exportExpenses(user.id, family.data, filters.data);
  } catch (error) {
    // Not a member (any more): answer like a missing page, so the address reveals nothing.
    if (error instanceof NotAllowedError) return new Response("Not found.", { status: 404, headers: noStore });
    throw error;
  }

  const csv = toCsv([
    ["Date", "Member", "Category", "Payment mode", "Amount (₹)", "Note", "Receipt"],
    ...rows.map((e) => [
      e.expenseDate, // YYYY-MM-DD: Excel reads it as a date in any locale
      ownerLabel(e),
      e.categoryName ?? UNCATEGORISED,
      e.paymentMode ? PAYMENT_MODES[e.paymentMode] : "",
      paiseToInput(e.amountPaise), // plain number, so Excel can add the column up
      e.note ?? "",
      e.receipt ? "Yes" : "",
    ]),
  ]);
  const { from, to } = filters.data;
  return new Response(csv, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses_${from}_to_${to}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
