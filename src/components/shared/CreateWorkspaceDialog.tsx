import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Building2, Upload, Check } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const { createWorkspace, switchWorkspace, workspaces } = useWorkspaceStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      const generatedSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
    }
  }, [name]);

  const handleCreate = async () => {
    if (!name || !slug) return;

    // Validate slug uniqueness (mock)
    const isSlugTaken = workspaces.some(ws => ws.slug === slug);
    if (isSlugTaken) {
      toast.error('This slug is already taken.');
      return;
    }

    setIsCreating(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const newId = createWorkspace(name, slug);
    
    toast.success('Workspace created successfully!');
    setIsCreating(false);
    onOpenChange(false);
    setName('');
    setSlug('');
    setLogo(null);
    
    // Navigate home to refresh state
    window.location.href = '/';
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-page border border-default rounded-3xl p-6 shadow-2xl z-[101] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-bold text-primary flex items-center gap-2">
              <Building2 className="text-accent" size={24} />
              Create a new workspace
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-elevated rounded-full text-tertiary hover:text-primary transition-colors">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            {/* Logo Upload */}
            <div className="flex flex-col items-center gap-3">
              <div className={cn(
                "w-20 h-20 rounded-2xl border-2 border-dashed border-default flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-accent/50 transition-colors bg-surface overflow-hidden",
                logo && "border-solid border-accent"
              )}>
                {logo ? (
                  <img src={logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <>
                    <Upload size={20} className="text-tertiary" />
                    <span className="text-[10px] font-bold text-tertiary uppercase">Logo</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-tertiary uppercase font-bold tracking-wider">Optional (80x80)</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Workspace Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Workspace Slug</label>
                <div className="flex items-center bg-surface border border-default rounded-xl px-4 py-2.5 focus-within:border-accent transition-colors">
                  <span className="text-tertiary text-sm select-none">torsor.app/</span>
                  <input 
                    type="text" 
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    placeholder="acme"
                    className="flex-1 bg-transparent border-none outline-none text-primary text-sm ml-0.5"
                  />
                </div>
                <p className="text-[10px] text-tertiary ml-1">Lowercase, hyphens, and numbers only.</p>
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
                onClick={handleCreate}
                disabled={!name || !slug || isCreating}
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white rounded-xl font-bold shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                Create Workspace
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
