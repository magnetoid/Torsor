import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { 
  X, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileCode, 
  FileJson, 
  FileType, 
  FileText, 
  FolderOpen,
  MoreVertical,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Search,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useAppStore, FileNode } from '../../useAppStore';
import { useEditorStore } from '../../stores/editorStore';
import { cn } from '../../lib/utils';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as ContextMenu from '@radix-ui/react-context-menu';

// --- File Tree Component ---

const FileIcon = ({ name, extension }: { name: string; extension?: string }) => {
  switch (extension) {
    case 'tsx': return <FileCode size={14} className="text-accent-hover" />;
    case 'ts': return <FileCode size={14} className="text-info" />;
    case 'css': return <FileType size={14} className="text-warning" />;
    case 'json': return <FileJson size={14} className="text-gray-400" />;
    case 'py': return <FileCode size={14} className="text-success" />;
    default: return <FileText size={14} className="text-zinc-500" />;
  }
};

const FileTreeItem = ({ node, level, onSelect }: { node: FileNode; level: number; onSelect: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(true);
  const { files, createFile, deleteFile, renameFile, duplicateFile } = useAppStore();
  const activeFileId = useEditorStore(state => state.activeFileId);
  const children = files.filter(f => f.parentId === node.id);
  const isSelected = activeFileId === node.id;

  const handleCreateFile = () => {
    const name = prompt('Enter file name:');
    if (name) createFile(name, 'file', node.id);
  };

  const handleCreateFolder = () => {
    const name = prompt('Enter folder name:');
    if (name) createFile(name, 'folder', node.id);
  };

  const handleRename = () => {
    const name = prompt('Enter new name:', node.name);
    if (name) renameFile(node.id, name);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${node.name}?`)) {
      deleteFile(node.id);
    }
  };

  const handleDuplicate = () => {
    duplicateFile(node.id);
  };

  if (node.type === 'folder') {
    return (
      <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            <Collapsible.Trigger asChild>
              <div 
                className="flex items-center gap-1.5 py-1 px-2 hover:bg-elevated cursor-pointer group select-none"
                style={{ paddingLeft: `${level * 12 + 8}px` }}
              >
                <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div className="text-accent-hover/80">
                  {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
                </div>
                <span className="text-xs text-zinc-300 font-medium">{node.name}</span>
              </div>
            </Collapsible.Trigger>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl min-w-[160px] z-[100]">
              <ContextMenu.Item 
                onClick={handleCreateFile}
                className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
              >
                <Plus size={12} /> New File
              </ContextMenu.Item>
              <ContextMenu.Item 
                onClick={handleCreateFolder}
                className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
              >
                <Folder size={12} /> New Folder
              </ContextMenu.Item>
              <ContextMenu.Item 
                onClick={handleRename}
                className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
              >
                <Edit2 size={12} /> Rename
              </ContextMenu.Item>
              <ContextMenu.Separator className="h-[1px] bg-default my-1" />
              <ContextMenu.Item 
                onClick={handleDelete}
                className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-error/20 hover:text-error rounded-sm flex items-center gap-2"
              >
                <Trash2 size={12} /> Delete
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        <Collapsible.Content>
          {children.map(child => (
            <FileTreeItem key={child.id} node={child} level={level + 1} onSelect={onSelect} />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div 
          onClick={() => onSelect(node.id)}
          className={cn(
            "flex items-center gap-2 py-1 px-2 hover:bg-elevated cursor-pointer group select-none border-l-2 transition-all",
            isSelected ? "bg-elevated border-accent" : "border-transparent"
          )}
          style={{ paddingLeft: `${level * 12 + 20}px` }}
        >
          <FileIcon name={node.name} extension={node.extension} />
          <span className={cn("text-xs transition-colors", isSelected ? "text-white font-medium" : "text-zinc-400 group-hover:text-zinc-200")}>
            {node.name}
          </span>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl min-w-[160px] z-[100]">
          <ContextMenu.Item 
            onClick={handleRename}
            className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
          >
            <Edit2 size={12} /> Rename
          </ContextMenu.Item>
          <ContextMenu.Item 
            onClick={handleDuplicate}
            className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
          >
            <Copy size={12} /> Duplicate
          </ContextMenu.Item>
          <ContextMenu.Item 
            onClick={() => {
              navigator.clipboard.writeText(node.name);
              // In a real app we'd compute full path
            }}
            className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-accent/20 hover:text-accent-hover rounded-sm flex items-center gap-2"
          >
            <Search size={12} /> Copy Path
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-[1px] bg-default my-1" />
          <ContextMenu.Item 
            onClick={handleDelete}
            className="text-xs text-zinc-300 px-2 py-1.5 outline-none cursor-pointer hover:bg-error/20 hover:text-error rounded-sm flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

// --- Main CodePanel Component ---

export const CodePanel: React.FC = () => {
  const { files, updateFileContent, createFile, deleteFile, renameFile, duplicateFile, simulateBuilderFlow } = useAppStore();
  const { 
    isCodeOpen, 
    openFileIds, 
    activeFileId, 
    isSidebarOpen, 
    toggleCode, 
    openFile, 
    closeFile, 
    setActiveFile, 
    toggleSidebar,
    setUnsaved,
    unsavedChanges
  } = useEditorStore();

  const editorRef = useRef<any>(null);
  const activeFile = files.find(f => f.id === activeFileId);
  const rootFiles = files.filter(f => !f.parentId);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Define Tesseract Dark Theme
    monaco.editor.defineTheme('tesseract-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6b6b7a', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7c6ff7' },
        { token: 'string', foreground: '10b981' },
        { token: 'number', foreground: 'f59e0b' },
      ],
      colors: {
        'editor.background': '#202023',
        'editor.foreground': '#F6F6F8',
        'editor.lineHighlightBackground': '#303034',
        'editorCursor.foreground': '#8577F2',
        'editorIndentGuide.background': '#3B3B41',
        'editorLineNumber.foreground': '#6D6D74',
        'editor.selectionBackground': '#8577F233',
      }
    });
    monaco.editor.setTheme('tesseract-dark');

    // Add Context Menu Actions
    editor.addAction({
      id: 'ask-tesseract',
      label: 'Ask Tesseract Agent',
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const selection = ed.getModel()?.getValueInRange(ed.getSelection()!);
        if (selection) {
          simulateBuilderFlow(`Regarding this code:\n\n\`\`\`\n${selection}\n\`\`\`\n\nCan you help me with this?`);
        }
      }
    });

    editor.addAction({
      id: 'fix-this',
      label: 'Fix this',
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const selection = ed.getModel()?.getValueInRange(ed.getSelection()!);
        if (selection) {
          simulateBuilderFlow(`Fix the following code:\n\n\`\`\`\n${selection}\n\`\`\``);
        }
      }
    });

    editor.addAction({
      id: 'explain-code',
      label: 'Explain',
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const selection = ed.getModel()?.getValueInRange(ed.getSelection()!);
        if (selection) {
          simulateBuilderFlow(`Explain how this code works:\n\n\`\`\`\n${selection}\n\`\`\``);
        }
      }
    });

    editor.addAction({
      id: 'refactor-code',
      label: 'Refactor',
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const selection = ed.getModel()?.getValueInRange(ed.getSelection()!);
        if (selection) {
          simulateBuilderFlow(`Refactor this code for better performance and readability:\n\n\`\`\`\n${selection}\n\`\`\``);
        }
      }
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      updateFileContent(activeFileId, value);
      setUnsaved(activeFileId, true);
    }
  };

  const getBreadcrumbs = (fileId: string): string[] => {
    const path: string[] = [];
    let current = files.find(f => f.id === fileId);
    while (current) {
      path.unshift(current.name);
      current = files.find(f => f.id === current?.parentId);
    }
    return path;
  };

  if (!isCodeOpen) return null;

  return (
    <div className="flex flex-1 h-full bg-page border-x border-subtle overflow-hidden animate-in slide-in-from-right-full duration-200">
      
      {/* File Tree Sidebar */}
      {isSidebarOpen && (
        <div className="w-48 border-r border-subtle flex flex-col bg-inset">
          <div className="h-9 flex items-center px-3 border-b border-subtle justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Explorer</span>
            <button onClick={() => toggleSidebar()} className="text-zinc-500 hover:text-zinc-300">
              <PanelLeftClose size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {rootFiles.map(file => (
              <FileTreeItem key={file.id} node={file} level={0} onSelect={openFile} />
            ))}
          </div>
        </div>
      )}

      {/* Editor Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Tab Bar */}
        <div className="h-9 bg-surface flex items-center overflow-x-auto no-scrollbar border-b border-subtle">
          {!isSidebarOpen && (
            <button onClick={() => toggleSidebar()} className="px-3 text-zinc-500 hover:text-zinc-300 border-r border-subtle h-full">
              <PanelLeftOpen size={14} />
            </button>
          )}
          {openFileIds.map(id => {
            const file = files.find(f => f.id === id);
            if (!file) return null;
            const isActive = activeFileId === id;
            const isUnsaved = unsavedChanges.includes(id);

            return (
              <div 
                key={id}
                onClick={() => setActiveFile(id)}
                className={cn(
                  "flex items-center gap-2 px-3 h-full text-xs cursor-pointer border-r border-subtle transition-colors min-w-[120px] max-w-[200px]",
                  isActive ? "bg-page text-primary" : "text-secondary hover:bg-elevated"
                )}
              >
                <FileIcon name={file.name} extension={file.extension} />
                <span className="truncate flex-1">{file.name}</span>
                {isUnsaved ? (
                  <div className="w-2 h-2 rounded-full bg-accent" />
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); closeFile(id); }}
                    className="opacity-0 group-hover:opacity-100 hover:bg-zinc-800 p-0.5 rounded"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Breadcrumb */}
        <div className="h-6 px-3 flex items-center gap-1 text-[10px] text-tertiary bg-page border-b border-subtle">
          {activeFileId && getBreadcrumbs(activeFileId).map((part, i, arr) => (
            <React.Fragment key={i}>
              <span className="hover:text-zinc-400 cursor-pointer">{part}</span>
              {i < arr.length - 1 && <ChevronRight size={10} />}
            </React.Fragment>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 bg-page">
          {activeFile ? (
            <Editor
              height="100%"
              language={activeFile.extension === 'tsx' ? 'typescript' : activeFile.extension === 'ts' ? 'typescript' : activeFile.extension}
              value={activeFile.content}
              theme="tesseract-dark"
              onMount={handleEditorMount}
              onChange={handleEditorChange}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                folding: true,
                bracketPairColorization: { enabled: true },
                cursorStyle: 'line',
                cursorBlinking: 'blink',
                padding: { top: 10 },
                smoothScrolling: true,
                contextmenu: true,
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
              <FileCode size={48} strokeWidth={1} />
              <p className="text-sm">Select a file to view or edit code</p>
            </div>
          )}
        </div>

        {/* Bottom Status */}
        <div className="h-6 bg-page border-t border-subtle px-3 flex items-center justify-between text-[10px] text-tertiary">
          <div className="flex items-center gap-4">
            <span>Ln 1, Col 1</span>
            <span className="uppercase">{activeFile?.extension || 'Plain Text'}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeFileId && unsavedChanges.includes(activeFileId) ? (
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                Unsaved changes
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
