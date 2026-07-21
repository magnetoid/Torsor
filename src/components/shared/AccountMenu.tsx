import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Settings, Shield, User as UserIcon, LogOut, Info, Rocket, MessageSquareHeart } from 'lucide-react';
import { cn } from '../../lib/utils';
import { popoverMotion } from '../../lib/motion';
import { useAuthStore } from '../../stores/authStore';

/**
 * The user account menu (avatar trigger + dropdown): identity header, Account, Settings,
 * an Admin Panel entry for admins, and Sign out. This is the single source of truth for the
 * account affordance — the IDE TopBar and every page's AccountBar render it, so the account
 * menu is consistently available top-right across the whole app.
 */
export function AccountMenu({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  const dim = size === 'md' ? 'w-7 h-7' : 'w-6 h-6';
  const avatarSrc = user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            dim,
            'rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden cursor-pointer outline-none transition-all hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[state=open]:ring-2 data-[state=open]:ring-accent/60',
          )}
          aria-label="User menu"
        >
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn('bg-elevated border border-default rounded-lg p-1 shadow-2xl z-[100] min-w-[220px]', popoverMotion)}
        >
          {/* Identity header */}
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden shrink-0">
              <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-primary truncate">{user?.name || 'User'}</p>
                {isAdmin && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent-muted px-1.5 py-0.5 rounded">
                    {user?.role === 'super_admin' ? 'Super' : 'Admin'}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary truncate">{user?.email}</p>
            </div>
          </div>

          <DropdownMenu.Separator className="h-[1px] bg-default my-1" />

          <DropdownMenu.Item
            onSelect={() => navigate('/settings')}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
          >
            <UserIcon size={15} className="shrink-0" />
            Account
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => navigate('/settings')}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
          >
            <Settings size={15} className="shrink-0" />
            Settings
          </DropdownMenu.Item>

          {isAdmin && (
            <>
              <DropdownMenu.Separator className="h-[1px] bg-default my-1" />
              <DropdownMenu.Item
                onSelect={() => navigate('/admin')}
                className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-accent rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-accent-muted"
              >
                <Shield size={15} className="shrink-0" />
                {user?.role === 'super_admin' ? 'Super Admin' : 'Admin Panel'}
              </DropdownMenu.Item>
            </>
          )}

          <DropdownMenu.Separator className="h-[1px] bg-default my-1" />

          {/* Platform: About / What's New (changelog) / Feedback */}
          <DropdownMenu.Item
            onSelect={() => navigate('/about')}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
          >
            <Info size={15} className="shrink-0" />
            About
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => navigate('/updates')}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
          >
            <Rocket size={15} className="shrink-0" />
            What's New
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => navigate('/feedback')}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
          >
            <MessageSquareHeart size={15} className="shrink-0" />
            Send Feedback
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-[1px] bg-default my-1" />
          <DropdownMenu.Item
            onSelect={handleLogout}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-error rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-error/10 data-[highlighted]:text-error"
          >
            <LogOut size={15} className="shrink-0" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
