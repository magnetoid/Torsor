import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { 
  Bell, 
  Check, 
  X, 
  UserPlus, 
  Rocket, 
  AlertTriangle, 
  Zap, 
  Shield, 
  CheckCircle2, 
  Trash2,
  ExternalLink
} from 'lucide-react';
import { useNotificationStore, NotificationType, Notification } from '../../stores/notificationStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { cn, formatDistanceToNow } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'invite_received': return <UserPlus size={16} className="text-accent" />;
    case 'member_joined': return <UserPlus size={16} className="text-success" />;
    case 'deploy_success': return <Rocket size={16} className="text-success" />;
    case 'deploy_failed': return <Rocket size={16} className="text-error" />;
    case 'plan_limit_warning': return <AlertTriangle size={16} className="text-warning" />;
    case 'plan_upgraded': return <Zap size={16} className="text-accent" />;
    case 'security_alert': return <Shield size={16} className="text-error" />;
    case 'agent_complete': return <CheckCircle2 size={16} className="text-success" />;
    default: return <Bell size={16} className="text-secondary" />;
  }
};

export const NotificationPopover: React.FC = () => {
  const { notifications, markAsRead, markAllRead, clearAll, removeNotification } = useNotificationStore();
  const acceptInvite = useWorkspaceStore((s) => s.acceptInvite);
  const navigate = useNavigate();

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleAcceptInvite = async (n: Notification) => {
    const inviteId = n.metadata?.inviteId;
    if (!inviteId) return;
    try {
      await acceptInvite(inviteId);
      removeNotification(n.id);
      toast.success('Invitation accepted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept invitation');
    }
  };

  // No server-side decline endpoint exists for a received invite yet, so
  // declining just dismisses the notification locally (honest — we don't
  // claim the server was told).
  const handleDeclineInvite = (n: Notification) => {
    removeNotification(n.id);
    toast('Invitation dismissed');
  };

  return (
    <Popover.Content 
      className="w-[380px] bg-surface border border-default rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      align="end"
      sideOffset={8}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle bg-elevated/50">
        <h3 className="text-sm font-bold text-primary">Notifications</h3>
        <div className="flex items-center gap-3">
          <button 
            onClick={markAllRead}
            className="text-xs font-bold text-accent hover:text-accent-hover transition-colors focus-ring rounded-sm"
          >
            Mark all read
          </button>
          <button 
            onClick={clearAll}
            aria-label="Clear all notifications"
            className="text-secondary hover:text-error transition-colors focus-ring rounded-sm"
            title="Clear all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <ScrollArea.Root className="h-[400px]">
        <ScrollArea.Viewport className="w-full h-full">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-inset flex items-center justify-center text-tertiary mb-3">
                <Bell size={24} />
              </div>
              <p className="text-sm font-medium text-secondary">No notifications yet</p>
              <p className="text-xs text-tertiary mt-1">We'll notify you when something happens.</p>
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleNotificationClick(n);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "relative w-full px-4 py-3 flex gap-3 hover:bg-elevated transition-colors group text-left focus-ring",
                    !n.isRead && "bg-accent/5"
                  )}
                >
                  {!n.isRead && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />
                  )}
                  
                  <div className="shrink-0 mt-0.5">
                    {n.metadata?.userAvatar ? (
                      <img 
                        src={n.metadata.userAvatar} 
                        alt="" 
                        className="w-8 h-8 rounded-full border border-default"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-inset flex items-center justify-center border border-default">
                        {getNotificationIcon(n.type)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm leading-snug",
                        !n.isRead ? "text-primary font-medium" : "text-secondary"
                      )}>
                        {n.message}
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tertiary font-medium">
                        {formatDistanceToNow(n.timestamp)}
                      </span>
                      
                      {n.type === 'invite_received' && !n.isRead && n.metadata?.inviteId && (
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); void handleAcceptInvite(n); }}
                            className="px-2 py-0.5 bg-accent text-white text-xs font-bold rounded hover:bg-accent-hover transition-colors focus-ring"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); handleDeclineInvite(n); }}
                            className="px-2 py-0.5 bg-elevated text-secondary text-xs font-bold rounded border border-default hover:bg-inset transition-colors focus-ring"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="flex select-none touch-none p-0.5 bg-transparent w-1.5 transition-colors">
          <ScrollArea.Thumb className="flex-1 bg-default rounded-full" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <div className="px-4 py-2 border-t border-subtle bg-elevated/30">
        <button 
          onClick={() => navigate('/notifications')}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-secondary hover:text-primary transition-colors focus-ring rounded-md"
        >
          View all notifications
          <ExternalLink size={12} />
        </button>
      </div>
    </Popover.Content>
  );
};
