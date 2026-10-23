import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import * as z from "zod";
import { buttonClass } from "@/components/button-class";
import { Card } from "@/components/card";
import { ExpenseList } from "@/components/expense-list";
import { SelectField, TextField } from "@/components/form";
import { PAYMENT_MODE_CODES, PAYMENT_MODES, UNCATEGORISED } from "@/lib/expense-options";
import { formatIsoDate } from "@/lib/format";
import { formatRupees } from "@/lib/money";
import { EARLIEST_DATE, firstOfMonth, todayInIndia } from "@/lib/rules/dates";
import { NO_CATEGORY, pageNumber, searchSchema } from "@/lib/validation/search";
import { requireFamily } from "@/server/auth/family";
import { listCategories } from "@/server/services/categories";
import { exportHref, familyPeople, searchExpenses } from "@/server/services/reports";

export const metadata: Metadata = { title: "Search · Family Expenses" };

type Values = { from: string; to: string; member: string; category: string; mode: string };

// Search between two dates (DESIGN §3.5 S1–S3, S5). The filters live in the address (a GET form), so a search
// can be bookmarked, shared within the family, and the back button works.
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, family } = await requireFamily();
  const params = await searchParams;
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const today = todayInIndia();

  // First visit: the form with this month so far, and no results until "Search".
  const submitted = params.from !== undefined || params.to !== undefined;
  const values: Values = submitted
    ? { from: one("from"), to: one("to"), member: one("member"), category: one("category"), mode: one("mode") }
    : { from: firstOfMonth(today), to: today, member: "", category: "", mode: "" };
  const parsed = submitted ? searchSchema(today).safeParse(values) : null;
  const errors: Partial<Record<string, string[]>> = parsed && !parsed.success ? z.flattenError(parsed.error).fieldErrors : {};

  const [people, categories, result] = await Promise.all([
    familyPeople(user.id, family.familyId),
    listCategories(user.id, family.familyId, true),
    parsed?.success ? searchExpenses(user.id, family.familyId, parsed.data, pageNumber(one("page"))) : Promise.resolve(null),
  ]);
  const query = new URLSearchParams(values).toString();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Search</h1>
        <p className="text-sm text-zinc-600">
          {family.familyName} · {family.kind === "FAMILY" ? "everyone's" : "your"} expenses between two dates (at most one year)
        </p>
      </div>

      {/* key: remount after each search so the fields show the address's values (e.g. after "Clear"). */}
      <div key={query} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <Form action="/search" className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="From" name="from" type="date" min={EARLIEST_DATE} max={today} defaultValue={values.from} errors={errors.from} />
            <TextField label="To" name="to" type="date" min={EARLIEST_DATE} max={today} defaultValue={values.to} errors={errors.to} />
          </div>
          <div className={`grid gap-4 ${family.kind === "FAMILY" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {family.kind === "FAMILY" && (
              <SelectField
                label="Member"
                name="member"
                optional
                placeholder="Everyone"
                options={people.map((p) => ({ value: p.userId, label: p.former ? `${p.displayName} (former member)` : p.displayName }))}
                defaultValue={values.member}
                errors={errors.member}
              />
            )}
            <SelectField
              label="Category"
              name="category"
              optional
              placeholder="All categories"
              options={[
                { value: NO_CATEGORY, label: UNCATEGORISED },
                ...categories.map((c) => ({ value: c.id, label: c.hidden ? `${c.name} (hidden)` : c.name })),
              ]}
              defaultValue={values.category}
              errors={errors.category}
            />
            <SelectField
              label="Payment mode"
              name="mode"
              optional
              placeholder="All payment modes"
              options={PAYMENT_MODE_CODES.map((code) => ({ value: code, label: PAYMENT_MODES[code] }))}
              defaultValue={values.mode}
              errors={errors.mode}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={buttonClass("primary", "md")}>
              Search
            </button>
            <Link href="/search" className="text-sm font-medium text-teal-700 hover:underline">
              Clear
            </Link>
          </div>
        </Form>
      </div>

      {result && parsed?.success && (
        <Card title="Results" id="results" note={`${formatIsoDate(parsed.data.from)} – ${formatIsoDate(parsed.data.to)}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p data-testid="search-summary" className="text-sm font-medium">
              {result.count} {result.count === 1 ? "expense" : "expenses"} · {formatRupees(result.totalPaise)}
            </p>
            {result.count > 0 && (
              <a href={exportHref(family.familyId, values)} download className="text-sm font-medium text-teal-700 hover:underline">
                Download CSV (Excel)
              </a>
            )}
          </div>
          <ExpenseList
            expenses={result.expenses}
            showDate
            showOwner={family.kind === "FAMILY"}
            total={{ count: result.count, paise: result.totalPaise }}
            empty="No expenses match this search."
          />
          {result.pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
              {result.page > 1 ? (
                <Link href={`/search?${query}&page=${result.page - 1}`} className={buttonClass("plain")}>
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-zinc-600">
                Page {result.page} of {result.pages}
              </span>
              {result.page < result.pages ? (
                <Link href={`/search?${query}&page=${result.page + 1}`} className={buttonClass("plain")}>
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </Card>
      )}
    </div>
  );
}
