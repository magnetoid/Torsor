import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ProtectedRoute, PublicRoute, AdminRoute } from './components/auth/ProtectedRoute';
import { useThemeStore } from './lib/theme';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';

export default function App() {
  const { toggleTheme, theme } = useThemeStore();
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
          {/* Sidebar destinations not built yet — land on a real page, not a 404. */}
          {([
            ['/recent', 'Recent', 'Projects you have opened recently will show up here.'],
            ['/starred', 'Starred', 'Star projects to pin them here for quick access.'],
            ['/shared', 'Shared with me', 'Projects other people share with you will appear here.'],
            ['/help', 'Help & Support', 'Documentation and support resources are on the way.'],
          ] as const).map(([path, title, description]) => (
            <Route
              key={path}
              path={path}
              element={
                <ErrorBoundary name={title}>
                  <ProtectedRoute>
                    <ComingSoonPage title={title} description={description} />
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            />
          ))}
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
