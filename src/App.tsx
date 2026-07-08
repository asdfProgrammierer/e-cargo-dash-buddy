import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrderProvider } from "@/context/OrderContext";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useDriverCheck } from "@/hooks/useDriverCheck";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AuftraegePage = lazy(() => import("./pages/AuftraegePage"));
const AdressbuchPage = lazy(() => import("./pages/AdressbuchPage"));
const ImportPage = lazy(() => import("./pages/ImportPage"));
const OnlineShopPage = lazy(() => import("./pages/OnlineShopPage"));
const ProfilPage = lazy(() => import("./pages/ProfilPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PendingApprovalPage = lazy(() => import("./pages/PendingApprovalPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const HaendlerVerwaltungPage = lazy(() => import("./pages/admin/HaendlerVerwaltungPage"));
const HaendlerDetailPage = lazy(() => import("./pages/admin/HaendlerDetailPage"));
const FahrerPage = lazy(() => import("./pages/admin/FahrerPage"));
const FahrzeugePage = lazy(() => import("./pages/admin/FahrzeugePage"));
const FahrzeugDetailPage = lazy(() => import("./pages/admin/FahrzeugDetailPage"));
const RoutenplanungPage = lazy(() => import("./pages/admin/RoutenplanungPage"));
const RouteDetailPage = lazy(() => import("./pages/admin/RouteDetailPage"));
const RouteDruckPage = lazy(() => import("./pages/admin/RouteDruckPage"));
const DeliveryZonesPage = lazy(() => import("./pages/admin/DeliveryZonesPage"));
const DepotsPage = lazy(() => import("./pages/admin/DepotsPage"));
const RouteSettingsPage = lazy(() => import("./pages/admin/RouteSettingsPage"));
const DeliveryModesPage = lazy(() => import("./pages/admin/DeliveryModesPage"));
const EmailTemplatesPage = lazy(() => import("./pages/admin/EmailTemplatesPage"));
const DhlSettingsPage = lazy(() => import("./pages/admin/DhlSettingsPage"));
const AccountSettingsPage = lazy(() => import("./pages/admin/AccountSettingsPage"));
const NotificationsPage = lazy(() => import("./pages/admin/NotificationsPage"));
const StatistikenPage = lazy(() => import("./pages/admin/StatistikenPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const TrackingPage = lazy(() => import("./pages/TrackingPage"));
const GdprConfirmDeletePage = lazy(() => import("./pages/GdprConfirmDeletePage"));
const TrustPage = lazy(() => import("./pages/TrustPage"));
const DriverLoginPage = lazy(() => import("./pages/driver/DriverLoginPage"));
const DriverHomePage = lazy(() => import("./pages/driver/DriverHomePage"));
const DriverRouteDetailPage = lazy(() => import("./pages/driver/DriverRouteDetailPage"));
const DriverProfilePage = lazy(() => import("./pages/driver/DriverProfilePage"));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, approved } = useAuth();
  const { isDriver } = useDriverCheck();
  if (loading || (session && approved === null) || (session && isDriver === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to={Capacitor.isNativePlatform() ? "/fahrer/login" : "/login"} replace />;
  if (isDriver) return <Navigate to="/fahrer" replace />;
  if (approved === false) return <Navigate to="/pending" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, approved } = useAuth();
  const isAdmin = useAdminCheck();
  if (loading) return null;
  if (!session && Capacitor.isNativePlatform()) return <Navigate to="/fahrer/login" replace />;
  if (session && approved && isAdmin === null) return null;
  if (session && approved && isAdmin) return <Navigate to="/admin" replace />;
  if (session && approved) return <Navigate to="/" replace />;
  if (session && approved === false) return <Navigate to="/pending" replace />;
  return <>{children}</>;
}

function PendingRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, approved } = useAuth();
  if (loading || (session && approved === null)) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (approved) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const isAdmin = useAdminCheck();
  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DriverRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { isDriver } = useDriverCheck();
  if (loading || isDriver === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/fahrer/login" replace />;
  if (!isDriver) return <Navigate to="/fahrer/login" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Suspense fallback={<RouteFallback />}>
  <Routes>
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/pending" element={<PendingRoute><PendingApprovalPage /></PendingRoute>} />
    <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="/auftraege" element={<ProtectedRoute><AuftraegePage /></ProtectedRoute>} />
    <Route path="/adressbuch" element={<ProtectedRoute><AdressbuchPage /></ProtectedRoute>} />
    <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
    <Route path="/online-shop" element={<ProtectedRoute><OnlineShopPage /></ProtectedRoute>} />
    <Route path="/profil" element={<ProtectedRoute><ProfilPage /></ProtectedRoute>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/unsubscribe" element={<UnsubscribePage />} />
    <Route path="/track/:token" element={<TrackingPage />} />
    <Route path="/gdpr/confirm-delete" element={<GdprConfirmDeletePage />} />
    <Route path="/sicherheit" element={<TrustPage />} />
    <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
    <Route path="/admin/haendler" element={<AdminRoute><HaendlerVerwaltungPage /></AdminRoute>} />
    <Route path="/admin/haendler/:id" element={<AdminRoute><HaendlerDetailPage /></AdminRoute>} />
    <Route path="/admin/fahrer" element={<AdminRoute><FahrerPage /></AdminRoute>} />
    <Route path="/admin/fahrzeuge" element={<AdminRoute><FahrzeugePage /></AdminRoute>} />
    <Route path="/admin/fahrzeuge/:id" element={<AdminRoute><FahrzeugDetailPage /></AdminRoute>} />
    <Route path="/admin/routen" element={<AdminRoute><RoutenplanungPage /></AdminRoute>} />
    <Route path="/admin/routen/:id" element={<AdminRoute><RouteDetailPage /></AdminRoute>} />
    <Route path="/admin/routen/:id/druck" element={<AdminRoute><RouteDruckPage /></AdminRoute>} />
    <Route path="/admin/einstellungen" element={<Navigate to="/admin/einstellungen/liefergebiet" replace />} />
    <Route path="/admin/einstellungen/liefergebiet" element={<AdminRoute><DeliveryZonesPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/depots" element={<AdminRoute><DepotsPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/routen" element={<AdminRoute><RouteSettingsPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/uebergabe" element={<AdminRoute><DeliveryModesPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/emails" element={<AdminRoute><EmailTemplatesPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/dhl" element={<AdminRoute><DhlSettingsPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/konto" element={<AdminRoute><AccountSettingsPage /></AdminRoute>} />
    <Route path="/admin/benachrichtigungen" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
    <Route path="/admin/statistiken" element={<AdminRoute><StatistikenPage /></AdminRoute>} />
    <Route path="/admin/liefergebiet" element={<Navigate to="/admin/einstellungen/liefergebiet" replace />} />
    <Route path="/fahrer/login" element={<DriverLoginPage />} />
    <Route path="/fahrer" element={<DriverRoute><DriverHomePage /></DriverRoute>} />
    <Route path="/fahrer/route/:id" element={<DriverRoute><DriverRouteDetailPage /></DriverRoute>} />
    <Route path="/fahrer/profil" element={<DriverRoute><DriverProfilePage /></DriverRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <OrderProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </OrderProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
