import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import EventTypesPage from "@/pages/event-types";
import EventTypeFormPage from "@/pages/event-type-form";
import BookingsPage from "@/pages/bookings";
import BookingDetailPage from "@/pages/booking-detail";
import LeadsPage from "@/pages/leads";
import BriefsPage from "@/pages/briefs";
import SettingsPage from "@/pages/settings";
import BookPage from "@/pages/book";
import CancelBookingPage from "@/pages/cancel-booking";
import RescheduleBookingPage from "@/pages/reschedule-booking";
import OnboardingPage from "@/pages/onboarding";
import OnboardingWizardPage from "@/pages/onboarding-wizard";
import EventTypeAICreatePage from "@/pages/event-type-ai-create";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedRoutes() {
  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/event-types" component={EventTypesPage} />
        <Route path="/event-types/new" component={EventTypeFormPage} />
        <Route path="/event-types/new/ai" component={EventTypeAICreatePage} />
        <Route path="/event-types/:id" component={EventTypeFormPage} />
        <Route path="/bookings" component={BookingsPage} />
        <Route path="/bookings/:id" component={BookingDetailPage} />
        <Route path="/leads" component={LeadsPage} />
        <Route path="/briefs" component={BriefsPage} />
        <Route path="/briefs/:id" component={BookingDetailPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  // Public booking pages work without auth
  if (window.location.pathname.startsWith("/book/")) {
    return (
      <Switch>
        <Route path="/book/:slug" component={BookPage} />
      </Switch>
    );
  }

  // Public cancel/reschedule booking pages work without auth (F12)
  if (window.location.pathname.startsWith("/booking/cancel/")) {
    return (
      <Switch>
        <Route path="/booking/cancel/:token" component={CancelBookingPage} />
      </Switch>
    );
  }

  if (window.location.pathname.startsWith("/booking/reschedule/")) {
    return (
      <Switch>
        <Route path="/booking/reschedule/:token" component={RescheduleBookingPage} />
      </Switch>
    );
  }

  // Auth-related routes (accessible without login)
  const authPaths = ["/auth", "/auth/verify-email", "/auth/magic-link", "/auth/reset-password"];
  if (!isAuthenticated || authPaths.some(p => window.location.pathname.startsWith(p))) {
    if (!isAuthenticated) {
      return <AuthPage />;
    }
  }

  // Onboarding page renders outside sidebar layout but requires auth
  if (window.location.pathname === "/onboarding") {
    return <OnboardingWizardPage />;
  }

  // Legacy onboarding (availability setup) - keep for backward compatibility
  if (window.location.pathname === "/onboarding/availability") {
    return <OnboardingPage />;
  }

  // Redirect new users to onboarding if they haven't completed it
  // Check if user has completed onboarding (onboardingCompletedAt is set)
  const hasCompletedOnboarding = user?.onboardingCompletedAt;
  if (!hasCompletedOnboarding && window.location.pathname !== "/onboarding") {
    // Allow settings page access even if onboarding not complete
    if (window.location.pathname !== "/settings") {
      window.location.href = "/onboarding";
      return null;
    }
  }

  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
