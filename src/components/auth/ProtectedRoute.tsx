import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '../../stores/authStore';

interface RouteProps {
  children: React.ReactNode;
}

const LoadingScreen = () => (
  <div className="min-h-screen bg-page flex items-center justify-center text-secondary">Loading…</div>
);

export const ProtectedRoute: React.FC<RouteProps> = ({ children }) => {
  const { isAuthenticated, user, initialized } = useAuthStore();
  const location = useLocation();

  if (!initialized) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user && !user.onboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export const PublicRoute: React.FC<RouteProps> = ({ children }) => {
  const { isAuthenticated, initialized } = useAuthStore();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  if (!initialized) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<RouteProps> = ({ children }) => {
  const { isAuthenticated, user, initialized } = useAuthStore();

  if (!initialized) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || (user?.role !== 'super_admin' && user?.role !== 'admin')) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
