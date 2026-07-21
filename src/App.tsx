import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AdminPage } from './pages/AdminPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AuthPage } from './pages/AuthPage';
import { ProjectWorkspace } from './pages/ProjectWorkspace';
import { BillingPage } from './pages/BillingPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { HelpPage } from './pages/HelpPage';
import { AboutPage } from './pages/AboutPage';
import { UpdatesPage } from './pages/UpdatesPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ProtectedRoute, PublicRoute, AdminRoute } from './components/auth/ProtectedRoute';
import { useThemeStore } from './lib/theme';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useNotificationStore } from './stores/notificationStore';

export default function App() {
  const { toggleTheme, theme } = useThemeStore();
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Load workspaces + notifications when auth is ready
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchWorkspaces();
      void fetchNotifications();
    }
  }, [isAuthenticated, fetchWorkspaces, fetchNotifications]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleTheme();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme]);

  return (
    <ErrorBoundary name="App">
      <BrowserRouter>
        <RouteTitleManager />
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              <ErrorBoundary name="Login">
                <PublicRoute>
                  <AuthPage />
                </PublicRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/signup" 
            element={
              <ErrorBoundary name="Signup">
                <PublicRoute>
                  <AuthPage />
                </PublicRoute>
              </ErrorBoundary>
            } 
          />

          {/* Protected Routes */}
          <Route 
            path="/" 
            element={
              <ErrorBoundary name="Home">
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/onboarding" 
            element={
              <ErrorBoundary name="Onboarding">
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/projects" 
            element={
              <ErrorBoundary name="Projects">
                <ProtectedRoute>
                  <ProjectsPage />
                </ProtectedRoute>
              </ErrorBoundary>
            } 
          />
          <Route
            path="/marketplace"
            element={
              <ErrorBoundary name="Marketplace">
                <ProtectedRoute>
                  <MarketplacePage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/project/:id"
            element={
              <ErrorBoundary name="Workspace">
                <ProtectedRoute>
                  <ProjectWorkspace />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/billing"
            element={
              <ErrorBoundary name="Billing">
                <ProtectedRoute>
                  <BillingPage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          {/* Recent / Starred are real views over project data; Help is a real links page.
              Only "Shared with me" still waits on multiplayer — honestly labeled. */}
          <Route
            path="/recent"
            element={
              <ErrorBoundary name="Recent">
                <ProtectedRoute>
                  <ProjectListPage mode="recent" />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/starred"
            element={
              <ErrorBoundary name="Starred">
                <ProtectedRoute>
                  <ProjectListPage mode="starred" />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/shared"
            element={
              <ErrorBoundary name="Shared with me">
                <ProtectedRoute>
                  <ComingSoonPage
                    title="Shared with me"
                    description="Sharing arrives with multiplayer. Live presence already works — open a project in two browsers to see it."
                  />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/help"
            element={
              <ErrorBoundary name="Help & Support">
                <ProtectedRoute>
                  <HelpPage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/about"
            element={
              <ErrorBoundary name="About">
                <ProtectedRoute>
                  <AboutPage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/updates"
            element={
              <ErrorBoundary name="What's New">
                <ProtectedRoute>
                  <UpdatesPage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/feedback"
            element={
              <ErrorBoundary name="Send Feedback">
                <ProtectedRoute>
                  <FeedbackPage />
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route 
            path="/settings" 
            element={
              <ErrorBoundary name="Settings">
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/notifications" 
            element={
              <ErrorBoundary name="Notifications">
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/admin" 
            element={
              <ErrorBoundary name="Admin">
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              </ErrorBoundary>
            } 
          />
          <Route 
            path="/admin/:tab" 
            element={
              <ErrorBoundary name="Admin">
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              </ErrorBoundary>
            } 
          />

          {/* 404 Redirect */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      {/* App-wide toast host — the ~10 sonner toast() callers had no <Toaster> mounted,
          so their feedback was silently dropped. Theme-aware via the theme store. */}
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </ErrorBoundary>
  );
}

function RouteTitleManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'Torsor';

    if (path === '/login') title = 'Sign In | Torsor';
    else if (path === '/signup') title = 'Create Account | Torsor';
    else if (path === '/') title = 'Home | Torsor';
    else if (path === '/projects') title = 'Projects | Torsor';
    else if (path.startsWith('/project/')) title = 'Workspace | Torsor';
    else if (path === '/billing') title = 'Billing | Torsor';
    else if (path === '/settings') title = 'Settings | Torsor';
    else if (path === '/notifications') title = 'Notifications | Torsor';
    else if (path === '/marketplace') title = 'Marketplace | Torsor';
    else if (path === '/help') title = 'Help | Torsor';
    else if (path.startsWith('/admin')) title = 'Admin | Torsor';
    else if (path === '/onboarding') title = 'Onboarding | Torsor';
    else if (path === '/recent') title = 'Recent Projects | Torsor';
    else if (path === '/starred') title = 'Starred Projects | Torsor';
    else if (path === '/shared') title = 'Shared With Me | Torsor';
    else if (path !== '*') title = 'Torsor';

    document.title = title;
  }, [location.pathname]);

  return null;
}
