// DHL Parcel DE Shipping V2 – create label for a single order.
// Auth: API key header + HTTP Basic (CIG credentials).
// Cost center = merchant_code so DHL invoices can be split per merchant.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DHL_ENDPOINT = "https://api-eu.dhl.com/parcel/de/shipping/v2/orders";

function splitStreet(street: string): { name: string; number: string } {
  const trimmed = (street || "").trim();
  const m = trimmed.match(/^(.*?)\s+([0-9].*)$/);
  if (m) return { name: m[1].trim(), number: m[2].trim() };
  return { name: trimmed || "-", number: "-" };
}

// EU-Länder (ISO3) für Produktauswahl V54EPAK
const EU_COUNTRIES = new Set([
  "AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA","GRC","HUN",
  "IRL","ITA","LVA","LTU","LUX","MLT","NLD","POL","PRT","ROU","SVK","SVN",
  "ESP","SWE",
]);

function toIso3(country: string | null | undefined): string {
  const c = (country || "Deutschland").trim().toLowerCase();
  const map: Record<string, string> = {
    "deutschland":"DEU","germany":"DEU","de":"DEU",
    "österreich":"AUT","austria":"AUT","at":"AUT",
    "schweiz":"CHE","switzerland":"CHE","ch":"CHE",
    "niederlande":"NLD","netherlands":"NLD","nl":"NLD",
    "belgien":"BEL","belgium":"BEL","be":"BEL",
    "frankreich":"FRA","france":"FRA","fr":"FRA",
    "italien":"ITA","italy":"ITA","it":"ITA",
    "spanien":"ESP","spain":"ESP","es":"ESP",
    "polen":"POL","poland":"POL","pl":"POL",
    "luxemburg":"LUX","luxembourg":"LUX","lu":"LUX",
    "dänemark":"DNK","denmark":"DNK","dk":"DNK",
  };
  return map[c] ?? (c.length === 3 ? c.toUpperCase() : "DEU");
}

// Kleinpaket-/Warenpost-Limits: max 1 kg und Maße 35,3 × 25 × 8 cm
function fitsKleinpaket(weightKg: number, l?: number, w?: number, h?: number): boolean {
  if (weightKg > 1) return false;
  if (l == null || w == null || h == null) return true; // ohne Maße erlauben
  const dims = [l, w, h].sort((a, b) => b - a); // sortiert: längste zuerst
  return dims[0] <= 35.3 && dims[1] <= 25 && dims[2] <= 8;
}

function pickProduct(
  countryIso3: string, weightKg: number,
  l?: number, w?: number, h?: number,
): string {
  const small = fitsKleinpaket(weightKg, l, w, h);
  if (countryIso3 === "DEU") return small ? "V62KP" : "V01PAK";
  if (EU_COUNTRIES.has(countryIso3)) return small ? "V66KPI" : "V54EPAK";
  return small ? "V66KPI" : "V53WPAK";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("DHL_API_KEY");
    const username = Deno.env.get("DHL_USERNAME");
    const password = Deno.env.get("DHL_PASSWORD");
    if (!apiKey || !username || !password) {
      return new Response(JSON.stringify({ error: "DHL credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId as string | undefined;
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role read for full data + permission check via merchant ownership / admin.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error: orderErr } = await admin
      .from("orders").select("*").eq("id", orderId).single();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Permission: caller must be admin OR own (or be sub-account of) the merchant.
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin");
    let allowed = isAdmin;
    if (!allowed) {
      const { data: callerProfile } = await admin
        .from("profiles").select("user_id, parent_user_id").eq("user_id", user.id).maybeSingle();
      const ownerId = callerProfile?.parent_user_id ?? user.id;
      allowed = ownerId === order.user_id;
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: merchant } = await admin
      .from("profiles").select("merchant_code, dhl_enabled, firma_name")
      .eq("user_id", order.user_id).maybeSingle();
    if (!merchant?.dhl_enabled) {
      return new Response(JSON.stringify({ error: "DHL nicht für diesen Händler aktiviert" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientStreet = splitStreet(order.empfaenger_adresse || "");
    const weightKg = Math.max(0.1, Number(order.gewicht) || 1);
    const countryIso3 = toIso3((order as any).empfaenger_land);
    const productCode = pickProduct(
      countryIso3, weightKg,
      order.package_length_cm ? Number(order.package_length_cm) : undefined,
      order.package_width_cm ? Number(order.package_width_cm) : undefined,
      order.package_height_cm ? Number(order.package_height_cm) : undefined,
    );

    const { data: productRow } = await admin
      .from("dhl_products").select("billing_number").eq("code", productCode).maybeSingle();
    const billingNumber = productRow?.billing_number;
    if (!billingNumber) {
      return new Response(JSON.stringify({ error: `Keine Abrechnungsnummer für ${productCode} hinterlegt` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preis: Tier mit kleinstem max_weight_kg >= weight; Händler-Override schlägt Default
    const { data: tierRows } = await admin
      .from("dhl_price_tiers")
      .select("user_id, max_weight_kg, price_netto")
      .eq("product_code", productCode)
      .or(`user_id.eq.${order.user_id},user_id.is.null`)
      .order("max_weight_kg", { ascending: true });
    const candidates = (tierRows ?? []) as Array<{ user_id: string | null; max_weight_kg: number; price_netto: number }>;
    const pickTier = (rows: typeof candidates) =>
      rows.find((r) => Number(r.max_weight_kg) >= weightKg)
      ?? rows[rows.length - 1]; // schwerstes Tier als Fallback
    const merchantTier = pickTier(candidates.filter((r) => r.user_id === order.user_id));
    const globalTier = pickTier(candidates.filter((r) => r.user_id === null));
    const chosenTier = merchantTier ?? globalTier;
    const priceNetto = Number(chosenTier?.price_netto ?? 0);

    const dhlPayload = {
      profile: "STANDARD_GRUPPENPROFIL",
      shipments: [
        {
          product: productCode === "RETOURE" ? "V01PAK" : productCode,
          billingNumber,
          refNo: (order.auftrags_nr || order.id).slice(0, 35),
          costCenter: (merchant.merchant_code || "").slice(0, 50),
          shipper: {
            name1: (merchant.firma_name || "e-cargo").slice(0, 50),
            addressStreet: "Haldenstraße",
            addressHouse: "58",
            postalCode: "44809",
            city: "Bochum",
            country: "DEU",
          },
          consignee: {
            name1: (order.empfaenger_name || "").slice(0, 50),
            addressStreet: recipientStreet.name.slice(0, 50),
            addressHouse: recipientStreet.number.slice(0, 10),
            postalCode: order.empfaenger_plz || "",
            city: order.empfaenger_stadt || "",
            country: countryIso3,
            email: order.empfaenger_email || undefined,
            phone: order.empfaenger_telefon || undefined,
          },
          details: {
            weight: { uom: "kg", value: weightKg },
            ...(order.package_length_cm && order.package_width_cm && order.package_height_cm ? {
              dim: {
                uom: "cm",
                length: Number(order.package_length_cm),
                width: Number(order.package_width_cm),
                height: Number(order.package_height_cm),
              },
            } : {}),
          },
        },
      ],
    };

    const dhlResp = await fetch(`${DHL_ENDPOINT}?validate=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "dhl-api-key": apiKey,
        Authorization: "Basic " + btoa(`${username}:${password}`),
      },
      body: JSON.stringify(dhlPayload),
    });

    const dhlJson = await dhlResp.json().catch(() => ({}));
    if (!dhlResp.ok) {
      console.error("DHL error", dhlResp.status, dhlJson);
      return new Response(JSON.stringify({ error: "DHL API Fehler", status: dhlResp.status, details: dhlJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const item = dhlJson?.items?.[0];
    const shipmentNo: string | undefined = item?.shipmentNo;
    const labelB64: string | undefined = item?.label?.b64;
    const labelUrl: string | undefined = item?.label?.url;

    if (!shipmentNo) {
      return new Response(JSON.stringify({ error: "Kein Label in DHL-Antwort", details: dhlJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload label PDF to storage if base64 present
    let storedUrl: string | null = labelUrl ?? null;
    if (labelB64) {
      const bytes = Uint8Array.from(atob(labelB64), (c) => c.charCodeAt(0));
      const path = `dhl/${order.id}-${shipmentNo}.pdf`;
      const { error: upErr } = await admin.storage
        .from("delivery-notes")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (!upErr) {
        const { data: signed } = await admin.storage
          .from("delivery-notes")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        storedUrl = signed?.signedUrl ?? storedUrl;
      } else {
        console.warn("Label upload failed", upErr);
      }
    }

    await admin.from("orders").update({
      dhl_label_url: storedUrl,
      dhl_tracking_number: shipmentNo,
      dhl_shipment_no: shipmentNo,
      dhl_label_created_at: new Date().toISOString(),
      dhl_product_code: productCode,
      dhl_price_netto: priceNetto,
    }).eq("id", order.id);

    return new Response(JSON.stringify({
      success: true,
      shipmentNo,
      trackingNumber: shipmentNo,
      labelUrl: storedUrl,
      productCode,
      priceNetto,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-dhl-label error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});