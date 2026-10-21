import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/actions/auth";
import { Brand } from "@/components/brand";
import { getCurrentUser } from "@/server/auth/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          {/* Reads the session, so it streams in behind its own boundary (Cache Components rule). */}
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link
        href="/account"
        className="max-w-36 truncate rounded-lg px-2 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100"
        title="My account"
      >
        {user.displayName}
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="rounded-lg px-2 py-1.5 font-medium text-teal-700 hover:bg-teal-50">
          Log out
        </button>
      </form>
    </nav>
  );
}
