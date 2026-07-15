import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, UserPlus, Mail, Shield, Check, Plus } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMembersDialog({ open, onOpenChange }: InviteMembersDialogProps) {
  const { inviteMember } = useWorkspaceStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'developer' | 'viewer'>('developer');
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = async () => {
    if (!email) return;

    // Simple email validation
    if (!email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setIsInviting(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 600));

    inviteMember(email, role);
    
    toast.success(`Invite sent to ${email}!`);
    setIsInviting(false);
    setEmail('');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-page border border-default rounded-3xl p-6 shadow-2xl z-[101] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-bold text-primary flex items-center gap-2">
              <UserPlus className="text-accent" size={24} />
              Invite members
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-elevated rounded-full text-tertiary hover:text-primary transition-colors">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={16} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full bg-surface border border-default rounded-xl pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'developer', 'viewer'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                        role === r 
                          ? "bg-accent-muted border-accent text-accent" 
                          : "bg-surface border-default text-secondary hover:border-subtle"
                      )}
                    >
                      <Shield size={16} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">{r}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-tertiary mt-2 ml-1">
                  {role === 'admin' && 'Admins can manage settings and members.'}
                  {role === 'developer' && 'Developers can create and edit projects.'}
                  {role === 'viewer' && 'Viewers can only see projects and activity.'}
                </p>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button 
                onClick={() => onOpenChange(false)}
                className="flex-1 py-2.5 rounded-xl font-medium text-secondary hover:bg-elevated transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleInvite}
                disabled={!email || isInviting}
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white rounded-xl font-bold shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2"
              >
                {isInviting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                Send Invite
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
