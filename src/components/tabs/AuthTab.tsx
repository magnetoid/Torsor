import React, { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  ShieldCheck, 
  UserCheck, 
  Users, 
  Settings, 
  Layout, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Ban, 
  Key, 
  UserPlus, 
  Mail, 
  Github, 
  Chrome, 
  Link, 
  ChevronDown, 
  Check, 
  ExternalLink, 
  Sparkles,
  Search,
  ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthToolStore, AuthUser, UserRole } from '../../stores/authToolStore';

const formatTime = (timestamp: number) => {
  if (timestamp === 0) return 'Never';
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  const minutes = Math.floor(diff / 60000);
  return `${minutes}m ago`;
};

export default function AuthTab() {
  const { 
    isEnabled, 
    enableAuth, 
    users, 
    providers, 
    toggleProvider, 
    settings, 
    updateSettings, 
    branding, 
    updateBranding, 
    deleteUser, 
    banUser, 
    changeRole, 
    inviteUser 
  } = useAuthToolStore();

  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-page text-center">
        <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
          <ShieldCheck size={32} className="text-accent-hover" />
        </div>
        <h2 className="text-xl font-bold text-primary mb-2">Add authentication to your app</h2>
        <p className="text-sm text-secondary max-w-md mb-8">
          Adds login page, user management, and session handling. Works instantly with zero configuration required.
        </p>

        <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
          {[
            { id: 'email', label: 'Email/Password', icon: Mail },
            { id: 'github', label: 'GitHub OAuth', icon: Github },
            { id: 'google', label: 'Google OAuth', icon: Chrome },
            { id: 'magicLink', label: 'Magic Link', icon: Link },
          ].map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-surface border border-default rounded-xl">
              <p.icon size={16} className="text-secondary" />
              <span className="text-xs text-primary font-medium">{p.label}</span>
              <div className="ml-auto w-4 h-4 rounded border border-default flex items-center justify-center bg-page">
                <Check size={12} className="text-accent-hover" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button 
            onClick={enableAuth}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-accent/20"
          >
            Enable Auth
          </button>
          <button className="w-full py-2.5 bg-surface hover:bg-elevated border border-default text-primary text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2">
            <Sparkles size={16} className="text-warning" />
            Set up with Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-accent-hover" />
            <span className="text-xs font-bold text-primary">Authentication</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-primary">{users.length}</span>
              <span className="text-xs text-secondary uppercase tracking-wider">Users</span>
            </div>
            <div className="w-[1px] h-3 bg-default" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-success">12</span>
              <span className="text-xs text-secondary uppercase tracking-wider">Active Sessions</span>
            </div>
          </div>
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded-lg transition-all">
          <UserPlus size={14} />
          Invite User
        </button>
      </header>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 border-b border-default bg-surface">
          <Tabs.List className="flex gap-6">
            <Tabs.Trigger 
              value="users"
              className={cn(
                "h-10 text-[11px] font-bold uppercase tracking-wider transition-all relative outline-none",
                activeTab === 'users' ? "text-primary" : "text-secondary hover:text-primary"
              )}
            >
              Users
              {activeTab === 'users' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="settings"
              className={cn(
                "h-10 text-[11px] font-bold uppercase tracking-wider transition-all relative outline-none",
                activeTab === 'settings' ? "text-primary" : "text-secondary hover:text-primary"
              )}
            >
              Settings
              {activeTab === 'settings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="preview"
              className={cn(
                "h-10 text-[11px] font-bold uppercase tracking-wider transition-all relative outline-none",
                activeTab === 'preview' ? "text-primary" : "text-secondary hover:text-primary"
              )}
            >
              Login Page
              {activeTab === 'preview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="users" className="flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-default bg-page">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="text" 
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-default rounded-lg pl-9 pr-4 py-2 text-xs text-primary focus:outline-none focus:border-accent transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-default bg-surface/50 sticky top-0 z-10">
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">User</th>
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Role</th>
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Created</th>
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Last Login</th>
                  <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-default/50 hover:bg-surface/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full border border-default" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-primary truncate">{user.name}</span>
                          <span className="text-xs text-secondary truncate">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                        user.role === 'admin' ? "bg-accent/10 text-accent-hover" : "bg-elevated text-secondary"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-1.5 h-1.5 rounded-full", user.status === 'active' ? "bg-success" : "bg-error")} />
                        <span className="text-[11px] text-primary capitalize">{user.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-secondary">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-[11px] text-secondary">{formatTime(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all">
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[160px]">
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
                              onClick={() => banUser(user.id)}
                            >
                              <Ban size={14} /> {user.status === 'active' ? 'Ban User' : 'Unban User'}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none">
                              <Key size={14} /> Reset Password
                            </DropdownMenu.Item>
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
                              onClick={() => changeRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                            >
                              <UserCheck size={14} /> Change Role
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="h-[1px] bg-default my-1" />
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-error hover:bg-error hover:text-white rounded cursor-pointer outline-none"
                              onClick={() => deleteUser(user.id)}
                            >
                              <Trash2 size={14} /> Delete User
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
        </Tabs.Content>

        <Tabs.Content value="settings" className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Providers */}
            <section>
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Auth Providers</h3>
              <div className="space-y-3">
                {[
                  { id: 'email', label: 'Email & Password', icon: Mail, description: 'Standard login with email and password' },
                  { id: 'google', label: 'Google OAuth', icon: Chrome, description: 'Allow users to sign in with their Google account' },
                  { id: 'github', label: 'GitHub OAuth', icon: Github, description: 'Allow users to sign in with their GitHub account' },
                  { id: 'magicLink', label: 'Magic Link', icon: Link, description: 'Passwordless login via email link' },
                ].map(p => (
                  <div key={p.id} className="p-4 bg-surface border border-default rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-page border border-default flex items-center justify-center">
                        <p.icon size={20} className={cn(providers[p.id as keyof typeof providers] ? "text-accent-hover" : "text-tertiary")} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-primary">{p.label}</p>
                        <p className="text-xs text-secondary">{p.description}</p>
                      </div>
                    </div>
                    <Switch.Root 
                      checked={providers[p.id as keyof typeof providers]}
                      onCheckedChange={() => toggleProvider(p.id as keyof typeof providers)}
                      className={cn(
                        "w-8 h-4 rounded-full relative transition-colors outline-none",
                        providers[p.id as keyof typeof providers] ? "bg-accent" : "bg-default"
                      )}
                    >
                      <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                    </Switch.Root>
                  </div>
                ))}
              </div>
            </section>

            {/* Session Settings */}
            <section>
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Session & Security</h3>
              <div className="bg-surface border border-default rounded-xl p-4 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary">Session Timeout</p>
                    <p className="text-xs text-secondary">How long users stay logged in</p>
                  </div>
                  <select 
                    value={settings.sessionTimeout}
                    onChange={(e) => updateSettings({ sessionTimeout: e.target.value })}
                    className="bg-page border border-default rounded-lg px-3 py-1.5 text-[11px] text-primary outline-none focus:border-accent"
                  >
                    <option value="30min">30 Minutes</option>
                    <option value="1hr">1 Hour</option>
                    <option value="24hr">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary">Require Email Verification</p>
                    <p className="text-xs text-secondary">Users must verify email before accessing the app</p>
                  </div>
                  <Switch.Root 
                    checked={settings.requireEmailVerification}
                    onCheckedChange={(checked) => updateSettings({ requireEmailVerification: checked })}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors outline-none",
                      settings.requireEmailVerification ? "bg-accent" : "bg-default"
                    )}
                  >
                    <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary">Allow Public Sign-ups</p>
                    <p className="text-xs text-secondary">Anyone can create an account. Disable for invite-only.</p>
                  </div>
                  <Switch.Root 
                    checked={settings.allowSignUps}
                    onCheckedChange={(checked) => updateSettings({ allowSignUps: checked })}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors outline-none",
                      settings.allowSignUps ? "bg-accent" : "bg-default"
                    )}
                  >
                    <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                </div>
              </div>
            </section>

            {/* Redirects */}
            <section>
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Redirect URLs</h3>
              <div className="bg-surface border border-default rounded-xl p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-secondary uppercase mb-1.5">Login Success</label>
                  <input 
                    type="text" 
                    value={settings.redirects.success}
                    onChange={(e) => updateSettings({ redirects: { ...settings.redirects, success: e.target.value } })}
                    className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-secondary uppercase mb-1.5">Logout Redirect</label>
                  <input 
                    type="text" 
                    value={settings.redirects.logout}
                    onChange={(e) => updateSettings({ redirects: { ...settings.redirects, logout: e.target.value } })}
                    className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="preview" className="flex-1 overflow-hidden flex">
          {/* Customization Sidebar */}
          <div className="w-72 border-r border-default bg-surface p-6 space-y-8 overflow-y-auto custom-scrollbar">
            <section>
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Branding</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-secondary uppercase mb-1.5">App Title</label>
                  <input 
                    type="text" 
                    value={branding.titleText}
                    onChange={(e) => updateBranding({ titleText: e.target.value })}
                    className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-secondary uppercase mb-1.5">Accent Color</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={branding.accentColor}
                      onChange={(e) => updateBranding({ accentColor: e.target.value })}
                      className="w-8 h-8 rounded border border-default bg-transparent cursor-pointer"
                    />
                    <input 
                      type="text" 
                      value={branding.accentColor}
                      onChange={(e) => updateBranding({ accentColor: e.target.value })}
                      className="flex-1 bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="pt-4 border-t border-default">
              <button className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                <Layout size={14} />
                Customize Code
              </button>
              <p className="text-xs text-secondary text-center mt-3">
                Opens the login component in the editor for full control.
              </p>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 bg-page p-12 flex items-center justify-center overflow-auto">
            <div className="w-full max-w-sm bg-surface border border-default rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 text-center">
                <div 
                  className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: `${branding.accentColor}15`, border: `1px solid ${branding.accentColor}30` }}
                >
                  <UserCheck size={24} style={{ color: branding.accentColor }} />
                </div>
                <h3 className="text-lg font-bold text-primary mb-1">{branding.titleText}</h3>
                <p className="text-xs text-secondary">Sign in to continue to your account</p>
              </div>

              <div className="px-8 pb-8 space-y-4">
                {providers.google && (
                  <button className="w-full py-2 bg-elevated hover:bg-default border border-default text-primary text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2">
                    <Chrome size={14} />
                    Continue with Google
                  </button>
                )}
                {providers.github && (
                  <button className="w-full py-2 bg-elevated hover:bg-default border border-default text-primary text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2">
                    <Github size={14} />
                    Continue with GitHub
                  </button>
                )}

                {(providers.google || providers.github) && providers.email && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-[1px] bg-default" />
                    <span className="text-xs text-tertiary font-bold uppercase">or</span>
                    <div className="flex-1 h-[1px] bg-default" />
                  </div>
                )}

                {providers.email && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-secondary uppercase">Email Address</label>
                      <input 
                        type="email" 
                        placeholder="name@example.com"
                        disabled
                        className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary opacity-50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <label className="text-xs font-bold text-secondary uppercase">Password</label>
                        <span className="text-xs font-bold" style={{ color: branding.accentColor }}>Forgot?</span>
                      </div>
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        disabled
                        className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary opacity-50"
                      />
                    </div>
                    <button 
                      className="w-full py-2.5 text-white text-xs font-bold rounded-lg transition-all shadow-lg"
                      style={{ backgroundColor: branding.accentColor, boxShadow: `${branding.accentColor}20 0px 8px 16px` }}
                    >
                      Sign In
                    </button>
                  </div>
                )}

                {settings.allowSignUps && (
                  <p className="text-xs text-secondary text-center mt-4">
                    Don't have an account? <span className="font-bold" style={{ color: branding.accentColor }}>Sign up</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
