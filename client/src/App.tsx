import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import GroupsPage from "@/pages/GroupsPage";
import GroupDetailPage from "@/pages/GroupDetailPage";
import SessionDetailPage from "@/pages/SessionDetailPage";
import BalancesPage from "@/pages/BalancesPage";
import ReportPage from "@/pages/ReportPage";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={GroupsPage} />
        <Route path="/groups/:groupId" component={GroupDetailPage} />
        <Route path="/groups/:groupId/sessions/:sessionId" component={SessionDetailPage} />
        <Route path="/groups/:groupId/balances" component={BalancesPage} />
        <Route path="/groups/:groupId/report" component={ReportPage} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppRoutes />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
