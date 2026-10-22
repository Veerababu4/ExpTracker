import { Card } from "@/components/card";
import { ColumnChart, type ColumnDatum } from "@/components/column-chart";
import { compactRupees, dailyTotals, isDayTick, niceScale } from "@/lib/charts";
import { formatIsoDay, formatMonth, formatShortMonth } from "@/lib/format";
import { formatRupees } from "@/lib/money";
import type { IsoDate, IsoMonth } from "@/lib/rules/dates";
import type { ExpenseView } from "@/server/services/expenses";
import type { MonthTotal } from "@/server/services/reports";

// Charts on the monthly view (DESIGN §3.6 B3). Each one has a written summary under its title, columns that
// lead to the matching search or month, a tooltip on hover/focus, and "Show as table" with every number.

const expensesText = (n: number) => `${n} ${n === 1 ? "expense" : "expenses"}`;

/** Spending on each day of the month; the highest day carries its value. Days still to come stay empty. */
export function DailyChart({ month, expenses, today }: { month: IsoMonth; expenses: ExpenseView[]; today: IsoDate }) {
  const days = dailyTotals(expenses, month);
  const top = days.reduce((a, b) => (b.paise > a.paise ? b : a));
  const sofar = days.filter((d) => d.date <= today);
  const average = Math.round(sofar.reduce((sum, d) => sum + d.paise, 0) / Math.max(1, sofar.length));
  const columns: ColumnDatum[] = days.map((d) => ({
    key: d.date,
    axisLabel: isDayTick(d.day, days.length) ? String(d.day) : "",
    paise: d.paise,
    tip: d.date <= today ? { value: formatRupees(d.paise), label: `${formatIsoDay(d.date)} · ${expensesText(d.count)}` } : undefined,
    href: d.count > 0 ? `/search?${new URLSearchParams({ from: d.date, to: d.date })}` : undefined,
    ariaLabel: `${formatIsoDay(d.date)}: ${formatRupees(d.paise)}, ${expensesText(d.count)}`,
    valueLabel: d.date === top.date ? compactRupees(d.paise) : undefined,
  }));
  const ongoing = sofar.length < days.length;

  return (
    <Card
      title="Day by day"
      id="daily"
      note={`Highest: ${formatRupees(top.paise)} on ${formatIsoDay(top.date)} · on average ${formatRupees(average)} a day${ongoing ? " so far" : ""}`}
    >
      <ColumnChart columns={columns} scale={niceScale(top.paise)} />
      <TableView
        caption={`Spending per day in ${formatMonth(month)}`}
        head={["Day", "Expenses", "Amount"]}
        rows={days.filter((d) => d.count > 0).map((d) => [formatIsoDay(d.date), String(d.count), formatRupees(d.paise)])}
      />
    </Card>
  );
}

/** The last 6 months up to this one: this month in the accent colour, earlier months grey, budgets as ticks. */
export function TrendChart({ month, trend, budgets }: { month: IsoMonth; trend: MonthTotal[]; budgets: Map<IsoMonth, number> }) {
  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const max = Math.max(...trend.map((t) => Math.max(t.paise, budgets.get(t.month) ?? 0)));
  const difference = current.paise - previous.paise;
  const comparison =
    difference === 0
      ? `the same as ${formatMonth(previous.month)}`
      : `${formatRupees(Math.abs(difference))} ${difference > 0 ? "more" : "less"} than ${formatMonth(previous.month)}`;
  const budgetText = (m: IsoMonth) => {
    const b = budgets.get(m);
    return b === undefined ? "" : ` · budget ${formatRupees(b)}`;
  };
  const columns: ColumnDatum[] = trend.map((t) => ({
    key: t.month,
    axisLabel: formatShortMonth(t.month),
    paise: t.paise,
    tip: { value: formatRupees(t.paise), label: `${formatMonth(t.month)}${budgetText(t.month)}` },
    href: t.month === month ? undefined : `/month/${t.month}`,
    ariaLabel: `${formatMonth(t.month)}: ${formatRupees(t.paise)}${budgetText(t.month)}`,
    emphasis: t.month === month,
    referencePaise: budgets.get(t.month) ?? null,
    valueLabel: t.month === month ? compactRupees(t.paise) : undefined,
  }));

  return (
    <Card title="Last 6 months" id="trend" note={`${formatRupees(current.paise)} in ${formatMonth(month)} — ${comparison}`}>
      <ColumnChart columns={columns} scale={niceScale(max)} />
      <ul aria-label="Legend" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-teal-600" />
          {formatMonth(month)}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-zinc-300" />
          Earlier months
        </li>
        {budgets.size > 0 && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 bg-zinc-800" />
            Family budget
          </li>
        )}
      </ul>
      <TableView
        caption="Spending in the last 6 months"
        head={["Month", "Spent", "Family budget"]}
        rows={trend.map((t) => {
          const b = budgets.get(t.month);
          return [formatMonth(t.month), formatRupees(t.paise), b === undefined ? "—" : formatRupees(b)];
        })}
      />
    </Card>
  );
}

/** The chart's numbers as a table (the accessible twin of the chart), folded away until asked for. */
function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700 hover:underline">Show as table</summary>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-zinc-500">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`py-1 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="py-1.5 text-left font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="py-1.5 text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
