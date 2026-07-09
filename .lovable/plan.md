# Responsive Optimierung: Handy & Tablet

Ziel: Alle Bereiche (Händler-Dashboard, Admin-Portal, Fahrer, öffentliche Seiten) voll bedienbar von 320px bis Desktop. Große Tabellen werden auf Handy zu Karten, auf Tablet+ bleiben Tabellen. Keine Business-Logik-Änderungen — nur Layout/Presentation.

## Leitprinzipien
- Breakpoints: `sm` 640, `md` 768 (Tablet), `lg` 1024 (Desktop). Karten-Layout unter `md`.
- Sidebar: bleibt Desktop-Nav; auf Mobile bereits als Sheet über `SidebarTrigger` — sicherstellen dass Trigger überall sichtbar.
- Touch-Targets ≥ 44px, ausreichende Abstände, kein horizontales Page-Scroll.
- Dialoge/Sheets: auf Mobile full-screen bzw. Bottom-Sheet.

## Änderungen pro Bereich

### 1. Globales Layout
- `DashboardLayout` / `AdminLayout` / `DriverLayout`: Header-Padding auf `px-3 sm:px-6`, Titel truncaten, Aktions-Icons kompakter (`gap-2`), Uhr auf `<sm` verstecken oder verkürzen.
- `main` Padding: `p-3 sm:p-6`.
- `NotificationBell` Dropdown: max-w-screen, kein Overflow.

### 2. Händler-Dashboard
- **AuftraegePage / OrderTable**: unter `md` neue `OrderCards`-Ansicht (Auftrags-Nr, Status-Badge, Empfänger, Datum, Actions als Icons). Ab `md` bestehende Tabelle.
- **OrderSearch / StatusFilter**: Filter-Chips scrollen horizontal (`overflow-x-auto`), Suchfeld full-width.
- **StatsCards / DashboardStats**: Grid `grid-cols-2 md:grid-cols-4`, kleinere Zahlen/Padding auf Mobile.
- **CreateOrderDialog / OrderDetailSheet / ExcelImport**: Dialog → auf Mobile `Sheet` von unten oder `max-h-[90vh] overflow-y-auto`, Formularfelder untereinander (`grid-cols-1 md:grid-cols-2`).
- **AdressbuchPage**: Karten-Liste statt Tabelle unter `md`.
- **ProfilPage**: Tabs scrollbar, Formularspalten stapeln, `OpeningHoursEditor` responsiv.
- **MerchantAnalytics / Statistiken**: Charts `w-full`, Legenden umbrechen, KPI-Cards 2-Spalten Mobile.

### 3. Admin-Portal
- **AdminSidebar**: gleiche Sheet-Behandlung.
- **HaendlerVerwaltung / FahrerPage / FahrzeugePage / RoutenplanungPage / NewOrdersTable / StatistikenPage**: Tabellen → Karten unter `md`. Filter-Bar wrap.
- **RouteBuilder / RoutesOverviewMap**: Karten-Container `h-[50vh] md:h-[70vh]`, Panels als Bottom-Sheet.
- **Dialoge** (CreateOrder, EditMerchant, VirtualMerchant, ExcelImport, DriverStats, Invoice, Pricing): responsive Dialog-Größe, scrollbar.
- **SettingsTabs / DhlSettings / DeliveryModes / Depots / RouteSettings / EmailTemplates / Notifications**: Tab-Leiste `overflow-x-auto`, Formulare stapeln.
- **Detail-Seiten** (HaendlerDetail, FahrzeugDetail, RouteDetail): Zwei-Spalten → Stack auf Mobile.

### 4. Fahrer-Ansicht
- Feinschliff: Buttons full-width auf Mobile, `SignaturePad` volle Breite mit fixem Aspect-Ratio, Stop-Detail scrollbar, PIN-Login größere Ziffern.

### 5. Öffentliche Seiten
- **TrackingPage / GdprPanel / GdprConfirmDeletePage**: bereits `max-w-2xl` — Padding `px-3`, Buttons full-width, Badges/History nicht abgeschnitten.
- **LoginPage / DriverLoginPage / PendingApprovalPage / ResetPasswordPage / UnsubscribePage / TrustPage / NotFound / OnlineShopPage**: zentrierte Karten, `w-full max-w-md`, Padding korrekt.

### 6. Neue Hilfskomponenten
- `src/components/ui/responsive-dialog.tsx`: nutzt `useIsMobile` → rendert `Sheet` (side="bottom") auf Mobile, sonst `Dialog`. Wird schrittweise für große Formulare eingesetzt.
- `src/components/dashboard/OrderCards.tsx`: mobile Kartenliste, teilt Props/Actions mit `OrderTable`.
- Analog `AdminOrderCards`, `MerchantCards`, `DriverCards`, `VehicleCards`, `AddressCards` je nach Bedarf.

## Umfang / Vorgehen
Umsetzung in einem Rutsch, aber logisch gruppiert:
1. Layouts + Header + Hilfskomponenten
2. Händler-Dashboard (Tabellen → Karten, Dialoge, Filter)
3. Admin-Portal (Tabellen → Karten, Dialoge, Detail-Seiten)
4. Fahrer + öffentliche Seiten
5. Smoke-Test via Playwright (375px + 768px Screenshots von Kernseiten)

## Nicht enthalten
- Keine Änderung an Business-Logik, Datenbank, Edge Functions, Auth.
- Keine neuen Features, keine Redesigns der Farbwelt/Typografie.
- Keine PWA-/Capacitor-Änderungen (App bleibt Web).

## Technisch
- Tailwind-Breakpoints wie oben.
- `useIsMobile()` (bereits vorhanden, 768px) für bedingtes Rendering von Karten vs. Tabellen und Dialog vs. Sheet.
- Bestehende shadcn `Sheet` Komponente wird für Bottom-Sheets wiederverwendet.
- Keine neuen Dependencies.
