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
        ? "glass-button-primary text-white"
        : "glass-button-secondary text-slate-600 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-white/45 bg-white/35 backdrop-blur-xl">
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
            className="glass-button-secondary inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:text-slate-900"
          >
            <span aria-hidden="true">←</span>
            <span>Home</span>
          </Link>
        </div>

        <nav className="glass-panel-soft flex flex-wrap items-center gap-2 rounded-[24px] p-1">
          <Link href="/pos" className={linkClass("/pos")}>
            POS
          </Link>

          <Link href="/orders" className={linkClass("/orders")}>
            Orders
          </Link>

          <Link href="/finance" className={linkClass("/finance")}>
            Finance
          </Link>

          <Link href="/pick-list" className={linkClass("/pick-list")}>
            Pick List
          </Link>
        </nav>
      </div>
    </header>
  );
}
