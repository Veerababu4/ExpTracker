import { formatRupees } from "@/lib/money";
import type { BudgetLevel, BudgetStatus } from "@/lib/rules/budget";

// Budget status on the monthly view (DESIGN §3.6 B2). The words always say what the colour shows, so nothing
// depends on seeing amber or red.

const barColour: Record<BudgetLevel, string> = { ok: "bg-teal-600", near: "bg-amber-500", over: "bg-red-600" };
const textColour: Record<BudgetLevel, string> = { ok: "text-zinc-600", near: "text-amber-800", over: "font-semibold text-red-700" };

/** "71% of ₹40,000.00 budget · ₹11,280.00 left", or "Over budget by ₹1,500.00". */
export function budgetText(status: BudgetStatus, budgetPaise: number): string {
  if (status.level === "over") return `Over budget by ${formatRupees(status.overPaise)}`;
  return `${status.percent}% of ${formatRupees(budgetPaise)} budget · ${formatRupees(status.leftPaise)} left`;
}

export function BudgetStatusLine({
  status,
  budgetPaise,
  testId,
  thick = false,
}: {
  status: BudgetStatus;
  budgetPaise: number;
  testId?: string;
  /** The month total gets a thicker bar than the category rows. */
  thick?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className={`${thick ? "h-2.5" : "h-1.5"} overflow-hidden rounded-full bg-zinc-200`}>
        <div className={`h-full ${barColour[status.level]}`} style={{ width: `${Math.min(100, status.percent)}%` }} />
      </div>
      <p data-testid={testId} data-level={status.level} className={`${thick ? "text-sm" : "text-xs"} ${textColour[status.level]}`}>
        {budgetText(status, budgetPaise)}
      </p>
    </div>
  );
}
