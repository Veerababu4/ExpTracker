"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phones only (DESIGN §6, M6 mobile polish): the four main pages in a bar at the bottom of the screen, within
// thumb reach. From the sm breakpoint up the same links sit in the header instead.

const PAGES = [
  {
    href: "/",
    label: "Add",
    current: (path: string) => path === "/",
    icon: <path d="M12 5v14M5 12h14" />,
  },
  {
    href: "/month",
    label: "Month",
    current: (path: string) => path.startsWith("/month"),
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    href: "/search",
    label: "Search",
    current: (path: string) => path.startsWith("/search"),
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </>
    ),
  },
  {
    href: "/family",
    label: "Family",
    current: (path: string) => path.startsWith("/family"),
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15.5 14.6A5 5 0 0 1 21.5 20" />
      </>
    ),
  },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-3xl">
        {PAGES.map((page) => {
          const current = page.current(path);
          return (
            <li key={page.href} className="flex-1">
              <Link
                href={page.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${current ? "text-teal-700" : "text-zinc-600"}`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={current ? 2.25 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {page.icon}
                </svg>
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
