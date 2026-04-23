import { createContext, useContext, ReactNode } from "react";
import { useOrderStore } from "@/stores/orderStore";
import { Order, OrderStatus } from "@/types/order";

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (order: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">) => Promise<Order | null>;
  addOrders: (orders: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">[]) => Promise<Order[]>;
  updateStatus: (id: string, status: OrderStatus, reason?: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
}

const OrderContext = createContext<OrderContextType | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const store = useOrderStore();
  return <OrderContext.Provider value={store}>{children}</OrderContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
