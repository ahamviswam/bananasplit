import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import AuthPage from "@/pages/AuthPage";
import GroupsPage from "@/pages/GroupsPage";
import GroupDetailPage from "@/pages/GroupDetailPage";
import SessionDetailPage from "@/pages/SessionDetailPage";
import BalancesPage from "@/pages/BalancesPage";
import ReportPage from "@/pages/ReportPage";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/AdminPage";
import { Skeleton } from "@/components/ui/skeleton";

// Guard: only admins can access /admin
function AdminGuard() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="text-2xl font-bold mb-2">Access Denied</p>
          <p className="text-muted-foreground text-sm">You need admin privileges to view this page.</p>
        </div>
      </div>
    );
  }
  return <AdminPage />;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  // Show nothing while restoring auth state from storage
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-40 mx-auto" />
          <Skeleton className="h-4 w-56 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
      </div>
    );
  }

  // Not logged in → show auth page
  if (!user) {
    return <AuthPage />;
  }

  // Logged in → show app
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={GroupsPage} />
        <Route path="/groups/:groupId" component={GroupDetailPage} />
        <Route path="/groups/:groupId/sessions/:sessionId" component={SessionDetailPage} />
        <Route path="/groups/:groupId/balances" component={BalancesPage} />
        <Route path="/groups/:groupId/report" component={ReportPage} />
        <Route path="/admin" component={AdminGuard} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
