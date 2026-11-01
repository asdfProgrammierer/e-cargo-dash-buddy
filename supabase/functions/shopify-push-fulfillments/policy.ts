type DeliveryCandidate = {
  is_pickup: boolean | null;
  dhl_tracking_number: string | null;
  dhl_label_url: string | null;
  route_stops: Array<{ routes: { status: string } | null }>;
};

// Pickup tours are not last-mile deliveries. DHL/WMS owns all of its write-backs.
export function isEcargoDelivery(order: DeliveryCandidate): boolean {
  return order.is_pickup === false
    && order.dhl_tracking_number === null
    && order.dhl_label_url === null
    && order.route_stops.some(({ routes }) =>
      routes !== null && ["geplant", "aktiv", "abgeschlossen"].includes(routes.status));
}

export async function hasCronAuthorization(
  headers: Headers,
  verify: (key: string) => Promise<boolean>,
): Promise<boolean> {
  const key = headers.get("x-cron-key");
  return key ? await verify(key) : false;
}