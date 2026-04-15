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

type OrderItemRow = {
  product_name: string;
  size: string;
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

type StatusCounter = {
  label: string;
  value: number;
  tone: string;
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
  {
    title: "Finance Dashboard",
    description: "Close ready orders and record how much was received and by whom.",
    href: "/finance",
    icon: "💸",
  },
];

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

function getRelativeAge(createdAt: string): string {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.max(1, Math.floor(elapsedMs / 60000));

  if (minutes < 60) {
    return `${minutes} min waiting`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours} hr waiting`
    : `${hours} hr ${remainingMinutes} min waiting`;
}

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

function buildDashboardData(orders: DashboardOrder[]) {
  const todayKey = getDateKey(new Date().toISOString());
  const todayOrders = orders.filter((order) => getDateKey(order.created_at) === todayKey);
  const revenueToday = todayOrders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0
  );
  const statusCounters: StatusCounter[] = [
    { label: "NEW", value: orders.filter((order) => order.status === "NEW").length, tone: "bg-blue-50 text-blue-700" },
    { label: "PREPARING", value: orders.filter((order) => order.status === "PREPARING").length, tone: "bg-orange-50 text-orange-700" },
    { label: "READY", value: orders.filter((order) => order.status === "READY").length, tone: "bg-purple-50 text-purple-700" },
    { label: "COMPLETED", value: orders.filter((order) => order.status === "COMPLETED").length, tone: "bg-emerald-50 text-emerald-700" },
  ];
  const readyNow = orders.filter((order) => order.status === "READY").length;
  const oldestWaiting = orders
    .filter((order) => order.status === "NEW" || order.status === "PREPARING")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

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
      const key = `${item.product_name} (${item.size})`;
      itemTotals.set(key, (itemTotals.get(key) ?? 0) + item.qty);
    }
  }

  const topQty = Math.max(...itemTotals.values(), 0);
  const popularPicks: PopularPick[] = Array.from(itemTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({
      name,
      amount: `${qty} units today`,
      progress: topQty > 0 ? `${Math.max(20, Math.round((qty / topQty) * 100))}%` : "0%",
    }));

  return {
    ordersToday: todayOrders.length,
    revenueToday: formatCurrency(revenueToday),
    readyNow,
    oldestWaiting,
    statusCounters,
    recentOrders,
    popularPicks,
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
    .select("id, created_at, name, type, total, status, order_items(product_name, size, qty)")
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
    <header className="sticky top-0 z-20 border-b border-white/45 bg-white/35 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
            Dashboard
          </p>
          <h1 className="text-lg font-semibold text-slate-900">
            Awesome Achaar POS
          </h1>
        </div>

        <nav className="glass-panel-soft flex flex-wrap items-center gap-2 rounded-[24px] p-1">
          <Link
            href="/"
            className="glass-button-primary rounded-full px-4 py-2 text-sm font-medium text-white"
          >
            Home
          </Link>
          <Link
            href="/pos"
            className="glass-button-secondary rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            POS
          </Link>
          <Link
            href="/orders"
            className="glass-button-secondary rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Orders
          </Link>
          <Link
            href="/finance"
            className="glass-button-secondary rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Finance
          </Link>
          <Link
            href="/pick-list"
            className="glass-button-secondary rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Pick List
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({
  ordersToday,
  revenueToday,
  readyNow,
  oldestWaiting,
  popularPicks,
}: {
  ordersToday: number;
  revenueToday: string;
  readyNow: number;
  oldestWaiting?: DashboardOrder;
  popularPicks: PopularPick[];
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <div className="glass-panel relative overflow-hidden rounded-[32px] p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-orange-200/35 blur-3xl" />
          <div className="absolute right-6 top-10 h-20 w-20 rounded-full bg-sky-200/25 blur-3xl" />
        </div>

        <div className="relative">
        <div className="glass-chip mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-orange-700">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          Live Operations
        </div>

        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.8rem] sm:leading-[1.05]">
          Run the counter, queue, packing, and finance from one calm dashboard.
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Faster order taking, clearer packing, and a sharper live queue for the team without jumping between tools.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="glass-button-primary rounded-2xl p-4 text-white">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Orders Today
            </p>
            <p className="mt-2 text-2xl font-semibold">{ordersToday}</p>
          </div>
          <div className="glass-panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Revenue
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{revenueToday}</p>
          </div>
          <div className="glass-panel-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Ready Now
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{readyNow}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pos"
            className="glass-button-primary inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Start New Order
          </Link>
          <Link
            href="/orders"
            className="glass-button-secondary inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-slate-700 transition hover:text-slate-900"
          >
            View Orders
          </Link>
        </div>
        </div>
      </div>

      <div className="glass-panel relative overflow-hidden rounded-[32px] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Queue Watch
            </p>
            <p className="text-sm font-semibold text-slate-900">
              Oldest Waiting Order
            </p>
          </div>
          <div className="glass-chip rounded-full px-3 py-1 text-xs font-semibold text-emerald-700">
            Syncing Live
          </div>
        </div>

        <div className="glass-panel-soft rounded-3xl p-4">
          {oldestWaiting ? (
            <>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                #{oldestWaiting.id} • {oldestWaiting.name}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {getRelativeAge(oldestWaiting.created_at)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {oldestWaiting.type === "PICKUP" ? "Pickup" : "Delivery"} order still in progress.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No waiting orders right now. The queue is under control.
            </p>
          )}
        </div>

        <div className="glass-panel-soft mt-4 rounded-3xl p-4">
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
    </section>
  );
}

function StatusCounters({ counters }: { counters: StatusCounter[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Live Queue By Status</h3>
        <p className="text-sm text-slate-500">
          A quick operational read of where orders are sitting right now.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {counters.map((counter) => (
          <div
            key={counter.label}
            className="glass-panel-soft rounded-3xl p-6 transition duration-200 hover:-translate-y-1"
          >
            <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${counter.tone}`}>
              {counter.label}
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              {counter.value}
            </p>
          </div>
        ))}
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
            className="glass-panel-soft group relative overflow-hidden rounded-3xl p-5 transition duration-200 hover:-translate-y-1"
          >
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/25 blur-2xl transition duration-200 group-hover:scale-125" />
            <div className="glass-button-primary flex h-12 w-12 items-center justify-center rounded-2xl text-2xl text-white">
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

      <div className="glass-panel overflow-hidden rounded-[32px]">
        <div className="glass-panel-soft hidden grid-cols-[1.4fr_1fr_0.9fr_1fr] gap-4 border-b border-white/65 px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:grid">
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
                className="grid gap-4 px-4 py-4 transition duration-200 hover:bg-white/25 sm:px-6 md:grid-cols-[1.4fr_1fr_0.9fr_1fr] md:items-center"
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
    ordersToday,
    revenueToday,
    readyNow,
    oldestWaiting,
    statusCounters,
    recentOrders,
    popularPicks,
  } = buildDashboardData(orders);

  return (
    <div className="glass-page min-h-dvh">
      <AppHeader />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Hero
          ordersToday={ordersToday}
          revenueToday={revenueToday}
          readyNow={readyNow}
          oldestWaiting={oldestWaiting}
          popularPicks={popularPicks}
        />
        <StatusCounters counters={statusCounters} />
        <QuickActions />
        <RecentOrders recentOrders={recentOrders} />
      </main>
    </div>
  );
}
