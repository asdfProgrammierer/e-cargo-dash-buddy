import { useState } from "react";
import { Order, OrderStatus } from "@/types/order";

const generateId = () => Math.random().toString(36).substring(2, 9);
const generateAuftragsNr = () => `EC-${Date.now().toString(36).toUpperCase()}`;

const DEMO_ORDERS: Order[] = [
  {
    id: generateId(),
    auftragsNr: "EC-2024001",
    absenderName: "Müller GmbH",
    absenderAdresse: "Hauptstr. 12, 45127 Essen",
    empfaengerName: "Schmidt & Co.",
    empfaengerAdresse: "Bahnhofstr. 5",
    empfaengerPlz: "44137",
    empfaengerStadt: "Dortmund",
    pakete: 3,
    gewicht: 12.5,
    status: "unterwegs",
    erstelltAm: "2026-03-12",
  },
  {
    id: generateId(),
    auftragsNr: "EC-2024002",
    absenderName: "Weber Handel",
    absenderAdresse: "Marktplatz 8, 44135 Dortmund",
    empfaengerName: "Becker Logistik",
    empfaengerAdresse: "Industriestr. 22",
    empfaengerPlz: "44787",
    empfaengerStadt: "Bochum",
    pakete: 1,
    gewicht: 3.2,
    status: "neu",
    erstelltAm: "2026-03-12",
  },
  {
    id: generateId(),
    auftragsNr: "EC-2024003",
    absenderName: "Fischer Versand",
    absenderAdresse: "Ringstr. 44, 46045 Oberhausen",
    empfaengerName: "Klein Bürobedarf",
    empfaengerAdresse: "Schillerstr. 10",
    empfaengerPlz: "47051",
    empfaengerStadt: "Duisburg",
    pakete: 5,
    gewicht: 28.0,
    status: "zugestellt",
    erstelltAm: "2026-03-11",
  },
  {
    id: generateId(),
    auftragsNr: "EC-2024004",
    absenderName: "Hoffmann AG",
    absenderAdresse: "Königstr. 3, 47051 Duisburg",
    empfaengerName: "Mayer Elektronik",
    empfaengerAdresse: "Poststr. 17",
    empfaengerPlz: "45879",
    empfaengerStadt: "Gelsenkirchen",
    pakete: 2,
    gewicht: 7.8,
    status: "in_bearbeitung",
    erstelltAm: "2026-03-12",
  },
  {
    id: generateId(),
    auftragsNr: "EC-2024005",
    absenderName: "Schulz Textilien",
    absenderAdresse: "Breite Str. 19, 44623 Herne",
    empfaengerName: "Wagner Mode",
    empfaengerAdresse: "Am Markt 3",
    empfaengerStadt: "Essen",
    pakete: 8,
    gewicht: 15.0,
    status: "storniert",
    erstelltAm: "2026-03-10",
  },
];

export function useOrderStore() {
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);

  const addOrder = (order: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">) => {
    const newOrder: Order = {
      ...order,
      id: generateId(),
      auftragsNr: generateAuftragsNr(),
      erstelltAm: new Date().toISOString().split("T")[0],
      status: "neu",
    };
    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };

  const addOrders = (newOrders: Omit<Order, "id" | "auftragsNr" | "erstelltAm" | "status">[]) => {
    const created = newOrders.map((o) => ({
      ...o,
      id: generateId(),
      auftragsNr: generateAuftragsNr(),
      erstelltAm: new Date().toISOString().split("T")[0],
      status: "neu" as OrderStatus,
    }));
    setOrders((prev) => [...created, ...prev]);
    return created;
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const deleteOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const updateOrder = (id: string, updates: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  return { orders, addOrder, addOrders, updateStatus, deleteOrder, updateOrder };
}
