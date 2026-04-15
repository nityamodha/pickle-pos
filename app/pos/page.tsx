"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";

/* ================= TYPES ================= */

type CartItem = {
  id: number;
  name: string;
  size: string;
  price: number;
  qty: number;
};

type OrderType = "PICKUP" | "DELIVERY";

/* ================= DATA ================= */

const PRODUCTS = [
  {
    name: "Punjabi Mix",
    variants: [
      { id: 1, size: "250g", price: 170 },
      { id: 2, size: "500g", price: 325 },
      { id: 3, size: "1kg", price: 650 },
    ],
  },
  {
    name: "Khati Gunda Keri",
    variants: [
      { id: 4, size: "250g", price: 170 },
      { id: 5, size: "500g", price: 325 },
      { id: 6, size: "1kg", price: 650 },
    ],
  },
  {
    name: "Chundo",
    variants: [
      { id: 7, size: "250g", price: 160 },
      { id: 8, size: "500g", price: 300 },
      { id: 9, size: "1kg", price: 600 },
    ],
  },
];

/* ================= COMPONENT ================= */

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [address, setAddress] = useState("");

  const clickSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    clickSound.current = new Audio("/sounds/click.wav");
  }, []);

  /* 🛒 Add to cart */
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

  /* 🔢 Update qty */
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

  /* 💰 Total */
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  /* 📦 Place Order */
  const placeOrder = async () => {
    if (!name || !phone || cart.length === 0) {
      alert("Fill details");
      return;
    }

    if (orderType === "DELIVERY" && !address) {
      alert("Enter address");
      return;
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert([
        {
          status: "NEW",
          name,
          phone,
          type: orderType,
          address: orderType === "DELIVERY" ? address : null,
          total,
        },
      ])
      .select()
      .single();

    if (error || !order) {
      alert("Order failed");
      return;
    }

    const items = cart.map((item) => ({
      order_id: order.id,
      name: `${item.name} (${item.size})`,
      qty: item.qty,
    }));

    await supabase.from("order_items").insert(items);

    // reset
    setCart([]);
    setShowCheckout(false);
    setName("");
    setPhone("");
    setAddress("");
    setOrderType("PICKUP");
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_22%,_#f8fafc_100%)]">

      {/* 🔥 NAVIGATION */}
      <Header
        title="POS Counter"
        subtitle="Create fast pickup and delivery orders from one screen."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5 pb-44">
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
                Tap any size below to add products instantly to the active cart.
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

        <section className="space-y-4">
          {PRODUCTS.map((product, index) => (
            <div
              key={index}
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
                  3 sizes
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() =>
                      addToCart({
                        id: v.id,
                        name: product.name,
                        size: v.size,
                        price: v.price,
                      })
                    }
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition active:scale-95 hover:border-orange-200 hover:bg-orange-50"
                  >
                    <p className="text-xs font-medium text-slate-500">{v.size}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      ₹{v.price}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* 🛒 CART */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md px-4 pb-4">
        <div className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur">

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
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Checkout
            </button>
          </div>

          {cart.length > 0 ? (
            <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 break-words">
                    <p className="font-medium text-slate-800">
                      {item.name} ({item.size})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      ₹{item.price} each
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="rounded-full bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm"
                    >
                      −
                    </button>

                    <span className="min-w-4 text-center font-semibold text-slate-900">
                      {item.qty}
                    </span>

                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="rounded-full bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm"
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

      {/* 🧾 CHECKOUT */}
      {showCheckout && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/35 px-4 pb-4 pt-10 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)]">

            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Checkout
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Complete order details
              </h2>
            </div>

            {/* ORDER TYPE */}
            <div className="mb-4 flex gap-2 rounded-full bg-slate-100 p-1">
              <button
                onClick={() => setOrderType("PICKUP")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  orderType === "PICKUP"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Pickup
              </button>

              <button
                onClick={() => setOrderType("DELIVERY")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  orderType === "DELIVERY"
                    ? "bg-white text-slate-900 shadow-sm"
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
              onClick={placeOrder}
              className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Place Order ₹{total}
            </button>

            <button
              onClick={() => setShowCheckout(false)}
              className="mt-3 w-full text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
