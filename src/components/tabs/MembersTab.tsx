import React, { useState } from 'react';
import { SectionPreviewNotice } from '../shared/PreviewBanner';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  Users, 
  UserPlus, 
  MoreVertical, 
  UserMinus, 
  ShieldAlert, 
  Key, 
  Check, 
  ChevronDown,
  X,
  Clock,
  Mail,
  Plus
} from 'lucide-react';
import { useWorkspaceStore, useActiveWorkspace } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { WorkspaceMember, WorkspaceInvite } from '../../types/workspace';
import { EmptyState } from '../shared/EmptyState';
import { MemberRowSkeleton } from '../shared/Skeleton';

export function MembersTab() {
  const activeWorkspace = useActiveWorkspace();
  const { members, invites, inviteMember, removeMember, changeMemberRole, revokeInvite } = useWorkspaceStore();
  
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);
  const [inviteRows, setInviteRows] = useState<{ email: string; role: WorkspaceInvite['role'] }[]>([
    { email: '', role: 'developer' }
  ]);

  const workspaceMembers = members.filter(m => m.workspaceId === activeWorkspace?.id);
  const workspaceInvites = invites.filter(i => i.workspaceId === activeWorkspace?.id);

  const handleAddInviteRow = () => {
    setInviteRows([...inviteRows, { email: '', role: 'developer' }]);
  };

  const handleRemoveInviteRow = (index: number) => {
    setInviteRows(inviteRows.filter((_, i) => i !== index));
  };

  const handleUpdateInviteRow = (index: number, field: 'email' | 'role', value: string) => {
    const newRows = [...inviteRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setInviteRows(newRows);
  };

  const handleSendInvites = () => {
    const validInvites = inviteRows.filter(row => row.email.trim() !== '');
    if (validInvites.length === 0) return;

    validInvites.forEach(row => {
      inviteMember(row.email, row.role);
    });

    toast.success(`${validInvites.length} invite${validInvites.length > 1 ? 's' : ''} sent`);
    setInviteDialogOpen(false);
    setInviteRows([{ email: '', role: 'developer' }]);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <SectionPreviewNotice>Team members &amp; invites are a preview — there&apos;s no org backend yet, so nothing is emailed or saved.</SectionPreviewNotice>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="text-accent" size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Members ({workspaceMembers.length})</h3>
        </div>
        <button 
          onClick={() => setInviteDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all"
        >
          <UserPlus size={18} />
          Invite Member
        </button>
      </div>

      {/* Member Table */}
      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-default bg-elevated/50">
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Member</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Last Active</th>
              <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default">
            {isLoading ? (
              <>
                <MemberRowSkeleton />
                <MemberRowSkeleton />
                <MemberRowSkeleton />
              </>
            ) : workspaceMembers.length > 0 ? (
              workspaceMembers.map((member) => (
                <tr key={member.id} className="group hover:bg-elevated/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent overflow-hidden">
                        {member.user.avatarUrl ? (
                          <img src={member.user.avatarUrl} alt={member.user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-xs font-bold">{member.user.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-primary">{member.user.name}</div>
                        <div className="text-xs text-secondary">{member.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {member.role === 'owner' ? (
                      <span className="text-xs font-bold text-accent uppercase tracking-wider">Owner</span>
                    ) : (
                      <Select.Root 
                        value={member.role} 
                        onValueChange={(val) => changeMemberRole(member.userId, val as any)}
                      >
                        <Select.Trigger className="flex items-center gap-1 text-xs font-medium text-primary hover:text-accent transition-colors outline-none">
                          <Select.Value />
                          <Select.Icon>
                            <ChevronDown size={12} />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                            <Select.Viewport>
                              {['admin', 'developer', 'viewer'].map((role) => (
                                <Select.Item 
                                  key={role} 
                                  value={role}
                                  className="flex items-center justify-between px-3 py-1.5 text-xs text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer capitalize"
                                >
                                  <Select.ItemText>{role}</Select.ItemText>
                                  <Select.ItemIndicator>
                                    <Check size={12} className="text-accent" />
                                  </Select.ItemIndicator>
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        member.status === 'active' ? "bg-success" : "bg-warning"
                      )} />
                      <span className="text-xs text-secondary capitalize">{member.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-secondary">{member.lastActiveAt ? '2 hours ago' : 'Never'}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {member.role !== 'owner' && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
                            <MoreVertical size={16} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] w-48 animate-in fade-in zoom-in-95 duration-100">
                            <DropdownMenu.Item 
                              onClick={() => removeMember(member.userId)}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer"
                            >
                              <UserMinus size={14} />
                              Remove from workspace
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:bg-accent/10 hover:text-primary rounded-lg outline-none cursor-pointer">
                              <ShieldAlert size={14} />
                              Suspend member
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:bg-accent/10 hover:text-primary rounded-lg outline-none cursor-pointer">
                              <Key size={14} />
                              Reset password
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12">
                  <EmptyState 
                    icon={Users}
                    title="Just you for now"
                    description="Invite your team to start collaborating on projects."
                    actionLabel="Invite Member"
                    onAction={() => setInviteDialogOpen(true)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {workspaceInvites.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="text-warning" size={18} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">Pending Invites ({workspaceInvites.length})</h3>
          </div>
          <div className="bg-surface border border-default rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-default bg-elevated/50">
                  <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Sent</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Expires</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {workspaceInvites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-elevated/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-tertiary" />
                        <span className="text-sm text-primary">{invite.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-xs font-medium text-secondary capitalize">{invite.role}</span>
                    </td>
                    <td className="px-6 py-3 text-xs text-tertiary">Just now</td>
                    <td className="px-6 py-3 text-xs text-tertiary">In 7 days</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-[10px] font-bold uppercase text-accent hover:text-accent-hover transition-colors">Resend</button>
                        <button 
                          onClick={() => revokeInvite(invite.id)}
                          className="text-[10px] font-bold uppercase text-error hover:text-error/80 transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog.Root open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] animate-in fade-in duration-200" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-page border border-default rounded-3xl p-6 shadow-2xl z-[201] animate-in zoom-in-95 fade-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-xl font-bold text-primary">
                Invite to {activeWorkspace?.name}
              </Dialog.Title>
              <Dialog.Close className="p-2 hover:bg-elevated rounded-full text-tertiary hover:text-primary transition-colors">
                <X size={20} />
              </Dialog.Close>
            </div>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {inviteRows.map((row, index) => (
                <div key={index} className="flex gap-3 items-end animate-in slide-in-from-left-2 duration-200">
                  <div className="flex-1 space-y-2">
                    {index === 0 && <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Email Address</label>}
                    <input 
                      type="email" 
                      value={row.email}
                      onChange={(e) => handleUpdateInviteRow(index, 'email', e.target.value)}
                      placeholder="colleague@company.com"
                      className="w-full bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    {index === 0 && <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Role</label>}
                    <Select.Root 
                      value={row.role} 
                      onValueChange={(val) => handleUpdateInviteRow(index, 'role', val as any)}
                    >
                      <Select.Trigger className="w-full flex items-center justify-between bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors">
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown size={14} />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[210] animate-in fade-in zoom-in-95 duration-100">
                          <Select.Viewport>
                            {['admin', 'developer', 'viewer'].map((role) => (
                              <Select.Item 
                                key={role} 
                                value={role}
                                className="flex items-center justify-between px-3 py-2 text-sm text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer capitalize"
                              >
                                <Select.ItemText>{role}</Select.ItemText>
                                <Select.ItemIndicator>
                                  <Check size={14} className="text-accent" />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                  {inviteRows.length > 1 && (
                    <button 
                      onClick={() => handleRemoveInviteRow(index)}
                      className="p-2.5 hover:bg-error/10 text-tertiary hover:text-error rounded-xl transition-colors mb-0.5"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button 
              onClick={handleAddInviteRow}
              className="mt-4 flex items-center gap-2 text-xs font-bold text-accent hover:text-accent-hover transition-colors uppercase tracking-wider"
            >
              <Plus size={14} />
              Add another
            </button>

            <div className="flex gap-3 mt-8">
              <Dialog.Close asChild>
                <button className="flex-1 py-2.5 rounded-xl font-medium text-secondary hover:bg-elevated transition-colors">Cancel</button>
              </Dialog.Close>
              <button 
                onClick={handleSendInvites}
                disabled={inviteRows.every(r => !r.email)}
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-accent/20 transition-all"
              >
                Send Invites
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
