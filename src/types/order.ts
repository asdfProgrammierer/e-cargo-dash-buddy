export type OrderStatus = "neu" | "in_bearbeitung" | "unterwegs" | "zugestellt" | "nicht_zugestellt" | "storniert";

export const MAX_DELIVERY_ATTEMPTS = 3;

export interface Order {
  id: string;
  auftragsNr: string;
  absenderName: string;
  absenderAdresse: string;
  empfaengerName: string;
  empfaengerAdresse: string;
  empfaengerPlz: string;
  empfaengerStadt: string;
  empfaengerEmail?: string;
  empfaengerTelefon?: string;
  pakete: number;
  gewicht: number;
  packageLengthCm?: number;
  packageWidthCm?: number;
  packageHeightCm?: number;
  status: OrderStatus;
  erstelltAm: string;
  notizen?: string;
  deliveryAttempts?: number;
  isPickup?: boolean;
  dhlLabelUrl?: string;
  dhlTrackingNumber?: string;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  unterwegs: "Unterwegs",
  zugestellt: "Zugestellt",
  nicht_zugestellt: "Nicht Zugestellt",
  storniert: "Storniert",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  neu: "bg-info/10 text-info",
  in_bearbeitung: "bg-warning/10 text-warning",
  unterwegs: "bg-primary/10 text-primary",
  zugestellt: "bg-success/10 text-success",
  nicht_zugestellt: "bg-destructive/10 text-destructive",
  storniert: "bg-destructive/10 text-destructive",
};
