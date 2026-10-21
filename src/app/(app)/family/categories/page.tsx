import type { Metadata } from "next";
import Link from "next/link";
import { toggleCategoryAction } from "@/actions/expenses";
import { ActionButton } from "@/components/actions";
import { Card } from "@/components/card";
import { requireFamily } from "@/server/auth/family";
import { listCategories } from "@/server/services/categories";
import { AddCategoryForm, RenameCategory } from "./category-forms";

export const metadata: Metadata = { title: "Categories · Family Expenses" };

export default async function CategoriesPage() {
  const { user, family } = await requireFamily();
  const back = (
    <Link href="/family" className="text-sm font-medium text-teal-700 hover:underline">
      ← Back to family
    </Link>
  );
  if (family.role !== "HEAD") {
    return (
      <section className="flex flex-col gap-3">
        {back}
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-zinc-600">Only the family head can change categories.</p>
      </section>
    );
  }
  const categories = await listCategories(user.id, family.familyId, true);
  const familyId = family.familyId;

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-zinc-600">
          Hidden categories disappear from the dropdown but stay on old expenses and in reports.
        </p>
      </div>
      <Card title="Add a category" id="add">
        <div className="max-w-md">
          <AddCategoryForm familyId={familyId} />
        </div>
      </Card>
      <Card title={`All categories (${categories.length})`} id="all">
        <ul className="divide-y divide-zinc-100">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-2.5" data-testid="category-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={c.hidden ? "text-zinc-400 line-through" : "font-medium"}>
                  {c.name}
                  {c.hidden && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 no-underline">
                      Hidden
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <RenameCategory familyId={familyId} categoryId={c.id} name={c.name} />
                  <ActionButton action={toggleCategoryAction} fields={{ familyId, categoryId: c.id, hide: c.hidden ? "0" : "1" }}>
                    {c.hidden ? "Show" : "Hide"}
                  </ActionButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
