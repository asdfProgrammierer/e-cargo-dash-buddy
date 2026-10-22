// Drivers type a 6-digit PIN; Auth's leaked-password check rejects every pure
// 6-digit number, so the stored password is the PIN plus a username-bound suffix.
// Keep in sync with src/lib/driverPin.ts.
export function driverAuthPassword(username: string, pin: string): string {
  return `${pin}~ecargo-fahrer~${username.trim().toLowerCase()}`;
}
