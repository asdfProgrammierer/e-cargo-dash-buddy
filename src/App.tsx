import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
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
import DeliveryZonesPage from "./pages/admin/DeliveryZonesPage";
import NotFound from "./pages/NotFound";
import UnsubscribePage from "./pages/UnsubscribePage";
import TrackingPage from "./pages/TrackingPage";
import { useAdminCheck } from "@/hooks/useAdminCheck";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, approved } = useAuth();
  if (loading || (session && approved === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (approved === false) return <Navigate to="/pending" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, approved } = useAuth();
  if (loading) return null;
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
    <Route path="/admin/liefergebiet" element={<AdminRoute><DeliveryZonesPage /></AdminRoute>} />
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
