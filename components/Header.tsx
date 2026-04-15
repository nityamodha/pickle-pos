"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type HeaderProps = {
  title: string;
  subtitle: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      pathname === path
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-600 hover:bg-white hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
              Awesome Achaar POS
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <span aria-hidden="true">←</span>
            <span>Home</span>
          </Link>
        </div>

        <nav className="flex flex-wrap items-center gap-2 rounded-[24px] bg-slate-100 p-1">
          <Link href="/pos" className={linkClass("/pos")}>
            POS
          </Link>

          <Link href="/orders" className={linkClass("/orders")}>
            Orders
          </Link>

          <Link href="/pick-list" className={linkClass("/pick-list")}>
            Pick List
          </Link>
        </nav>
      </div>
    </header>
  );
}
