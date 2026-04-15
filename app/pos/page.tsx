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
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-x-hidden bg-gray-50">

      {/* 🔥 NAVIGATION */}
      <Header />

      {/* PRODUCTS */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 pb-40">
        {PRODUCTS.map((product, index) => (
          <div key={index} className="bg-white rounded-xl p-3 shadow-sm">
            <h2 className="font-semibold mb-2">{product.name}</h2>

            <div className="grid grid-cols-3 gap-2">
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
                  className="rounded-lg bg-gray-100 p-3 active:scale-95"
                >
                  <p className="text-xs">{v.size}</p>
                  <p className="text-sm font-semibold">₹{v.price}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 🛒 CART */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t bg-white p-3">

        {cart.length > 0 && (
          <div className="max-h-32 overflow-y-auto mb-2">
            {cart.map((item) => (
              <div key={item.id} className="mb-1 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1 break-words">
                  {item.name} ({item.size})
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => updateQty(item.id, -1)}
                    className="bg-gray-200 px-2 rounded"
                  >
                    −
                  </button>

                  <span>{item.qty}</span>

                  <button
                    onClick={() => updateQty(item.id, 1)}
                    className="bg-gray-200 px-2 rounded"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="font-bold">₹{total}</p>

          <button
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
            className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Checkout
          </button>
        </div>
      </div>

      {/* 🧾 CHECKOUT */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/30 flex items-end">
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-4">

            <h2 className="font-bold mb-3">Checkout</h2>

            {/* ORDER TYPE */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setOrderType("PICKUP")}
                className={`flex-1 p-2 rounded-lg border ${
                  orderType === "PICKUP" ? "bg-black text-white" : ""
                }`}
              >
                Pickup
              </button>

              <button
                onClick={() => setOrderType("DELIVERY")}
                className={`flex-1 p-2 rounded-lg border ${
                  orderType === "DELIVERY" ? "bg-black text-white" : ""
                }`}
              >
                Delivery
              </button>
            </div>

            <input
              placeholder="Name"
              className="w-full border p-2 mb-2 rounded"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              placeholder="Phone"
              className="w-full border p-2 mb-2 rounded"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            {orderType === "DELIVERY" && (
              <textarea
                placeholder="Address"
                className="w-full border p-2 mb-2 rounded"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}

            <button
              onClick={placeOrder}
              className="w-full bg-black text-white py-3 rounded-xl"
            >
              Place Order ₹{total}
            </button>

            <button
              onClick={() => setShowCheckout(false)}
              className="w-full mt-2 text-gray-500"
            >
              Cancel
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
