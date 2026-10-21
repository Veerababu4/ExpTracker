import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/actions/auth";
import { switchFamilyAction } from "@/actions/family";
import { Brand } from "@/components/brand";
import { FamilySwitcher } from "@/components/actions";
import { getCurrentUser } from "@/server/auth/session";
import { myFamilies, pickActiveFamily } from "@/server/services/families";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-3xl px-4">
          {/* Reads the session, so it streams in behind its own boundary (Cache Components rule). */}
          <Suspense fallback={<HeaderShell />}>
            <Header />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

function HeaderShell({ right, below }: { right?: React.ReactNode; below?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 py-3">
        <Brand />
        {right}
      </div>
      {below}
    </>
  );
}

async function Header() {
  const user = await getCurrentUser();
  if (!user) return <HeaderShell />;

  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="rounded-lg px-2 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50">
        Log out
      </button>
    </form>
  );
  // While a temporary password is in use, only logging out is offered.
  if (user.mustChangePassword) return <HeaderShell right={logout} />;

  const families = await myFamilies(user.id);
  const active = pickActiveFamily(families, user.activeFamilyId, user.lastFamilyId);

  return (
    <HeaderShell
      right={
        <div className="flex items-center gap-1 text-sm">
          <Link
            href="/account"
            className="max-w-32 truncate rounded-lg px-2 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100"
            title="My account"
          >
            {user.displayName}
          </Link>
          {logout}
        </div>
      }
      below={
        active && (
          <nav aria-label="Main" className="-mx-1 flex flex-wrap items-center gap-x-1 gap-y-2 pb-3 text-sm">
            {families.length > 1 ? (
              <FamilySwitcher action={switchFamilyAction} families={families} current={active.familyId} />
            ) : (
              <span className="px-1 font-semibold text-zinc-800">{active.familyName}</span>
            )}
            <span aria-hidden className="text-zinc-300">
              |
            </span>
            <NavLink href="/">Add</NavLink>
            <NavLink href="/family">Family</NavLink>
          </nav>
        )
      }
    />
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-lg px-2 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100">
      {children}
    </Link>
  );
}
