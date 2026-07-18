import React from 'react';
import { Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Activity,
  Settings,
  ArrowLeft,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../lib/utils';
import { AccountBar } from '../shared/AccountBar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Defense in depth: AdminRoute already gates this, but the layout re-checks the
  // real authenticated role (never a mock) in case it is ever mounted another way.
  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, href: '/admin' },
    { id: 'workspaces', label: 'Workspaces', icon: Building2, href: '/admin/workspaces' },
    { id: 'users', label: 'Users', icon: Users, href: '/admin/users' },
    { id: 'revenue', label: 'Revenue', icon: CreditCard, href: '/admin/revenue' },
    { id: 'platform', label: 'Platform', icon: Activity, href: '/admin/platform' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/admin/settings' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex bg-page min-h-screen">
      {/* Admin Sidebar — separate menu from the app shell */}
      <aside className="w-[220px] bg-surface border-r border-default flex flex-col fixed h-screen z-50">
        <div className="p-5 flex items-center gap-3 border-b border-default">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/20 shrink-0">
            <Shield size={18} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-primary tracking-tight leading-tight">Torsor Admin</span>
            <span className="text-xs font-bold uppercase tracking-wider text-tertiary truncate">
              {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.id}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-secondary hover:bg-elevated hover:text-primary'
                )}
              >
                <item.icon size={18} className={cn('shrink-0', isActive ? 'text-accent' : 'text-tertiary group-hover:text-primary')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-default space-y-1">
          <div className="px-3 pb-2">
            <div className="text-xs font-medium text-primary truncate">{user.name}</div>
            <div className="text-xs text-tertiary truncate">{user.email}</div>
          </div>
          <Link
            to="/"
            className="flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors group"
          >
            <ArrowLeft size={18} className="text-tertiary group-hover:text-primary shrink-0" />
            Back to App
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[220px] min-h-screen flex flex-col">
        <AccountBar title={navItems.find((i) => location.pathname === i.href)?.label ?? 'Admin'} />
        <div className="p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
