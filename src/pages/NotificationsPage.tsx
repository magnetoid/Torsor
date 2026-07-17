import React, { useState } from 'react';
import { 
  Bell, 
  Check, 
  Trash2, 
  MoreVertical, 
  Filter,
  Search,
  CheckCircle2,
  UserPlus,
  Rocket,
  AlertTriangle,
  Zap,
  Shield,
  Terminal,
  ExternalLink
} from 'lucide-react';
import { useNotificationStore, NotificationType } from '../stores/notificationStore';
import { cn, formatDistanceToNow } from '../lib/utils';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { AccountBar } from '../components/shared/AccountBar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'invite_received': return <UserPlus size={18} className="text-accent" />;
    case 'member_joined': return <CheckCircle2 size={18} className="text-success" />;
    case 'deploy_success': return <Rocket size={18} className="text-success" />;
    case 'deploy_failed': return <AlertTriangle size={18} className="text-error" />;
    case 'plan_limit_warning': return <Zap size={18} className="text-warning" />;
    case 'plan_upgraded': return <Zap size={18} className="text-accent" />;
    case 'security_alert': return <Shield size={18} className="text-error" />;
    case 'agent_complete': return <Terminal size={18} className="text-info" />;
    default: return <Bell size={18} className="text-secondary" />;
  }
};

export const NotificationsPage: React.FC = () => {
  const { notifications, markAsRead, markAllRead, clearAll } = useNotificationStore();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotifications = notifications
    .filter(n => filter === 'all' || !n.isRead)
    .filter(n => 
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      n.message.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="flex h-screen bg-page overflow-hidden">
      <HomeSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AccountBar title="Notifications" />
        {/* Header */}
        <header className="h-16 border-b border-default flex items-center justify-between px-8 shrink-0 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-muted rounded-xl text-accent">
              <Bell size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-primary">Notifications</h1>
              <p className="text-xs text-secondary">Stay updated with your workspace activity</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={markAllRead}
              className="px-3 py-1.5 text-xs font-bold text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all flex items-center gap-2"
            >
              <Check size={14} />
              Mark all as read
            </button>
            <button 
              onClick={clearAll}
              className="px-3 py-1.5 text-xs font-bold text-error hover:bg-error/10 rounded-lg transition-all flex items-center gap-2"
            >
              <Trash2 size={14} />
              Clear all
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex p-1 bg-inset rounded-xl border border-default">
                <button 
                  onClick={() => setFilter('all')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    filter === 'all' ? "bg-surface text-primary shadow-sm" : "text-secondary hover:text-primary"
                  )}
                >
                  All
                </button>
                <button 
                  onClick={() => setFilter('unread')}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                    filter === 'unread' ? "bg-surface text-primary shadow-sm" : "text-secondary hover:text-primary"
                  )}
                >
                  Unread
                </button>
              </div>

              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={14} />
                <input 
                  type="text"
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface border border-default rounded-xl pl-10 pr-4 py-2 text-sm text-primary outline-none focus:border-accent/50 transition-all"
                />
              </div>
            </div>

            {/* Notifications List */}
            <div className="bg-surface border border-default rounded-2xl overflow-hidden shadow-sm">
              {filteredNotifications.length > 0 ? (
                <div className="divide-y divide-subtle">
                  {filteredNotifications.map((notification) => (
                    <div 
                      key={notification.id}
                      className={cn(
                        "group p-4 flex items-start gap-4 transition-all hover:bg-elevated/50 relative",
                        !notification.isRead && "bg-accent-muted/5"
                      )}
                    >
                      {!notification.isRead && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                      )}

                      <div className="shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-xl bg-inset border border-default flex items-center justify-center">
                          {getNotificationIcon(notification.type)}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className={cn(
                            "text-sm font-bold truncate",
                            notification.isRead ? "text-primary" : "text-accent"
                          )}>
                            {notification.title}
                          </h3>
                          <span className="text-[10px] font-medium text-tertiary">
                            {formatDistanceToNow(notification.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-secondary leading-relaxed mb-3">
                          {notification.message}
                        </p>

                        {notification.type === 'invite_received' && !notification.isRead && (
                          <div className="flex items-center gap-2">
                            <button className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg transition-all">
                              Accept
                            </button>
                            <button className="px-3 py-1.5 bg-elevated hover:bg-inset text-primary text-xs font-bold rounded-lg border border-default transition-all">
                              Decline
                            </button>
                          </div>
                        )}

                        {notification.link && (
                          <button className="text-xs font-bold text-accent hover:text-accent-hover transition-colors flex items-center gap-1 mt-2">
                            View details
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>

                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="p-2 text-tertiary hover:text-primary hover:bg-inset rounded-lg transition-all">
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" className="min-w-[160px] bg-surface border border-default rounded-xl p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                              {!notification.isRead && (
                                <DropdownMenu.Item 
                                  onSelect={() => markAsRead(notification.id)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-elevated rounded-lg cursor-pointer outline-none"
                                >
                                  <Check size={14} /> Mark as read
                                </DropdownMenu.Item>
                              )}
                              <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-elevated rounded-lg cursor-pointer outline-none">
                                <Bell size={14} /> Mute similar
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-[1px] bg-subtle my-1" />
                              <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg cursor-pointer outline-none">
                                <Trash2 size={14} /> Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-inset rounded-full flex items-center justify-center text-tertiary mb-4">
                    <Bell size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-primary mb-1">No notifications found</h3>
                  <p className="text-sm text-secondary max-w-xs">
                    {searchQuery 
                      ? `We couldn't find any notifications matching "${searchQuery}"`
                      : "You're all caught up! New notifications will appear here."}
                  </p>
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="mt-4 text-sm font-bold text-accent hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
