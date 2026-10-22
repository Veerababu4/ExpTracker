import Link from "next/link";
import { compactRupees, percentOf, type Scale } from "@/lib/charts";
import { ChartTips } from "./chart-tips";

// Column chart for the monthly view (DESIGN §3.6 B3), drawn as plain HTML boxes on the server — no chart library.
// Marks follow the chart guidelines: columns at most 24px wide with a 4px rounded top, a 2px gap between
// neighbours, hairline gridlines, one accent colour (teal-600, checked against the white card) and grey for
// context. Every chart that uses it also gives a written summary and a table, so nothing depends on colour or hover.

export type ColumnDatum = {
  key: string;
  /** Text under the column ("" = none; label sparingly). */
  axisLabel: string;
  paise: number;
  /** Tooltip; omit for columns with nothing to show (e.g. days still to come). */
  tip?: { value: string; label: string };
  /** Where the column leads; also makes it reachable with the keyboard. */
  href?: string;
  /** Screen-reader text for a column with an href. */
  ariaLabel?: string;
  /** false = grey context column; default = accent. */
  emphasis?: boolean;
  /** A reference value (e.g. that month's budget), drawn as a dark tick across the column. */
  referencePaise?: number | null;
  /** Value written on the cap — for the one or two columns the story is about. */
  valueLabel?: string;
};

export function ColumnChart({ columns, scale }: { columns: ColumnDatum[]; scale: Scale }) {
  const last = columns.length - 1;
  return (
    <div className="flex gap-2 text-[11px] text-zinc-500">
      {/* y axis: tick values next to the gridlines */}
      <div aria-hidden className="relative mt-5 h-36 w-9 shrink-0 text-right tabular-nums">
        {scale.ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${percentOf(t, scale)}%` }}>
            {compactRupees(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <ChartTips>
          {/* mt-5: room above the tallest column for its value label */}
          <div className="relative mt-5 h-36">
            {scale.ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-zinc-300" : "border-zinc-100"}`}
                style={{ bottom: `${percentOf(t, scale)}%` }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {columns.map((c, i) => (
                <Column key={c.key} column={c} scale={scale} edge={i <= 1 ? "start" : i >= last - 1 ? "end" : "center"} />
              ))}
            </div>
          </div>
        </ChartTips>
        <div aria-hidden className="mt-1 flex h-4">
          {columns.map((c) => (
            <span key={c.key} className="relative flex-1">
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{c.axisLabel}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const labelPlace = { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" };

function Column({ column: c, scale, edge }: { column: ColumnDatum; scale: Scale; edge: keyof typeof labelPlace }) {
  const height = percentOf(c.paise, scale);
  // The value label sits above the bar, or above the reference tick when that's higher, so they never overlap.
  const labelAt = Math.max(height, c.referencePaise != null ? percentOf(c.referencePaise, scale) : 0);
  const inner = (
    <>
      {c.paise > 0 && (
        <span
          data-bar
          className={`block w-full max-w-6 rounded-t-[4px] group-hover:opacity-75 ${c.emphasis === false ? "bg-zinc-300" : "bg-teal-600"}`}
          style={{ height: `max(2px, ${height}%)` }}
        />
      )}
      {c.referencePaise != null && (
        <span
          aria-hidden
          className="absolute left-1/2 w-8 max-w-full -translate-x-1/2 border-t-2 border-zinc-800"
          style={{ bottom: `${percentOf(c.referencePaise, scale)}%` }}
        />
      )}
      {c.valueLabel && c.paise > 0 && (
        <span
          aria-hidden
          className={`absolute font-medium whitespace-nowrap text-zinc-700 ${labelPlace[edge]}`}
          style={{ bottom: `calc(${labelAt}% + 4px)` }}
        >
          {c.valueLabel}
        </span>
      )}
    </>
  );
  // px-px: the 2px surface gap between neighbouring columns.
  const box = "group relative flex h-full flex-1 items-end justify-center px-px";
  const tip = c.tip ? { "data-tip": c.tip.value, "data-tip-label": c.tip.label } : {};
  return c.href ? (
    <Link href={c.href} aria-label={c.ariaLabel} className={`${box} outline-none focus-visible:bg-teal-50`} {...tip}>
      {inner}
    </Link>
  ) : (
    <div aria-hidden className={box} {...tip}>
      {inner}
    </div>
  );
}
