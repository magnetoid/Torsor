import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  MoreVertical,
  Eye,
  ShieldAlert,
  Trash2,
  Ban,
  Key,
  CreditCard,
  Mail,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';
import { useAdminStore, type UserRole } from '../../../stores/adminStore';

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const ROLE_OPTIONS: UserRole[] = ['user', 'admin', 'super_admin'];

export function AdminUsersTab() {
  const { users: rawUsers, usersTotal, isLoadingUsers, error, fetchUsers, updateUserRole } = useAdminStore();
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [grantCreditsOpen, setGrantCreditsOpen] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState('100000');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const users = useMemo(
    () =>
      rawUsers.map((u) => ({
        id: u.id,
        name: u.username,
        email: u.email,
        workspaces: u.projectCount,
        role: u.role,
        lastActive: formatRelative(u.lastActiveAt),
        status: 'active' as const,
        avatar: u.avatarUrl || `https://picsum.photos/seed/${u.id}/200`,
      })),
    [rawUsers],
  );

  const runSearch = () => {
    void fetchUsers({ search: search.trim() || undefined });
  };

  const changeRole = async (userId: string, role: UserRole) => {
    try {
      await updateUserRole(userId, role);
      toast.success(`Role updated to ${role}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(u => u.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter(uid => uid !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  const handleGrantCredits = () => {
    toast.success(`Granted ${creditsAmount} credits to ${selectedUsers.length} users`);
    setGrantCreditsOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[300px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={16} />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              className="w-full bg-surface border border-default rounded-xl pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-default rounded-xl text-xs font-bold text-primary hover:border-accent transition-colors">
          <Filter size={16} className="text-tertiary" />
          Filter
        </button>

        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-200">
            <button 
              onClick={() => setGrantCreditsOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent/10 text-accent rounded-xl text-xs font-bold hover:bg-accent/20 transition-all"
            >
              <CreditCard size={16} />
              Grant Credits ({selectedUsers.length})
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-error/10 text-error rounded-xl text-xs font-bold hover:bg-error/20 transition-all">
              <Ban size={16} />
              Suspend
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-elevated border border-default rounded-xl text-xs font-bold text-primary hover:bg-surface transition-all">
              <Mail size={16} />
              Email All
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-default bg-elevated/50">
              <th className="px-6 py-4 w-10">
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    "w-4 h-4 rounded border transition-all flex items-center justify-center",
                    users.length > 0 && selectedUsers.length === users.length
                      ? "bg-accent border-accent text-white"
                      : "border-default hover:border-accent"
                  )}
                >
                  {users.length > 0 && selectedUsers.length === users.length && <CheckCircle2 size={12} />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">User</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Projects</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Last Active</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default">
            {users.map((user) => (
              <tr 
                key={user.id} 
                className={cn(
                  "group hover:bg-elevated/30 transition-colors cursor-pointer",
                  selectedUsers.includes(user.id) && "bg-accent/5"
                )}
                onClick={() => toggleSelectUser(user.id)}
              >
                <td className="px-6 py-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleSelectUser(user.id); }}
                    className={cn(
                      "w-4 h-4 rounded border transition-all flex items-center justify-center",
                      selectedUsers.includes(user.id) 
                        ? "bg-accent border-accent text-white" 
                        : "border-default group-hover:border-accent"
                    )}
                  >
                    {selectedUsers.includes(user.id) && <CheckCircle2 size={12} />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-elevated border border-default overflow-hidden">
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-primary">{user.name}</div>
                      <div className="text-xs text-secondary">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="text-sm text-secondary font-medium">{user.workspaces}</span>
                </td>
                <td className="px-6 py-4">
                  <div className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit",
                    user.role === 'super_admin' ? "bg-accent/10 text-accent" :
                    user.role === 'admin' ? "bg-info/10 text-info" :
                    "bg-elevated text-tertiary"
                  )}>
                    {user.role}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs text-tertiary">
                    <Clock size={12} />
                    {user.lastActive}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit",
                    user.status === 'active' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                  )}>
                    {user.status === 'active' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                    {user.status}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-accent/10 rounded-lg outline-none cursor-pointer">
                          <Eye size={14} />
                          View Profile
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-accent/10 rounded-lg outline-none cursor-pointer">
                          <Key size={14} />
                          Reset Password
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onClick={() => { setSelectedUsers([user.id]); setGrantCreditsOpen(true); }}
                          className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-accent hover:bg-accent/10 rounded-lg outline-none cursor-pointer"
                        >
                          <CreditCard size={14} />
                          Grant Credits
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="h-px bg-default my-1" />
                        <DropdownMenu.Label className="px-3 py-1 text-[10px] font-bold text-tertiary uppercase tracking-wider">Set role</DropdownMenu.Label>
                        {ROLE_OPTIONS.filter((role) => role !== user.role).map((role) => (
                          <DropdownMenu.Item
                            key={role}
                            onClick={() => void changeRole(user.id, role)}
                            className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-accent/10 rounded-lg outline-none cursor-pointer"
                          >
                            <ShieldAlert size={14} />
                            Make {role}
                          </DropdownMenu.Item>
                        ))}
                        <DropdownMenu.Separator className="h-px bg-default my-1" />
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer">
                          <ShieldAlert size={14} />
                          Suspend
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer">
                          <Ban size={14} />
                          Ban User
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs text-secondary">
          {isLoadingUsers
            ? 'Loading users…'
            : error
            ? <span className="text-error">{error}</span>
            : <>Showing <span className="font-bold text-primary">{users.length}</span> of <span className="font-bold text-primary">{usersTotal.toLocaleString()}</span> users</>}
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors disabled:opacity-30" disabled>
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1">
            {[1, 2, 3, '...', 195].map((page, i) => (
              <button 
                key={i}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                  page === 1 ? "bg-accent text-white" : "text-secondary hover:bg-elevated"
                )}
              >
                {page}
              </button>
            ))}
          </div>
          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Grant Credits Dialog */}
      <Dialog.Root open={grantCreditsOpen} onOpenChange={setGrantCreditsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] animate-in fade-in duration-300" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-default rounded-3xl p-8 shadow-2xl z-[201] animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                <CreditCard size={24} />
              </div>
              <div>
                <Dialog.Title className="text-xl font-bold text-primary">Grant Credits</Dialog.Title>
                <Dialog.Description className="text-sm text-secondary">
                  Grant additional tokens to {selectedUsers.length} selected user(s).
                </Dialog.Description>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Token Amount</label>
                <input 
                  type="number" 
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  className="w-full bg-page border border-default rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="p-4 bg-accent/5 border border-accent/10 rounded-2xl text-xs text-accent leading-relaxed">
                Tokens will be added to the users' managed credit pool and will not expire.
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Dialog.Close asChild>
                <button className="flex-1 py-3 bg-elevated border border-default rounded-xl text-sm font-bold text-primary hover:bg-surface transition-all">
                  Cancel
                </button>
              </Dialog.Close>
              <button 
                onClick={handleGrantCredits}
                className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all"
              >
                Grant Tokens
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
