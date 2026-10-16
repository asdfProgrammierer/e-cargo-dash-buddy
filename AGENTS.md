# Project rules

- All order geocoding goes through the `geocode-address` edge function (client: `src/lib/geocodeOrder.ts`, server batch: `regeocode-pickup-orders`), which stores `geocode_quality`/`geocode_note` on orders — so imprecise positions (wrong/missing house number, other postcode) are flagged consistently everywhere.
- A DB trigger clears coordinates and geocode quality when an order's recipient address changes — so a stale pin is never kept for a new address.
- Shopify webhook settings use the admin-guarded `shopify-webhook-setup` save/status actions; return only secret-presence flags, preserve empty secret inputs and existing activation cutoffs, so edits remain durable without exposing credentials or skipping pending orders.
