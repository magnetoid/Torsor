import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { 
  LayoutGrid, 
  Layers, 
  Users, 
  CreditCard, 
  Settings, 
  LogOut, 
  ChevronDown,
  Plus,
  MoreVertical,
  Search,
  Download,
  Trash2,
  Mail,
  Shield,
  Clock,
  Globe,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Toast from '@radix-ui/react-toast';
import { useAuthStore } from '../stores/authStore';
import { usageMock } from '../lib/mockData';
import { cn } from '../lib/utils';
import { Input } from '../components/shared/Input';

const NavItem = ({ icon: Icon, label, active, onClick }: { icon: React.ElementType, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-accent/10 text-accent border-l-2 border-accent" 
        : "text-secondary hover:text-primary hover:bg-surface"
    )}
  >
    <Icon size={18} />
    {label}
  </button>
);

const RoleBadge = ({ role }: { role: string }) => {
  const styles: Record<string, string> = {
    owner: "bg-warning/10 text-warning border-warning/20",
    admin: "bg-accent/10 text-accent border-accent/20",
    developer: "bg-success/10 text-success border-success/20",
    viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", styles[role.toLowerCase()] || styles.viewer)}>
      {role}
    </span>
  );
};

export const TeamPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('members');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [inviteRows, setInviteRows] = useState([{ email: '', role: 'developer' }]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const addInviteRow = () => {
    setInviteRows([...inviteRows, { email: '', role: 'developer' }]);
  };

  const removeInviteRow = (index: number) => {
    setInviteRows(inviteRows.filter((_, i) => i !== index));
  };

  const sendInvites = () => {
    setIsInviteModalOpen(false);
    setToastOpen(true);
    setInviteRows([{ email: '', role: 'developer' }]);
  };

  return (
    <div className="flex h-screen bg-inset text-primary font-sans overflow-hidden">
      <Toast.Provider swipeDirection="right">
        {/* Sidebar */}
        <aside className="w-56 bg-page border-r border-default flex flex-col shrink-0">
          <div className="p-4">
            <Select.Root defaultValue="personal">
              <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-surface border border-default rounded-md text-sm font-medium outline-none hover:border-accent/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-accent rounded flex items-center justify-center text-[10px] text-white">T</div>
                  <Select.Value />
                </div>
                <Select.Icon>
                  <ChevronDown size={14} className="text-secondary" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50 overflow-hidden">
                  <Select.Viewport className="p-1">
                    <Select.Item value="personal" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                      <Select.ItemText>Personal Workspace</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="team" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                      <Select.ItemText>Acme Team</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <nav className="flex-1 mt-4">
            <NavItem icon={LayoutGrid} label="Projects" onClick={() => navigate('/dashboard')} />
            <NavItem icon={Sparkles} label="Model Arena" onClick={() => navigate('/arena')} />
            <NavItem icon={Users} label="Team" active />
            <NavItem icon={CreditCard} label="Billing" onClick={() => navigate('/billing')} />
            <NavItem icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
          </nav>

          <div className="p-4 border-t border-default">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden">
                <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}`} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-[10px] text-secondary truncate">Pro Plan</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-error hover:bg-error/5 rounded transition-all"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 border-b border-default bg-inset flex items-center justify-between px-8 shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold tracking-tight">Team</h2>
              <span className="bg-accent/10 text-accent text-[10px] font-bold px-2 py-0.5 rounded-full border border-accent/20">
                {usageMock.teamMembers.length} Members
              </span>
            </div>
            <Dialog.Root open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
              <Dialog.Trigger asChild>
                <button className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-md text-sm font-bold transition-all shadow-lg shadow-accent/20">
                  <Plus size={18} />
                  Invite Members
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-default rounded-xl p-6 shadow-2xl z-50 animate-in zoom-in-95 duration-200">
                  <Dialog.Title className="text-xl font-bold mb-2">Invite team members</Dialog.Title>
                  <Dialog.Description className="text-sm text-secondary mb-6">
                    Send invitations to your colleagues to join this workspace.
                  </Dialog.Description>

                  <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {inviteRows.map((row, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="flex-1">
                          <Input 
                            placeholder="email@company.com" 
                            value={row.email}
                            onChange={(e) => {
                              const newRows = [...inviteRows];
                              newRows[index].email = e.target.value;
                              setInviteRows(newRows);
                            }}
                          />
                        </div>
                        <Select.Root 
                          defaultValue={row.role}
                          onValueChange={(val) => {
                            const newRows = [...inviteRows];
                            newRows[index].role = val;
                            setInviteRows(newRows);
                          }}
                        >
                          <Select.Trigger className="w-28 flex items-center justify-between px-3 py-2 bg-page border border-default rounded-md text-xs font-medium outline-none">
                            <Select.Value />
                            <Select.Icon />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-[60]">
                              <Select.Viewport className="p-1">
                                {['Admin', 'Developer', 'Viewer'].map(role => (
                                  <Select.Item key={role} value={role.toLowerCase()} className="flex items-center px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                    <Select.ItemText>{role}</Select.ItemText>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        {inviteRows.length > 1 && (
                          <button 
                            onClick={() => removeInviteRow(index)}
                            className="p-2 text-secondary hover:text-error"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={addInviteRow}
                    className="flex items-center gap-2 text-xs font-bold text-accent hover:text-accent-hover mb-8"
                  >
                    <Plus size={14} /> Add another
                  </button>

                  <div className="flex gap-3">
                    <Dialog.Close asChild>
                      <button className="flex-1 py-2 bg-page border border-default rounded-md text-sm font-bold hover:bg-elevated transition-colors">
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button 
                      onClick={sendInvites}
                      className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-bold transition-colors shadow-lg shadow-accent/20"
                    >
                      Send Invites
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </header>

          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs.Root defaultValue="members" onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-8 border-b border-default bg-inset">
                <Tabs.List className="flex gap-8">
                  <Tabs.Trigger 
                    value="members"
                    className="py-4 text-sm font-medium text-secondary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
                  >
                    Members
                  </Tabs.Trigger>
                  <Tabs.Trigger 
                    value="audit"
                    className="py-4 text-sm font-medium text-secondary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
                  >
                    Audit Log
                  </Tabs.Trigger>
                </Tabs.List>
              </div>

              <Tabs.Content value="members" className="flex-1 overflow-y-auto p-8 custom-scrollbar outline-none">
                <div className="max-w-6xl mx-auto space-y-12">
                  {/* Member Table */}
                  <section>
                    <div className="bg-page border border-default rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-default bg-surface/50">
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Member</th>
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Email</th>
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Role</th>
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Last Active</th>
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default">
                          {usageMock.teamMembers.map((member) => (
                            <tr key={member.id} className="hover:bg-surface transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <img src={member.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  <span className="font-medium">{member.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-secondary">{member.email}</td>
                              <td className="px-6 py-4">
                                <RoleBadge role={member.role} />
                              </td>
                              <td className="px-6 py-4 text-secondary text-xs">{member.lastActive}</td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full", member.status === 'online' ? "bg-success shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-zinc-600")} />
                                  <span className="text-xs capitalize">{member.status}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {member.role !== 'owner' && (
                                  <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                      <button className="p-1 text-secondary hover:text-primary transition-colors outline-none">
                                        <MoreVertical size={16} />
                                      </button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                      <DropdownMenu.Content className="min-w-[160px] bg-surface border border-default rounded-md p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <DropdownMenu.Sub>
                                          <DropdownMenu.SubTrigger className="flex items-center justify-between px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                            <div className="flex items-center gap-2">
                                              <Shield size={14} /> Change Role
                                            </div>
                                            <ChevronDown size={14} className="-rotate-90" />
                                          </DropdownMenu.SubTrigger>
                                          <DropdownMenu.Portal>
                                            <DropdownMenu.SubContent className="min-w-[120px] bg-surface border border-default rounded-md p-1 shadow-xl z-[60]">
                                              {['Admin', 'Developer', 'Viewer'].map(role => (
                                                <DropdownMenu.Item key={role} className="flex items-center px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                                  {role}
                                                </DropdownMenu.Item>
                                              ))}
                                            </DropdownMenu.SubContent>
                                          </DropdownMenu.Portal>
                                        </DropdownMenu.Sub>
                                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                          <RefreshCw size={14} /> Reset Password
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Separator className="h-[1px] bg-elevated my-1" />
                                        <AlertDialog.Root>
                                          <AlertDialog.Trigger asChild>
                                            <DropdownMenu.Item 
                                              onSelect={(e) => e.preventDefault()}
                                              className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error hover:text-white rounded cursor-pointer outline-none"
                                            >
                                              <Trash2 size={14} /> Remove
                                            </DropdownMenu.Item>
                                          </AlertDialog.Trigger>
                                          <AlertDialog.Portal>
                                            <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-200" />
                                            <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-surface border border-default rounded-xl p-6 shadow-2xl z-[101] animate-in zoom-in-95 duration-200">
                                              <AlertDialog.Title className="text-lg font-bold mb-2">Remove member?</AlertDialog.Title>
                                              <AlertDialog.Description className="text-sm text-secondary mb-6">
                                                Are you sure you want to remove <span className="text-primary font-medium">{member.name}</span> from the workspace? They will lose all access immediately.
                                              </AlertDialog.Description>
                                              <div className="flex gap-3 justify-end">
                                                <AlertDialog.Cancel asChild>
                                                  <button className="px-4 py-2 bg-page border border-default rounded-md text-sm font-bold hover:bg-elevated transition-colors">
                                                    Cancel
                                                  </button>
                                                </AlertDialog.Cancel>
                                                <AlertDialog.Action asChild>
                                                  <button className="px-4 py-2 bg-error hover:bg-error text-white rounded-md text-sm font-bold transition-colors">
                                                    Remove Member
                                                  </button>
                                                </AlertDialog.Action>
                                              </div>
                                            </AlertDialog.Content>
                                          </AlertDialog.Portal>
                                        </AlertDialog.Root>
                                      </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                  </DropdownMenu.Root>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Pending Invites */}
                  <section>
                    <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Mail size={16} /> Pending Invites
                    </h3>
                    <div className="bg-page border border-default rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-default bg-surface/50">
                            <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Sent Date</th>
                            <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default">
                          {usageMock.pendingInvites.map((invite) => (
                            <tr key={invite.email} className="hover:bg-surface transition-colors">
                              <td className="px-6 py-4 font-medium">{invite.email}</td>
                              <td className="px-6 py-4">
                                <RoleBadge role={invite.role} />
                              </td>
                              <td className="px-6 py-4 text-secondary text-xs">{invite.sentDate}</td>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
                                  invite.status === 'pending' ? "bg-warning/10 text-warning border-warning/20" : "bg-error/10 text-error border-error/20"
                                )}>
                                  {invite.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button className="p-1.5 text-secondary hover:text-accent transition-colors" title="Resend">
                                    <RefreshCw size={14} />
                                  </button>
                                  <button className="p-1.5 text-secondary hover:text-error transition-colors" title="Revoke">
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content value="audit" className="flex-1 overflow-y-auto p-8 custom-scrollbar outline-none">
                <div className="max-w-6xl mx-auto space-y-6">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-page border border-default p-4 rounded-xl">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-secondary">Action:</span>
                        <Select.Root defaultValue="all">
                          <Select.Trigger className="min-w-[140px] flex items-center justify-between px-3 py-1.5 bg-inset border border-default rounded text-xs font-medium outline-none">
                            <Select.Value />
                            <Select.Icon />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50">
                              <Select.Viewport className="p-1">
                                {['All Actions', 'Login', 'Project Create', 'Project Delete', 'Deploy', 'Invite Sent', 'Settings Changed'].map(action => (
                                  <Select.Item key={action} value={action.toLowerCase().replace(' ', '_')} className="flex items-center px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                    <Select.ItemText>{action}</Select.ItemText>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-secondary">User:</span>
                        <Select.Root defaultValue="all">
                          <Select.Trigger className="min-w-[140px] flex items-center justify-between px-3 py-1.5 bg-inset border border-default rounded text-xs font-medium outline-none">
                            <Select.Value />
                            <Select.Icon />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50">
                              <Select.Viewport className="p-1">
                                <Select.Item value="all" className="flex items-center px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                  <Select.ItemText>All Users</Select.ItemText>
                                </Select.Item>
                                {usageMock.teamMembers.map(m => (
                                  <Select.Item key={m.id} value={m.id} className="flex items-center px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                    <Select.ItemText>{m.name}</Select.ItemText>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                    </div>
                    <button className="flex items-center gap-2 text-xs font-bold text-secondary hover:text-primary transition-colors">
                      <Download size={14} /> Export CSV
                    </button>
                  </div>

                  {/* Audit Table */}
                  <div className="bg-page border border-default rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-default bg-surface/50">
                          <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Timestamp</th>
                          <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">User</th>
                          <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Action</th>
                          <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Resource</th>
                          <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">IP Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default">
                        {usageMock.auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-surface transition-colors">
                            <td className="px-6 py-4 text-secondary text-xs font-mono">{log.timestamp}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <img src={log.user.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                                <span className="text-xs font-medium">{log.user.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-mono text-accent">{log.action}</span>
                            </td>
                            <td className="px-6 py-4 text-xs text-primary">{log.resource}</td>
                            <td className="px-6 py-4 text-secondary text-xs font-mono">{log.ipAddress}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-4 border-t border-default text-center">
                      <button className="text-xs font-bold text-accent hover:text-accent-hover">Load more</button>
                    </div>
                  </div>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </main>

        {/* Toast Notification */}
        <Toast.Root 
          open={toastOpen} 
          onOpenChange={setToastOpen}
          className="bg-surface border border-default rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-full duration-300"
        >
          <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success">
            <Check size={18} />
          </div>
          <div className="flex-1">
            <Toast.Title className="text-sm font-bold">Invites sent</Toast.Title>
            <Toast.Description className="text-xs text-secondary">
              Your team members will receive an email shortly.
            </Toast.Description>
          </div>
          <Toast.Action asChild altText="Close">
            <button className="text-secondary hover:text-primary">
              <X size={16} />
            </button>
          </Toast.Action>
        </Toast.Root>
        <Toast.Viewport className="fixed bottom-6 right-6 z-[200] w-80 flex flex-col gap-2 outline-none" />
      </Toast.Provider>
    </div>
  );
};
