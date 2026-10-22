import { formatRupees } from "@/lib/money";
import { budgetStatus, type BudgetLevel, type BudgetStatus } from "@/lib/rules/budget";

// Budget status on the monthly view (DESIGN §3.6 B2). The words always say what the colour shows, so nothing
// depends on seeing amber or red.

const barColour: Record<BudgetLevel, string> = { ok: "bg-teal-600", near: "bg-amber-500", over: "bg-red-600" };
const textColour: Record<BudgetLevel, string> = { ok: "text-zinc-600", near: "text-amber-800", over: "font-semibold text-red-700" };

/** "71% of ₹40,000.00 budget · ₹11,280.00 left", or "Over budget by ₹1,500.00". */
export function budgetText(status: BudgetStatus, budgetPaise: number): string {
  if (status.level === "over") return `Over budget by ${formatRupees(status.overPaise)}`;
  return `${status.percent}% of ${formatRupees(budgetPaise)} budget · ${formatRupees(status.leftPaise)} left`;
}

/**
 * One category's bar on the monthly view (B2 + B3): spending on a scale shared by every row, so the bars compare
 * at a glance; with a budget, a dark tick marks it on the same scale, the fill takes the status colour and the
 * words underneath say how much is used or over.
 */
export function SpendBar({ spentPaise, budgetPaise, scalePaise }: { spentPaise: number; budgetPaise: number | null; scalePaise: number }) {
  const at = (paise: number) => Math.min(100, (paise / scalePaise) * 100);
  const status = budgetPaise === null ? null : budgetStatus(spentPaise, budgetPaise);
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className="relative h-2 bg-zinc-100">
        {spentPaise > 0 && (
          <div
            className={`h-full rounded-r-[4px] ${barColour[status?.level ?? "ok"]}`}
            style={{ width: `max(2px, ${at(spentPaise)}%)` }}
          />
        )}
        {budgetPaise !== null && (
          <div
            data-testid="budget-tick"
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-zinc-800"
            style={{ left: `${at(budgetPaise)}%` }}
          />
        )}
      </div>
      {status && budgetPaise !== null && (
        <p data-level={status.level} className={`text-xs ${textColour[status.level]}`}>
          {budgetText(status, budgetPaise)}
        </p>
      )}
    </div>
  );
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
