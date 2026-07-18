import React, { useState } from 'react';
import { SectionPreviewNotice } from '../shared/PreviewBanner';
import * as Separator from '@radix-ui/react-separator';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Building2, Upload, Trash2, ShieldAlert, ArrowRightLeft } from 'lucide-react';
import { useActiveWorkspace, useWorkspaceStore } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export function GeneralTab() {
  const activeWorkspace = useActiveWorkspace();
  const { updateWorkspace, deleteWorkspace } = useWorkspaceStore();
  
  const [name, setName] = useState(activeWorkspace?.name || '');
  const [slug, setSlug] = useState(activeWorkspace?.slug || '');
  const [description, setDescription] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const handleSave = () => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, { name, slug });
    toast.success('Workspace settings updated');
  };

  const handleDelete = () => {
    if (!activeWorkspace) return;
    if (deleteConfirm !== activeWorkspace.name) {
      toast.error('Workspace name does not match');
      return;
    }
    deleteWorkspace(activeWorkspace.id);
    toast.success('Workspace deleted');
    window.location.href = '/';
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <SectionPreviewNotice>Workspace settings aren&apos;t saved to a backend yet — changes here are local only.</SectionPreviewNotice>
      {/* Basic Info */}
      <div className="space-y-6">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-elevated border-2 border-default flex items-center justify-center text-tertiary overflow-hidden">
              {activeWorkspace?.logoUrl ? (
                <img src={activeWorkspace.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Building2 size={32} />
              )}
            </div>
            <button className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full text-white">
              <Upload size={20} />
            </button>
          </div>
          <div>
            <h3 className="text-sm font-medium text-primary">Workspace Logo</h3>
            <p className="text-xs text-secondary mt-1">Click to upload a new logo. Recommended size: 80x80px.</p>
          </div>
        </div>

        <div className="grid gap-4 max-w-xl">
          <div className="space-y-2">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Workspace Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
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
                className="flex-1 bg-transparent border-none outline-none text-primary text-sm ml-0.5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Description (Optional)</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A brief description of your workspace..."
              className="w-full bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          <button 
            onClick={handleSave}
            className="w-fit px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>

      <Separator.Root className="h-px bg-default" />

      {/* Danger Zone */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-error">
          <ShieldAlert size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Danger Zone</h3>
        </div>

        <div className="border-l-2 border-error/30 pl-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-primary">Transfer Ownership</div>
              <div className="text-xs text-secondary mt-1">Transfer this workspace to another member. You will lose owner permissions.</div>
            </div>
            <button className="px-4 py-2 bg-elevated border border-default rounded-xl text-sm font-medium text-primary hover:bg-surface transition-all flex items-center gap-2">
              <ArrowRightLeft size={16} />
              Transfer
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-primary">Delete Workspace</div>
              <div className="text-xs text-secondary mt-1">Permanently delete this workspace and all its data. This action cannot be undone.</div>
            </div>
            
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <button className="px-4 py-2 bg-error/10 text-error hover:bg-error/20 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
                  <Trash2 size={16} />
                  Delete Workspace
                </button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] animate-in fade-in duration-200" />
                <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-page border border-default rounded-xl p-6 shadow-2xl z-[201] animate-in zoom-in-95 fade-in duration-200">
                  <AlertDialog.Title className="text-xl font-bold text-primary">Are you absolutely sure?</AlertDialog.Title>
                  <AlertDialog.Description className="text-sm text-secondary mt-2">
                    This action cannot be undone. This will permanently delete the 
                    <span className="font-bold text-primary mx-1">{activeWorkspace?.name}</span> 
                    workspace and all associated projects, members, and data.
                  </AlertDialog.Description>
                  
                  <div className="mt-6 space-y-2">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Type <span className="text-primary">{activeWorkspace?.name}</span> to confirm</label>
                    <input 
                      type="text" 
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="w-full bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-error transition-colors"
                    />
                  </div>

                  <div className="flex gap-3 mt-6">
                    <AlertDialog.Cancel asChild>
                      <button className="flex-1 py-2.5 rounded-xl font-medium text-secondary hover:bg-elevated transition-colors">Cancel</button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button 
                        onClick={handleDelete}
                        disabled={deleteConfirm !== activeWorkspace?.name}
                        className="flex-1 py-2.5 bg-error hover:bg-error/90 disabled:opacity-50 text-white rounded-xl font-bold transition-all"
                      >
                        Delete Workspace
                      </button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        </div>
      </div>
    </div>
  );
}
