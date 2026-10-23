"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatRupees } from "@/lib/money";
import type { Quote } from "@/lib/quotes";

// The two interactive pieces of the visitor home page (DESIGN §3.8 P10).

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** True when the device asks for less motion; false on the server and before hydration. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(reducedMotionQuery);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

/** One quote at a time, with previous/next. It moves on by itself every 8 s unless paused or "reduce motion" is on. */
export function QuoteCarousel({ quotes }: { quotes: readonly Quote[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const auto = !paused && !reduced;

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % quotes.length), 8000);
    return () => clearInterval(timer);
  }, [auto, quotes.length]);

  const go = (step: number) => setIndex((i) => (i + step + quotes.length) % quotes.length);
  const quote = quotes[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Money wisdom"
      className="relative overflow-hidden rounded-3xl bg-teal-900 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden className="pointer-events-none absolute -top-6 left-3 font-serif text-[9rem] leading-none text-teal-700/60">
        “
      </span>
      <figure key={index} className="quote-in relative min-h-36 sm:min-h-28" aria-live={auto ? "off" : "polite"}>
        <blockquote className="font-serif text-xl leading-snug italic sm:text-2xl">{quote.text}</blockquote>
        {quote.by && <figcaption className="mt-3 text-sm text-teal-100">— {quote.by}</figcaption>}
      </figure>
      <div className="relative mt-6 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {quotes.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-amber-300" : "w-1.5 bg-teal-600"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
            aria-label="Previous quote"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
            aria-label="Next quote"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

/** "Little savings add up": ₹ a day → a month (30 days) → a year (365 days). */
export function SavingsCalculator() {
  const [perDay, setPerDay] = useState(100);
  const rupees = (n: number) => formatRupees(n * 100).replace(/\.00$/, "");
  return (
    <section aria-labelledby="calc-title" className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
      <h2 id="calc-title" className="text-xl font-semibold text-zinc-900">
        Little savings add up
      </h2>
      <p className="mt-1 text-sm text-zinc-600">Skip one small spend a day — a tea outside, a delivery fee — and see where it goes.</p>
      <label htmlFor="per-day" className="mt-5 flex items-baseline justify-between gap-3 text-sm font-medium text-zinc-800">
        Save every day
        <output htmlFor="per-day" data-testid="calc-day" className="text-2xl font-semibold text-teal-800 tabular-nums">
          {rupees(perDay)}
        </output>
      </label>
      <input
        id="per-day"
        type="range"
        min={10}
        max={1000}
        step={10}
        value={perDay}
        onChange={(e) => setPerDay(Number(e.target.value))}
        className="mt-2 w-full accent-teal-700"
      />
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <dt className="text-xs font-medium text-zinc-500 uppercase">In a month</dt>
          <dd data-testid="calc-month" className="mt-1 text-xl font-semibold tabular-nums">
            {rupees(perDay * 30)}
          </dd>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <dt className="text-xs font-medium text-zinc-500 uppercase">In a year</dt>
          <dd data-testid="calc-year" className="mt-1 text-xl font-semibold text-teal-800 tabular-nums">
            {rupees(perDay * 365)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
