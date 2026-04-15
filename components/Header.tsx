"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${
      pathname === path
        ? "bg-black text-white"
        : "bg-gray-100 text-gray-700"
    }`;

  return (
    <div className="flex gap-2 p-4 border-b bg-white">
      <Link href="/pos" className={linkClass("/pos")}>
        POS
      </Link>

      <Link href="/orders" className={linkClass("/orders")}>
        Orders
      </Link>
    </div>
  );
}