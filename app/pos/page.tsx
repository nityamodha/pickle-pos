"use client";

import { useEffect, useRef, useState } from "react";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";

type CartItem = {
  id: number;
  product_name: string;
  size: string;
  unit_price: number;
  qty: number;
};

type ProductRow = {
  id: number;
  name: string;
  size: string;
  price: number;
  sort_order: number | null;
  is_active: boolean | null;
};

type ProductGroup = {
  name: string;
  variants: Array<{
    id: number;
    size: string;
    price: number;
  }>;
};

type OrderType = "PICKUP" | "DELIVERY";

function groupProducts(products: ProductRow[]): ProductGroup[] {
  const groupedProducts = new Map<string, ProductGroup>();

  for (const product of products) {
    if (product.is_active === false) {
      continue;
    }

    const existing = groupedProducts.get(product.name);

    if (existing) {
      existing.variants.push({
        id: product.id,
        size: product.size,
        price: product.price,
      });
      continue;
    }

    groupedProducts.set(product.name, {
      name: product.name,
      variants: [
        {
          id: product.id,
          size: product.size,
          price: product.price,
        },
      ],
    });
  }

  return Array.from(groupedProducts.values()).map((product) => ({
    ...product,
    variants: product.variants.sort((a, b) => a.price - b.price),
  }));
}

export default function POSPage() {
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [address, setAddress] = useState("");

  const clickSound = useRef<HTMLAudioElement | null>(null);
  const toastIdRef = useRef(0);

  const pushToast = (
    title: string,
    description?: string,
    tone: ToastMessage["tone"] = "info"
  ) => {
    const id = ++toastIdRef.current;

    setToasts((prev) => [...prev, { id, title, description, tone }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  useEffect(() => {
    clickSound.current = new Audio("/sounds/click.wav");
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, size, price, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Product catalog fetch error:", error);
        pushToast(
          "Catalog unavailable",
          "We couldn’t load the product catalog from Supabase.",
          "error"
        );
        setIsLoadingProducts(false);
        return;
      }

      if ((data ?? []).length === 0) {
        pushToast(
          "Catalog is empty",
          "Add products in Supabase to manage prices and sizes from the dashboard.",
          "info"
        );
        setIsLoadingProducts(false);
        return;
      }

      setProducts(groupProducts(data as ProductRow[]));
      setIsLoadingProducts(false);
    };

    void fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const addToCart = (product: Omit<CartItem, "qty">) => {
    clickSound.current?.play().catch(() => {});

    const existing = cart.find((item) => item.id === product.id);

    if (existing) {
      setCart((prev) =>
        prev.map((item) =>
          item.id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item
        )
      );
    } else {
      setCart((prev) => [...prev, { ...product, qty: 1 }]);
    }
  };

  const updateQty = (id: number, change: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id
            ? { ...item, qty: item.qty + change }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const getCartQty = (id: number) =>
    cart.find((item) => item.id === id)?.qty ?? 0;

  const total = cart.reduce(
    (sum, item) => sum + item.unit_price * item.qty,
    0
  );

  const resetCheckout = () => {
    setCart([]);
    setShowCheckout(false);
    setName("");
    setPhone("");
    setAddress("");
    setOrderType("PICKUP");
  };

  const placeOrder = async () => {
    if (!name.trim() || !phone.trim() || cart.length === 0) {
      pushToast("Missing details", "Add customer details and at least one item before placing the order.", "error");
      return;
    }

    if (orderType === "DELIVERY" && !address.trim()) {
      pushToast("Address required", "Delivery orders need an address before you can continue.", "error");
      return;
    }

    setIsPlacingOrder(true);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          status: "NEW",
          name: name.trim(),
          phone: phone.trim(),
          type: orderType,
          address: orderType === "DELIVERY" ? address.trim() : null,
          total,
        },
      ])
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order create error:", orderError);
      pushToast("Order failed", "We couldn’t create the order. Please try again.", "error");
      setIsPlacingOrder(false);
      return;
    }

    const items = cart.map((item) => ({
      order_id: order.id,
      product_name: item.product_name,
      size: item.size,
      unit_price: item.unit_price,
      qty: item.qty,
      packed: false,
    }));

    const { error: itemError } = await supabase.from("order_items").insert(items);

    if (itemError) {
      console.error("Order item insert error:", itemError);
      pushToast("Items failed to save", "The order was created, but the line items could not be saved cleanly.", "error");
      setIsPlacingOrder(false);
      return;
    }

    resetCheckout();
    pushToast("Order placed", `${name.trim()}'s order is now live in the queue.`, "success");
    setIsPlacingOrder(false);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_22%,_#f8fafc_100%)]">
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />

      <Header
        title="POS Counter"
        subtitle="Create fast pickup and delivery orders from one screen."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5 pb-[26rem]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Counter Overview
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Build the next order
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Products now come from your Supabase catalog when available.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900 px-3 py-2 text-right text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Cart
              </p>
              <p className="text-lg font-semibold">{cart.length}</p>
            </div>
          </div>
        </section>

        {isLoadingProducts ? (
          <section className="space-y-4">
            {[1, 2, 3].map((placeholder) => (
              <div
                key={placeholder}
                className="animate-pulse rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)]"
              >
                <div className="h-5 w-1/3 rounded-full bg-slate-100" />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((cell) => (
                    <div key={cell} className="h-20 rounded-2xl bg-slate-100" />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="space-y-4">
            {products.map((product) => (
              <div
                key={product.name}
                className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)]"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">
                      Product
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {product.name}
                    </h2>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {product.variants.length} sizes
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {product.variants.map((variant) => {
                    const cartQty = getCartQty(variant.id);

                    return (
                      <div
                        key={variant.id}
                        className={`rounded-2xl border p-3 text-left transition ${
                          cartQty > 0
                            ? "border-orange-200 bg-orange-50 shadow-[0_12px_30px_-24px_rgba(234,88,12,0.65)]"
                            : "border-slate-200 bg-slate-50 hover:border-orange-200 hover:bg-orange-50"
                        }`}
                      >
                        <p className="text-xs font-medium text-slate-500">{variant.size}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          ₹{variant.price}
                        </p>

                        {cartQty > 0 ? (
                          <div className="mt-4 flex items-center justify-between gap-2 rounded-full border border-white/75 bg-white/78 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_-24px_rgba(15,23,42,0.28)] backdrop-blur-md">
                            <button
                              onClick={() => updateQty(variant.id, -1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.9)_100%)] text-[1.45rem] font-semibold leading-none text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_-16px_rgba(15,23,42,0.28)] transition hover:border-slate-300 hover:text-slate-800"
                              aria-label={`Decrease ${product.name} ${variant.size}`}
                            >
                              −
                            </button>

                            <span className="inline-flex min-w-[2.4rem] items-center justify-center rounded-full bg-slate-900 px-2.5 py-1 text-sm font-bold text-white shadow-[0_10px_18px_-16px_rgba(15,23,42,0.5)]">
                              {cartQty}
                            </span>

                            <button
                              onClick={() =>
                                addToCart({
                                  id: variant.id,
                                  product_name: product.name,
                                  size: variant.size,
                                  unit_price: variant.price,
                                })
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-900/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.92)_0%,rgba(15,23,42,0.98)_100%)] text-[1.45rem] font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_18px_-16px_rgba(15,23,42,0.58)] transition hover:brightness-110"
                              aria-label={`Increase ${product.name} ${variant.size}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              addToCart({
                                id: variant.id,
                                product_name: product.name,
                                size: variant.size,
                                unit_price: variant.price,
                              })
                            }
                            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/25 bg-[linear-gradient(180deg,rgba(30,41,59,0.88)_0%,rgba(15,23,42,0.96)_100%)] px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_26px_-18px_rgba(15,23,42,0.8)] backdrop-blur-md transition active:scale-95 hover:brightness-110"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md px-4 pb-4">
        <div className="rounded-[30px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(255,255,255,0.7)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_30px_70px_-34px_rgba(15,23,42,0.55)] backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Active Cart
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">₹{total}</p>
            </div>
            <button
              disabled={cart.length === 0}
              onClick={() => setShowCheckout(true)}
              className="rounded-[22px] border border-white/25 bg-[linear-gradient(180deg,rgba(30,41,59,0.88)_0%,rgba(15,23,42,0.98)_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_34px_-20px_rgba(15,23,42,0.85)] backdrop-blur-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Checkout
            </button>
          </div>

          {cart.length > 0 ? (
            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[24px] border border-white/70 bg-white/55 p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_16px_30px_-26px_rgba(15,23,42,0.45)] backdrop-blur-md"
                >
                  <div className="min-w-0 flex-1 break-words">
                    <p className="font-medium text-slate-800">
                      {item.product_name} ({item.size})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      ₹{item.unit_price} each
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200/80 bg-white/82 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_-24px_rgba(15,23,42,0.28)] backdrop-blur-md">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.9)_100%)] text-[1.7rem] font-semibold leading-none text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_-16px_rgba(15,23,42,0.3)] transition hover:border-slate-300 hover:text-slate-800"
                    >
                      −
                    </button>

                    <span className="inline-flex min-w-[2.75rem] items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-base font-bold text-white shadow-[0_10px_20px_-16px_rgba(15,23,42,0.5)]">
                      {item.qty}
                    </span>

                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-900/10 bg-[linear-gradient(180deg,rgba(30,41,59,0.92)_0%,rgba(15,23,42,0.98)_100%)] text-[1.7rem] font-semibold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_20px_-16px_rgba(15,23,42,0.58)] transition hover:brightness-110"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
              <p className="text-sm font-medium text-slate-700">Cart is empty</p>
              <p className="mt-1 text-xs text-slate-500">
                Add products above to start a new order.
              </p>
            </div>
          )}
        </div>
      </div>

      {showCheckout && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/35 px-4 pb-4 pt-10 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(255,255,255,0.76)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_30px_70px_-34px_rgba(15,23,42,0.5)] backdrop-blur-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Checkout
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Complete order details
              </h2>
            </div>

            <div className="mb-4 flex gap-2 rounded-full bg-slate-100 p-1">
              <button
                onClick={() => setOrderType("PICKUP")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  orderType === "PICKUP"
                    ? "border border-white/85 bg-white/85 text-slate-900 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md"
                    : "text-slate-500"
                }`}
              >
                Pickup
              </button>

              <button
                onClick={() => setOrderType("DELIVERY")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  orderType === "DELIVERY"
                    ? "border border-white/85 bg-white/85 text-slate-900 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md"
                    : "text-slate-500"
                }`}
              >
                Delivery
              </button>
            </div>

            <input
              placeholder="Name"
              className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              placeholder="Phone"
              className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            {orderType === "DELIVERY" && (
              <textarea
                placeholder="Address"
                className="mb-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}

            <button
              onClick={() => void placeOrder()}
              disabled={isPlacingOrder}
              className="w-full rounded-[22px] border border-white/25 bg-[linear-gradient(180deg,rgba(30,41,59,0.88)_0%,rgba(15,23,42,0.98)_100%)] py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_34px_-20px_rgba(15,23,42,0.85)] backdrop-blur-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlacingOrder ? "Placing Order..." : `Place Order ₹${total}`}
            </button>

            <button
              onClick={() => setShowCheckout(false)}
              className="mt-3 w-full rounded-[22px] border border-white/75 bg-white/55 py-3 text-sm font-medium text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_26px_-22px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white/72 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
