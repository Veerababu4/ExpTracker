"use client";

import { useRef, useState } from "react";

type Tip = { value: string; label: string; left: number; top: number; align: "start" | "center" | "end" };

/**
 * Tooltip for chart marks on hover and on keyboard focus (DESIGN §3.6 B3). The chart itself is drawn on the
 * server; a mark opts in with `data-tip` (the value) and `data-tip-label`, and its bar carries `data-bar` so the
 * tooltip sits on top of it. Tooltips only repeat what the chart's summary and table show — nothing needs hover.
 */
export function ChartTips({ children }: { children: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function show(target: EventTarget | null) {
    const mark = target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
    const box = frame.current?.getBoundingClientRect();
    if (!mark || !box) {
      setTip(null);
      return;
    }
    const anchor = (mark.querySelector("[data-bar]") ?? mark).getBoundingClientRect();
    const x = anchor.left + anchor.width / 2 - box.left;
    setTip({
      value: mark.dataset.tip ?? "",
      label: mark.dataset.tipLabel ?? "",
      left: x,
      top: Math.min(anchor.top, anchor.bottom - 2) - box.top,
      // Near an edge the tooltip grows inwards, so it never sticks out of the card.
      align: x < box.width * 0.2 ? "start" : x > box.width * 0.8 ? "end" : "center",
    });
  }

  const shift = tip?.align === "center" ? "-translate-x-1/2" : tip?.align === "end" ? "-translate-x-full" : "";
  return (
    <div
      ref={frame}
      className="relative"
      onPointerOver={(e) => show(e.target)}
      onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)}
      onBlur={() => setTip(null)}
    >
      {children}
      {tip && (
        // aria-hidden: each mark's own label already says the same to screen readers.
        <div
          aria-hidden
          data-testid="chart-tip"
          className={`pointer-events-none absolute z-10 -translate-y-full rounded-md bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-md ${shift}`}
          style={{ left: tip.left, top: tip.top - 6 }}
        >
          <span className="font-semibold">{tip.value}</span> <span className="text-zinc-300">{tip.label}</span>
        </div>
      )}
    </div>
  );
}
