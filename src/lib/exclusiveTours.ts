export interface ExclusiveTour {
  id: string;
  name: string;
  datum: string;
  start_time: string;
  status: "geplant" | "aktiv" | "abgeschlossen";
  stops: number;
  delivered: number;
  skipped: number;
  parcels: number;
}

export interface ExclusiveStop {
  id: string;
  position: number;
  status: "offen" | "erledigt" | "uebersprungen";
  eta: string | null;
  delivered_at: string | null;
  auftrags_nr: string;
  empfaenger_name: string;
  empfaenger_adresse: string | null;
  empfaenger_plz: string | null;
  empfaenger_stadt: string;
  pakete: number;
}

export function deliveryPercent(tour: Pick<ExclusiveTour, "stops" | "delivered">) {
  return tour.stops > 0 ? Math.round(tour.delivered / tour.stops * 100) : 0;
}