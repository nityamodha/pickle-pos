import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type LandingOrderStatus =
  | "NEW"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
type LandingOrderType = "PICKUP" | "DELIVERY";

type QuickAction = {
  title: string;
  description: string;
  href: string;
  icon: string;
};

type StatCard = {
  label: string;
  value: string;
  change: string;
};

type OrderItemRow = {
  name: string;
  qty: number;
};

type DashboardOrder = {
  id: number;
  created_at: string;
  name: string;
  type: LandingOrderType;
  total: number | string | null;
  status: LandingOrderStatus;
  order_items: OrderItemRow[];
};

type RecentOrder = {
  id: string;
  customerName: string;
  orderType: LandingOrderType;
  amount: string;
  status: LandingOrderStatus;
};

type PopularPick = {
  name: string;
  amount: string;
  progress: string;
};

const quickActions: QuickAction[] = [
  {
    title: "New Order",
    description: "Create a fresh walk-in or phone order in seconds.",
    href: "/pos",
    icon: "🛒",
  },
  {
    title: "Orders Dashboard",
    description: "Track live order flow from new to completed.",
    href: "/orders",
    icon: "📦",
  },
  {
    title: "Pick List",
    description: "See what the kitchen and packing team should prep next.",
    href: "/pick-list",
    icon: "🧺",
  },
];

const EMPTY_STATS: StatCard[] = [
  {
    label: "Orders Today",
    value: "0",
    change: "No orders yet today",
  },
  {
    label: "Revenue Today",
    value: "₹0",
    change: "Waiting for the first sale",
  },
  {
    label: "Active Orders",
    value: "0",
    change: "Queue is currently clear",
  },
];

function getStatusStyles(status: LandingOrderStatus): string {
  switch (status) {
    case "NEW":
      return "border border-blue-200 bg-blue-100 text-blue-700";
    case "PREPARING":
      return "border border-orange-200 bg-orange-100 text-orange-700";
    case "READY":
      return "border border-purple-200 bg-purple-100 text-purple-700";
    case "COMPLETED":
      return "border border-green-200 bg-green-100 text-green-700";
    case "CANCELLED":
      return "border border-red-200 bg-red-100 text-red-700";
    default:
      return "border border-gray-200 bg-gray-100 text-gray-700";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getDateKey(date: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

function parseItemName(rawName: string): { name: string; size: string | null } {
  const match = rawName.match(/^(.*)\s+\(([^()]+)\)$/);

  if (!match) {
    return { name: rawName, size: null };
  }

  return {
    name: match[1],
    size: match[2],
  };
}

function buildDashboardData(orders: DashboardOrder[]) {
  const todayKey = getDateKey(new Date().toISOString());
  const todayOrders = orders.filter((order) => getDateKey(order.created_at) === todayKey);
  const activeOrders = orders.filter(
    (order) => order.status === "NEW" || order.status === "PREPARING" || order.status === "READY"
  );
  const readyOrders = activeOrders.filter((order) => order.status === "READY").length;
  const revenueToday = todayOrders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0
  );

  const statsCards: StatCard[] = [
    {
      label: "Orders Today",
      value: String(todayOrders.length),
      change:
        todayOrders.length > 0
          ? `${todayOrders.filter((order) => order.status === "READY").length} ready to hand off`
          : "No orders yet today",
    },
    {
      label: "Revenue Today",
      value: formatCurrency(revenueToday),
      change:
        revenueToday > 0
          ? `${todayOrders.length} orders billed today`
          : "Waiting for the first sale",
    },
    {
      label: "Active Orders",
      value: String(activeOrders.length),
      change:
        activeOrders.length > 0
          ? `${readyOrders} ready for pickup`
          : "Queue is currently clear",
    },
  ];

  const recentOrders: RecentOrder[] = orders.slice(0, 5).map((order) => ({
    id: `#${order.id}`,
    customerName: order.name,
    orderType: order.type,
    amount: formatCurrency(Number(order.total ?? 0)),
    status: order.status,
  }));

  const itemTotals = new Map<string, number>();

  for (const order of todayOrders) {
    for (const item of order.order_items ?? []) {
      const parsedItem = parseItemName(item.name);
      const itemName = parsedItem.size
        ? `${parsedItem.name} (${parsedItem.size})`
        : parsedItem.name;

      itemTotals.set(itemName, (itemTotals.get(itemName) ?? 0) + item.qty);
    }
  }

  const topQty = Math.max(...itemTotals.values(), 0);
  const popularPicks: PopularPick[] = Array.from(itemTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({
      name,
      amount: `${qty} packed today`,
      progress: topQty > 0 ? `${Math.max(20, Math.round((qty / topQty) * 100))}%` : "0%",
    }));

  return {
    statsCards,
    recentOrders,
    popularPicks,
    queueCount: activeOrders.length,
  };
}

async function getDashboardOrders(): Promise<DashboardOrder[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, name, type, total, status, order_items(name, qty)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Dashboard fetch error:", error);
    return [];
  }

  return (data ?? []) as DashboardOrder[];
}

function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
            Dashboard
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            Awesome Achaar POS
          </h1>
        </div>

        <nav className="flex flex-wrap items-center gap-2 rounded-[24px] bg-slate-100 p-1">
          <Link
            href="/"
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm"
          >
            Home
          </Link>
          <Link
            href="/pos"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            POS
          </Link>
          <Link
            href="/orders"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Orders
          </Link>
          <Link
            href="/pick-list"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Pick List
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({
  queueCount,
  popularPicks,
}: {
  queueCount: number;
  popularPicks: PopularPick[];
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          Live Operations
        </div>

        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Awesome Achaar POS
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Fast, simple POS for pickle & food businesses.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Start New Order
          </Link>
          <Link
            href="/orders"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            View Orders
          </Link>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.18),_transparent_35%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              POS Preview
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Counter View
            </p>
          </div>
          <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Syncing Live
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-900 p-4 text-white">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Pick List
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {popularPicks.length}
              </p>
              <p className="mt-1 text-sm text-slate-300">popular items today</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Queue
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {queueCount}
              </p>
              <p className="mt-1 text-sm text-slate-500">orders in progress</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                Popular Picks
              </p>
              <p className="text-xs text-slate-400">Today</p>
            </div>

            <div className="space-y-3">
              {popularPicks.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No items have been ordered yet today.
                </p>
              ) : (
                popularPicks.map((item) => (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <span className="text-slate-500">{item.amount}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-orange-400 to-amber-500"
                        style={{ width: item.progress }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActions() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Quick Actions</h3>
          <p className="text-sm text-slate-500">
            Jump into the workflows your team uses most.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.5)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white">
              {action.icon}
            </div>
            <h4 className="mt-4 text-lg font-semibold text-slate-900">
              {action.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {action.description}
            </p>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-orange-600">
              Open
              <span className="ml-1 transition group-hover:translate-x-1">
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatsCards({ statsCards }: { statsCards: StatCard[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Live Stats</h3>
        <p className="text-sm text-slate-500">
          A quick snapshot of today&apos;s performance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {statsCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {stat.value}
            </p>
            <p className="mt-2 text-sm font-medium text-emerald-600">
              {stat.change}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentOrders({ recentOrders }: { recentOrders: RecentOrder[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Recent Orders</h3>
          <p className="text-sm text-slate-500">
            Last 5 orders flowing through the counter.
          </p>
        </div>
        <Link
          href="/orders"
          className="text-sm font-semibold text-orange-600 transition hover:text-orange-700"
        >
          View all
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.4fr_1fr_0.9fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:grid">
          <p>Customer</p>
          <p>Order Type</p>
          <p>Amount</p>
          <p>Status</p>
        </div>

        <div className="divide-y divide-slate-100">
          {recentOrders.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              No orders have been placed yet.
            </div>
          ) : (
            recentOrders.map((order) => (
              <div
                key={order.id}
                className="grid gap-4 px-4 py-4 sm:px-6 md:grid-cols-[1.4fr_1fr_0.9fr_1fr] md:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {order.customerName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{order.id}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                    Order Type
                  </p>
                  <p className="text-sm text-slate-600">
                    {order.orderType === "PICKUP" ? "Pickup" : "Delivery"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                    Amount
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {order.amount}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:hidden">
                    Status
                  </p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyles(
                      order.status
                    )}`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const orders = await getDashboardOrders();
  const {
    statsCards,
    recentOrders,
    popularPicks,
    queueCount,
  } = orders.length > 0
    ? buildDashboardData(orders)
    : {
        statsCards: EMPTY_STATS,
        recentOrders: [],
        popularPicks: [],
        queueCount: 0,
      };

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_22%,_#f8fafc_100%)]">
      <AppHeader />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Hero queueCount={queueCount} popularPicks={popularPicks} />
        <StatsCards statsCards={statsCards} />
        <QuickActions />
        <RecentOrders recentOrders={recentOrders} />
      </main>
    </div>
  );
}
