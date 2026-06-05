import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrderProvider } from "@/context/OrderContext";
import DashboardPage from "./pages/DashboardPage";
import AuftraegePage from "./pages/AuftraegePage";
import AdressbuchPage from "./pages/AdressbuchPage";
import ImportPage from "./pages/ImportPage";
import OnlineShopPage from "./pages/OnlineShopPage";
import ProfilPage from "./pages/ProfilPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import HaendlerVerwaltungPage from "./pages/admin/HaendlerVerwaltungPage";
import HaendlerDetailPage from "./pages/admin/HaendlerDetailPage";
import FahrerPage from "./pages/admin/FahrerPage";
import FahrzeugePage from "./pages/admin/FahrzeugePage";
import FahrzeugDetailPage from "./pages/admin/FahrzeugDetailPage";
import RoutenplanungPage from "./pages/admin/RoutenplanungPage";
import RouteDetailPage from "./pages/admin/RouteDetailPage";
import RouteDruckPage from "./pages/admin/RouteDruckPage";
import DeliveryZonesPage from "./pages/admin/DeliveryZonesPage";
import DepotsPage from "./pages/admin/DepotsPage";
import RouteSettingsPage from "./pages/admin/RouteSettingsPage";
import DeliveryModesPage from "./pages/admin/DeliveryModesPage";
import EmailTemplatesPage from "./pages/admin/EmailTemplatesPage";
import PickupCronPage from "./pages/admin/PickupCronPage";
import DhlSettingsPage from "./pages/admin/DhlSettingsPage";
import AccountSettingsPage from "./pages/admin/AccountSettingsPage";
import NotificationsPage from "./pages/admin/NotificationsPage";
import NotFound from "./pages/NotFound";
import UnsubscribePage from "./pages/UnsubscribePage";
import TrackingPage from "./pages/TrackingPage";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useDriverCheck } from "@/hooks/useDriverCheck";
import DriverLoginPage from "./pages/driver/DriverLoginPage";
import DriverHomePage from "./pages/driver/DriverHomePage";
import DriverRouteDetailPage from "./pages/driver/DriverRouteDetailPage";
import DriverProfilePage from "./pages/driver/DriverProfilePage";

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
    <Route path="/admin/einstellungen/abholungen" element={<AdminRoute><PickupCronPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/dhl" element={<AdminRoute><DhlSettingsPage /></AdminRoute>} />
    <Route path="/admin/einstellungen/konto" element={<AdminRoute><AccountSettingsPage /></AdminRoute>} />
    <Route path="/admin/benachrichtigungen" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
    <Route path="/admin/liefergebiet" element={<Navigate to="/admin/einstellungen/liefergebiet" replace />} />
    <Route path="/fahrer/login" element={<DriverLoginPage />} />
    <Route path="/fahrer" element={<DriverRoute><DriverHomePage /></DriverRoute>} />
    <Route path="/fahrer/route/:id" element={<DriverRoute><DriverRouteDetailPage /></DriverRoute>} />
    <Route path="/fahrer/profil" element={<DriverRoute><DriverProfilePage /></DriverRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
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
