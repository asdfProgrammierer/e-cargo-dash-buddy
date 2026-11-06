// Builds the recipient display name from a Shopify shipping address.
// Company + person => "Firma – z. H. Vorname Nachname".
export function shopifyRecipientName(person: string, company: string): string {
  const p = person.trim();
  const c = company.trim();
  if (c && p && c.toLowerCase() !== p.toLowerCase()) return `${c} – z. H. ${p}`;
  return c || p || "Empfänger";
}
