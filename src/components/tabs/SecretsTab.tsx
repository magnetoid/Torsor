import React, { useState, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  Lock as LockIcon, 
  Eye, 
  EyeOff, 
  Copy, 
  MoreVertical, 
  Plus, 
  Trash2, 
  Edit2, 
  Check,
  FileJson,
  FileCode,
  Save,
  X
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useSecretsStore, Secret, useActiveSecrets } from '../../stores/secretsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';

export default function SecretsTab() {
  const { addSecret, updateSecret, deleteSecret, bulkUpdate } = useSecretsStore();
  const { activeWorkspaceId } = useWorkspaceStore();
  const secrets = useActiveSecrets();
  const [activeTab, setActiveTab] = useState<'app' | 'account'>('app');
  const [editMode, setEditMode] = useState<'list' | 'json' | 'env'>('list');
  const [editorValue, setEditorValue] = useState('');
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  
  // Add Secret Form State
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  
  const filteredSecrets = secrets.filter(s => s.type === activeTab);

  const toggleVisibility = (id: string) => {
    setVisibleSecrets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    // In a real app, we'd show a toast here
  };

  const handleAddSecret = () => {
    if (!newKey || !newValue) return;
    
    // Validation: no spaces, uppercase with underscores
    const sanitizedKey = newKey.trim().toUpperCase().replace(/\s+/g, '_');
    addSecret(sanitizedKey, newValue, activeTab);
    setNewKey('');
    setNewValue('');
  };

  const handleJsonEdit = () => {
    setEditorValue(JSON.stringify(secrets, null, 2));
    setEditMode('json');
  };

  const handleEnvEdit = () => {
    const envString = secrets
      .filter(s => s.type === 'app')
      .map(s => `${s.key}=${s.value}`)
      .join('\n');
    setEditorValue(envString);
    setEditMode('env');
  };

  const handleSaveEditor = () => {
    try {
      if (editMode === 'json') {
        const parsed = JSON.parse(editorValue);
        if (Array.isArray(parsed)) {
          // Ensure workspaceId is set for all parsed secrets
          const updatedParsed = parsed.map(s => ({
            ...s,
            workspaceId: s.workspaceId || activeWorkspaceId
          }));
          bulkUpdate(updatedParsed);
        }
      } else if (editMode === 'env') {
        const lines = editorValue.split('\n');
        const newSecrets: Secret[] = lines
          .filter(line => line.includes('=') && !line.startsWith('#'))
          .map(line => {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=');
            const existing = secrets.find(s => s.key === key.trim());
            return {
              id: existing?.id || Math.random().toString(36).substring(7),
              workspaceId: activeWorkspaceId,
              key: key.trim(),
              value: value.trim(),
              type: existing?.type || 'app',
              inUse: existing?.inUse || false
            };
          });
        
        // Merge with account secrets which aren't in .env
        const accountSecrets = secrets.filter(s => s.type === 'account');
        bulkUpdate([...newSecrets, ...accountSecrets]);
      }
      setEditMode('list');
    } catch (e) {
      console.error('Failed to save secrets:', e);
    }
  };

  if (editMode !== 'list') {
    return (
      <div className="flex flex-col h-full bg-page">
        <div className="h-10 px-4 flex items-center justify-between border-b border-default bg-surface">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            {editMode === 'json' ? <FileJson size={14} /> : <FileCode size={14} />}
            <span>Editing Secrets as {editMode.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setEditMode('list')}
              className="px-2 py-1 text-[10px] text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveEditor}
              className="flex items-center gap-1.5 px-3 py-1 bg-accent hover:bg-accent-hover text-white text-[10px] font-bold rounded-md transition-colors"
            >
              <Save size={12} />
              Save Changes
            </button>
          </div>
        </div>
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage={editMode === 'json' ? 'json' : 'ini'}
            theme="vs-dark"
            value={editorValue}
            onChange={(val) => setEditorValue(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16 }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <LockIcon size={14} className="text-accent-hover" />
          <span className="text-xs font-bold text-primary">Secrets</span>
        </div>

        <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex">
          <Tabs.List className="flex bg-page p-0.5 rounded-lg border border-default">
            <Tabs.Trigger 
              value="app"
              className="px-3 py-1 text-[10px] font-bold rounded-md transition-all data-[state=active]:bg-elevated data-[state=active]:text-primary text-secondary hover:text-primary"
            >
              App Secrets
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="account"
              className="px-3 py-1 text-[10px] font-bold rounded-md transition-all data-[state=active]:bg-elevated data-[state=active]:text-primary text-secondary hover:text-primary"
            >
              Account Secrets
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>

        <div className="flex items-center gap-3">
          <button onClick={handleJsonEdit} className="text-[10px] text-secondary hover:text-primary transition-colors">
            Edit as JSON
          </button>
          <button onClick={handleEnvEdit} className="text-[10px] text-secondary hover:text-primary transition-colors">
            Edit as .env
          </button>
        </div>
      </div>

      {/* Secrets List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {filteredSecrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
            <LockIcon size={32} className="opacity-20" />
            <p className="text-sm">No {activeTab} secrets found</p>
          </div>
        ) : (
          filteredSecrets.map((secret) => (
            <div 
              key={secret.id}
              className="bg-surface border border-default rounded-lg p-3 mb-2 flex items-center gap-3 group hover:border-subtle transition-all"
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                secret.inUse ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-default"
              )} />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-primary truncate cursor-pointer hover:text-accent-hover transition-colors">
                    {secret.key}
                  </span>
                </div>
                <div className="text-sm font-mono text-secondary mt-0.5 truncate">
                  {visibleSecrets[secret.id] ? secret.value : '••••••••••••••••'}
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => toggleVisibility(secret.id)}
                  className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
                  title={visibleSecrets[secret.id] ? "Hide value" : "Show value"}
                >
                  {visibleSecrets[secret.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button 
                  onClick={() => copyToClipboard(secret.value)}
                  className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
                  title="Copy to clipboard"
                >
                  <Copy size={14} />
                </button>
                
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all">
                      <MoreVertical size={14} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[120px] animate-in fade-in zoom-in-95 duration-100">
                      <DropdownMenu.Item className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none">
                        <Edit2 size={14} /> Edit
                      </DropdownMenu.Item>
                      <DropdownMenu.Item 
                        onClick={() => deleteSecret(secret.id)}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500 hover:text-white rounded cursor-pointer outline-none"
                      >
                        <Trash2 size={14} /> Delete
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Secret Form */}
      <div className="p-4 border-t border-default bg-surface sticky bottom-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-page border border-default rounded-lg px-3 py-2 focus-within:border-accent/50 transition-all">
            <input 
              type="text" 
              placeholder="KEY_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-mono text-primary w-1/3 placeholder:text-tertiary"
            />
            <div className="w-[1px] h-4 bg-default" />
            <input 
              type="password" 
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-mono text-primary flex-1 placeholder:text-tertiary"
            />
          </div>
          <button 
            onClick={handleAddSecret}
            disabled={!newKey || !newValue}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white text-sm font-bold rounded-lg transition-all shrink-0"
          >
            <Plus size={16} />
            Add Secret
          </button>
        </div>
        <p className="text-[10px] text-secondary mt-2 ml-1">
          Keys are automatically converted to UPPERCASE_WITH_UNDERSCORES
        </p>
      </div>
    </div>
  );
}
