import { redirect } from "next/navigation";
import { isIsoMonth, monthOf, todayInIndia } from "@/lib/rules/dates";
import { requireFamily } from "@/server/auth/family";

// /month → this month; /month?month=2026-05 (the "Go to month" picker) → that month.
export default async function MonthIndex({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await requireFamily();
  const { month } = await searchParams;
  redirect(`/month/${typeof month === "string" && isIsoMonth(month) ? month : monthOf(todayInIndia())}`);
}
