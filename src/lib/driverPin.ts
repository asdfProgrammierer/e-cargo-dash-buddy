// Keep in sync with supabase/functions/_shared/driver-pin.ts.
export function driverAuthPassword(username: string, pin: string): string {
  return `${pin}~ecargo-fahrer~${username.trim().toLowerCase()}`;
}
