import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';

// Admin Tabs
import { AdminOverviewTab } from '../components/admin/tabs/AdminOverviewTab';
import { AdminWorkspacesTab } from '../components/admin/tabs/AdminWorkspacesTab';
import { AdminUsersTab } from '../components/admin/tabs/AdminUsersTab';
import { AdminRevenueTab } from '../components/admin/tabs/AdminRevenueTab';
import { AdminPlatformTab } from '../components/admin/tabs/AdminPlatformTab';
import { AdminSettingsTab } from '../components/admin/tabs/AdminSettingsTab';
import { AdminUpdatesTab } from '../components/admin/tabs/AdminUpdatesTab';
import AgentEngineTab from '../components/admin/tabs/AgentEngineTab';

export function AdminPage() {
  const { tab = 'overview' } = useParams<{ tab: string }>();

  const renderTab = () => {
    switch (tab) {
      case 'overview':
        return <AdminOverviewTab />;
      case 'workspaces':
        return <AdminWorkspacesTab />;
      case 'users':
        return <AdminUsersTab />;
      case 'revenue':
        return <AdminRevenueTab />;
      case 'platform':
        return <AdminPlatformTab />;
      case 'agent-engine':
        return <AgentEngineTab />;
      case 'updates':
        return <AdminUpdatesTab />;
      case 'settings':
        return <AdminSettingsTab />;
      default:
        return <Navigate to="/admin" replace />;
    }
  };

  return (
    <AdminLayout>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {renderTab()}
      </div>
    </AdminLayout>
  );
}
