import React, { useState, useMemo } from 'react';
import { 
  GitBranch, 
  Plus, 
  ChevronDown, 
  Check, 
  X, 
  ArrowUp, 
  ArrowDown, 
  PlusCircle, 
  MinusCircle, 
  Circle, 
  History, 
  Github, 
  ExternalLink, 
  RotateCcw, 
  Send, 
  MoreVertical, 
  Search,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  CheckCircle2,
  Loader2,
  ArrowRightLeft
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGitStore, GitFile, Commit } from '../../stores/gitStore';
import * as Select from '@radix-ui/react-select';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import * as Switch from '@radix-ui/react-switch';

const FileStatusIcon = ({ status }: { status: GitFile['status'] }) => {
  switch (status) {
    case 'added': return <FilePlus size={14} className="text-success" />;
    case 'deleted': return <FileMinus size={14} className="text-error" />;
    case 'modified': return <FileEdit size={14} className="text-warning" />;
    case 'untracked': return <PlusCircle size={14} className="text-success" />;
    default: return <FileCode size={14} className="text-secondary" />;
  }
};

const DiffIndicator = ({ additions, deletions }: { additions: number; deletions: number }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-bold">
    {additions > 0 && <span className="text-success">+{additions}</span>}
    {deletions > 0 && <span className="text-error">-{deletions}</span>}
  </div>
);

export default function GitTab() {
  const { 
    currentBranch, 
    branches, 
    switchBranch, 
    createBranch, 
    ahead, 
    behind, 
    changes, 
    history, 
    isGitHubConnected, 
    remoteUrl, 
    autoCommitEnabled, 
    toggleAutoCommit, 
    toggleStage, 
    stageAll, 
    unstageAll, 
    commit, 
    push, 
    pull, 
    revert,
    connectGitHub
  } = useGitStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [newBranchMode, setNewBranchMode] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const staged = useMemo(() => changes.filter(f => f.staged), [changes]);
  const unstaged = useMemo(() => changes.filter(f => !f.staged), [changes]);

  const handleCommit = (doPush = false) => {
    if (!commitMessage.trim() || staged.length === 0) return;
    commit(commitMessage, doPush);
    setCommitMessage('');
    setAmend(false);
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBranchName) {
      createBranch(newBranchName);
      setNewBranchName('');
      setNewBranchMode(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header / Status */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-subtle bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-accent-hover" />
            
            {newBranchMode ? (
              <form onSubmit={handleCreateBranch} className="flex items-center gap-2">
                <input 
                  autoFocus
                  type="text" 
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="Branch name..."
                  className="bg-page border border-accent/50 rounded px-2 py-0.5 text-xs text-primary outline-none"
                />
                <button type="submit" className="p-1 text-success hover:bg-success/10 rounded">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setNewBranchMode(false)} className="p-1 text-error hover:bg-error/10 rounded">
                  <X size={14} />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <Select.Root value={currentBranch} onValueChange={switchBranch}>
                  <Select.Trigger className="flex items-center gap-2 px-2 py-1 bg-elevated hover:bg-subtle border border-subtle rounded-lg text-xs font-bold text-primary outline-none transition-all">
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown size={14} className="text-secondary" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="bg-elevated border border-subtle rounded-xl shadow-2xl overflow-hidden z-50">
                      <Select.Viewport className="p-1">
                        {branches.map(branch => (
                          <Select.Item 
                            key={branch} 
                            value={branch}
                            className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent-hover outline-none cursor-pointer rounded-lg"
                          >
                            <Select.ItemText>{branch}</Select.ItemText>
                            <Select.ItemIndicator>
                              <Check size={12} />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <button 
                  onClick={() => setNewBranchMode(true)}
                  className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-secondary">
            <div className="flex items-center gap-1">
              <ArrowUp size={12} className="text-success" />
              <span>{ahead} ahead</span>
            </div>
            <div className="flex items-center gap-1">
              <ArrowDown size={12} className="text-warning" />
              <span>{behind} behind</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={pull}
            className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-subtle border border-subtle text-primary text-[11px] font-bold rounded-lg transition-all"
          >
            <ArrowDown size={14} />
            Pull
          </button>
          <button 
            onClick={push}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded-lg transition-all"
          >
            <ArrowUp size={14} />
            Push
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Changes & History */}
        <div className="w-[380px] border-r border-subtle flex flex-col bg-page">
          <ScrollArea.Root className="flex-1">
            <ScrollArea.Viewport className="h-full">
              <div className="p-4 space-y-6">
                {/* Changes */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-secondary uppercase tracking-wider">Changes</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={stageAll}
                        className="text-[10px] font-bold text-accent-hover hover:text-accent transition-colors"
                      >
                        Stage All
                      </button>
                    </div>
                  </div>

                  {/* Staged */}
                  {staged.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between px-1 mb-1">
                        <span className="text-[10px] font-bold text-success uppercase tracking-wider">Staged ({staged.length})</span>
                        <button onClick={unstageAll} className="text-[10px] text-secondary hover:text-primary">Unstage All</button>
                      </div>
                      {staged.map(file => (
                        <div 
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all group",
                            selectedFile === file.path ? "bg-elevated" : "hover:bg-surface"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox.Root 
                              checked={file.staged}
                              onCheckedChange={() => toggleStage(file.path)}
                              className="w-4 h-4 bg-page border border-success rounded flex items-center justify-center outline-none"
                            >
                              <Checkbox.Indicator>
                                <Check size={12} className="text-success" />
                              </Checkbox.Indicator>
                            </Checkbox.Root>
                            <FileStatusIcon status={file.status} />
                            <span className="text-xs text-primary truncate">{file.path.split('/').pop()}</span>
                          </div>
                          <DiffIndicator additions={file.additions} deletions={file.deletions} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unstaged */}
                  {unstaged.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between px-1 mb-1">
                        <span className="text-[10px] font-bold text-warning uppercase tracking-wider">Unstaged ({unstaged.length})</span>
                      </div>
                      {unstaged.map(file => (
                        <div 
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all group",
                            selectedFile === file.path ? "bg-elevated" : "hover:bg-surface"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox.Root 
                              checked={file.staged}
                              onCheckedChange={() => toggleStage(file.path)}
                              className="w-4 h-4 bg-page border border-subtle rounded flex items-center justify-center outline-none"
                            >
                              <Checkbox.Indicator>
                                <Check size={12} className="text-accent-hover" />
                              </Checkbox.Indicator>
                            </Checkbox.Root>
                            <FileStatusIcon status={file.status} />
                            <span className="text-xs text-primary truncate">{file.path.split('/').pop()}</span>
                          </div>
                          <DiffIndicator additions={file.additions} deletions={file.deletions} />
                        </div>
                      ))}
                    </div>
                  )}

                  {changes.length === 0 && (
                    <div className="py-8 text-center">
                      <CheckCircle2 size={24} className="text-success/20 mx-auto mb-2" />
                      <p className="text-xs text-secondary">No changes to commit</p>
                    </div>
                  )}
                </section>

                <Separator.Root className="h-[1px] bg-subtle" />

                {/* Commit Form */}
                <section className="space-y-4">
                  <div className="space-y-2">
                    <textarea 
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Describe your changes..."
                      className="w-full bg-surface border border-subtle rounded-xl p-3 text-xs text-primary outline-none focus:border-accent min-h-[80px] resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox.Root 
                        id="amend"
                        checked={amend}
                        onCheckedChange={(c) => setAmend(c === true)}
                        className="w-4 h-4 bg-page border border-subtle rounded flex items-center justify-center outline-none"
                      >
                        <Checkbox.Indicator>
                          <Check size={12} className="text-accent-hover" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <label htmlFor="amend" className="text-[11px] text-secondary cursor-pointer">Amend last commit</label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleCommit(false)}
                      disabled={!commitMessage.trim() || staged.length === 0}
                      className="flex-1 py-2 bg-elevated hover:bg-subtle border border-subtle text-primary text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
                    >
                      Commit
                    </button>
                    <button 
                      onClick={() => handleCommit(true)}
                      disabled={!commitMessage.trim() || staged.length === 0}
                      className="flex-[1.5] py-2 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Send size={14} />
                      Commit & Push
                    </button>
                  </div>
                </section>

                <Separator.Root className="h-[1px] bg-subtle" />

                {/* History */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-secondary uppercase tracking-wider">History</h3>
                    <History size={14} className="text-tertiary" />
                  </div>
                  <div className="space-y-4 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-subtle">
                    {history.map(c => (
                      <div key={c.hash} className="relative pl-6 group">
                        <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-page border-2 border-subtle group-hover:border-accent transition-colors z-10" />
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-accent-hover">{c.hash}</span>
                            <span className="text-[10px] text-secondary">{new Date(c.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-primary font-medium line-clamp-2">{c.message}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-secondary">{c.author}</span>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => revert(c.hash)} className="text-[10px] text-error hover:underline">Revert</button>
                              <button className="text-[10px] text-accent-hover hover:underline">Diff</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Remote */}
                <Separator.Root className="h-[1px] bg-subtle" />
                <section className="space-y-4">
                  <h3 className="text-[10px] font-bold text-secondary uppercase tracking-wider">Remote</h3>
                  {isGitHubConnected ? (
                    <div className="bg-surface border border-subtle rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <Github size={16} className="text-primary" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] font-bold text-primary">GitHub</span>
                          <span className="text-[10px] text-secondary truncate">{remoteUrl}</span>
                        </div>
                      </div>
                      <button className="w-full py-1.5 bg-elevated hover:bg-subtle border border-subtle text-primary text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-2">
                        <ExternalLink size={12} />
                        Create Pull Request
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={connectGitHub}
                      className="w-full py-2 bg-elevated hover:bg-subtle border border-subtle text-primary text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Github size={16} />
                      Connect to GitHub
                    </button>
                  )}
                  
                  <div className="flex items-center justify-between px-1">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-primary">Agent Auto-commits</span>
                      <span className="text-[10px] text-secondary">Commit after each plan</span>
                    </div>
                    <Switch.Root 
                      checked={autoCommitEnabled}
                      onCheckedChange={toggleAutoCommit}
                      className={cn(
                        "w-8 h-4 rounded-full relative transition-colors outline-none",
                        autoCommitEnabled ? "bg-accent" : "bg-subtle"
                      )}
                    >
                      <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                    </Switch.Root>
                  </div>
                </section>
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-0.5">
              <ScrollArea.Thumb className="bg-subtle rounded-full" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        {/* Right: Diff View */}
        <div className="flex-1 bg-page flex flex-col">
          {selectedFile ? (
            <>
              <div className="h-9 px-4 flex items-center justify-between border-b border-subtle bg-surface">
                <div className="flex items-center gap-2">
                  <FileCode size={14} className="text-secondary" />
                  <span className="text-[11px] font-bold text-primary">{selectedFile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all">
                    <ArrowRightLeft size={14} />
                  </button>
                  <button onClick={() => setSelectedFile(null)} className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto font-mono text-[12px] leading-relaxed p-4 custom-scrollbar">
                <div className="space-y-0.5">
                  <div className="text-secondary mb-2">@@ -12,4 +12,12 @@</div>
                  <div className="px-2 py-0.5 hover:bg-elevated transition-colors">{"  import React from 'react';"}</div>
                  <div className="px-2 py-0.5 hover:bg-elevated transition-colors">{"  import { cn } from '../../lib/utils';"}</div>
                  <div className="px-2 py-0.5 bg-error/10 text-error border-l-2 border-error">{"- const oldFunction = () => {"}</div>
                  <div className="px-2 py-0.5 bg-error/10 text-error border-l-2 border-error">{"-   return 'old';"}</div>
                  <div className="px-2 py-0.5 bg-error/10 text-error border-l-2 border-error">{"- };"}</div>
                  <div className="px-2 py-0.5 bg-success/10 text-success border-l-2 border-success">{"+ const newFunction = (id: string) => {"}</div>
                  <div className="px-2 py-0.5 bg-success/10 text-success border-l-2 border-success">{"+   const data = useData(id);"}</div>
                  <div className="px-2 py-0.5 bg-success/10 text-success border-l-2 border-success">{"+   return data.value;"}</div>
                  <div className="px-2 py-0.5 bg-success/10 text-success border-l-2 border-success">{"+ };"}</div>
                  <div className="px-2 py-0.5 hover:bg-elevated transition-colors">{"  "}</div>
                  <div className="px-2 py-0.5 hover:bg-elevated transition-colors">{"  export default function Component() {"}</div>
                  <div className="px-2 py-0.5 bg-success/10 text-success border-l-2 border-success">{"+   const [state, setState] = useState(null);"}</div>
                  <div className="px-2 py-0.5 hover:bg-elevated transition-colors">{"    return ("}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-tertiary">
              <GitBranch size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Select a file to view changes</p>
              <p className="text-xs mt-1">Changes are compared against {currentBranch}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
