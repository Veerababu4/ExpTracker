import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { QUOTES } from "@/lib/quotes";
import { QuoteCarousel, SavingsCalculator } from "./home-widgets";

export const metadata: Metadata = {
  title: "Family Expenses — track your personal or family expenses",
  description: "Enter each expense once, see where your money goes, and spend more carefully next month.",
};

// Home page for visitors (DESIGN §3.8 P10). No session is read, so the page is static and fast; a logged-out visit
// to "/" lands here. Logged-in users who open it go straight on with "Open my expenses" (/login forwards them).

const FEATURES = [
  { icon: "🧾", title: "My expenses", text: "Your own private book. Track every rupee, even without a family." },
  { icon: "👨‍👩‍👧", title: "Family sharing", text: "Share with your family month by month — or keep a month personal." },
  { icon: "🎯", title: "Budgets & alerts", text: "Set a monthly budget; get a warning before a big spend is saved." },
  { icon: "📊", title: "Month at a glance", text: "Charts by category and day, search any dates, download for Excel." },
];

const STEPS = [
  { title: "Enter it once", text: "Date, amount, category — about ten seconds, right after you pay." },
  { title: "See where it went", text: "Every month adds itself up: by category, by day, by person." },
  { title: "Spend carefully next time", text: "Spot the leaks, set a budget, and watch next month improve." },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-1 text-sm">
          <Link href="/login" className="rounded-lg px-2.5 py-2 font-medium whitespace-nowrap text-zinc-700 hover:bg-zinc-100">
            Log in
          </Link>
          {/* Short on phones so the header stays on one line. */}
          <Link href="/register" className="rounded-lg bg-teal-700 px-3 py-2 font-medium whitespace-nowrap text-white hover:bg-teal-800">
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Create account</span>
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-4 pt-6 pb-16 sm:pt-12">
        <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-5">
            <p className="w-fit rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold tracking-wide text-teal-900 uppercase">
              Free · private · in ₹
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight text-zinc-900 sm:text-5xl">
              Track your personal or family expenses <span className="text-teal-700">here.</span>
            </h1>
            <p className="text-lg text-zinc-600">
              We&apos;ve made everything ready. Just enter each expense once — see where your money goes, and spend more
              carefully next time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-teal-800">
                Start for free
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                I have an account
              </Link>
            </div>
          </div>
          <QuoteCarousel quotes={QUOTES} />
        </section>

        <section aria-labelledby="features-title" className="flex flex-col gap-5">
          <h2 id="features-title" className="text-2xl font-semibold">
            Everything a household needs
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span aria-hidden className="text-3xl">
                  {f.icon}
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid items-start gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-semibold">How it works</h2>
            <ol className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-700 font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-sm text-zinc-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <SavingsCalculator />
        </section>

        <section className="rounded-3xl bg-zinc-900 px-6 py-10 text-center text-white sm:px-10">
          <p className="font-serif text-2xl italic">
            “Even if what comes in is small, there is no harm — as long as what goes out is not larger.”
          </p>
          <p className="mt-2 text-sm text-zinc-400">— Thiruvalluvar, Thirukkural 478</p>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-xl bg-amber-300 px-6 py-3 font-semibold text-zinc-900 hover:bg-amber-200"
          >
            Create your free account
          </Link>
        </section>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        Family Expenses · for personal and family use · amounts in ₹, dates in India time
      </footer>
    </div>
  );
}
