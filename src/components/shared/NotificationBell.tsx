import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { NotificationPopover } from './NotificationPopover';
import { cn } from '../../lib/utils';

interface NotificationBellProps {
  className?: string;
  /** Optional label rendered inside the trigger, after the bell icon. */
  children?: React.ReactNode;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className, children }) => {
  const { getUnreadCount } = useNotificationStore();
  const unreadCount = getUnreadCount();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'p-2 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all outline-none',
            className
          )}
          aria-label="Notifications"
        >
          {/* Badge is anchored to the icon, not the button, so it stays put in wide rows. */}
          <span className="relative shrink-0 flex">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-surface animate-in zoom-in duration-300">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <NotificationPopover />
      </Popover.Portal>
    </Popover.Root>
  );
};
