import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { 
  Plus, 
  FolderPlus, 
  FilePlus, 
  Upload, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileCode, 
  FileJson, 
  FileText, 
  Hash, 
  Code2,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Files
} from 'lucide-react';
import { useAppStore, FileNode } from '../../useAppStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useProjectStore } from '../../stores/projectStore';
import { cn } from '../../lib/utils';
import { EmptyState } from '../shared/EmptyState';
import { Folder as FolderIcon } from 'lucide-react';

export default function FileTree() {
  const { files, createFile, deleteFile, renameFile, duplicateFile, loadFileContent } = useAppStore();
  const { openFile } = useEditorStore();
  const { openTab } = useLayoutStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleFileClick = (file: FileNode) => {
    if (file.type === 'file') {
      openFile(file.id);
      openTab('code');
      // Lazily pull the file's real content from the workspace on first open (the tree is
      // loaded without contents). The file id is its workspace path.
      if (activeProjectId && !file.content) {
        void loadFileContent(activeProjectId, file.id);
      }
    } else {
      toggleFolder(file.id);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop();
    switch (ext) {
      case 'tsx': return <FileCode size={14} className="text-accent" />;
      case 'ts': return <Code2 size={14} className="text-info" />;
      case 'css': return <Hash size={14} className="text-warning" />;
      case 'json': return <FileJson size={14} className="text-tertiary" />;
      case 'md': return <FileText size={14} className="text-success" />;
      default: return <FileText size={14} className="text-secondary" />;
    }
  };

  const renderTree = (parentId: string | null = null, level = 0) => {
    const items = files.filter(f => f.parentId === parentId).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return items.map((item) => {
      const isExpanded = expandedFolders.includes(item.id);
      const timestamp = parseInt(item.id.split('-')[1]);
      const isNew = !isNaN(timestamp) && Date.now() - timestamp < 10000; // 10 seconds

      return (
        <div key={item.id}>
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div 
                onClick={() => handleFileClick(item)}
                className={cn(
                  "h-7 flex items-center gap-1.5 px-2 hover:bg-elevated cursor-pointer group transition-all rounded-md mx-1",
                  isNew && "animate-pulse border border-accent/50 bg-accent/5"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
              >
                {item.type === 'folder' ? (
                  <>
                    <div className="w-4 h-4 flex items-center justify-center text-tertiary">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                    <Folder size={14} className={cn("shrink-0", isExpanded ? "text-accent" : "text-secondary")} />
                  </>
                ) : (
                  <>
                    <div className="w-4" />
                    {getFileIcon(item.name)}
                  </>
                )}
                <span className="text-[11px] text-primary truncate flex-1">{item.name}</span>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="min-w-[160px] bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50">
                <ContextMenu.Item 
                  onClick={() => openFile(item.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
                >
                  <FileCode size={12} />
                  Open in Editor
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-[1px] bg-subtle my-1" />
                <ContextMenu.Item 
                  onClick={() => renameFile(item.id, item.name + ' (copy)')}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
                >
                  <Pencil size={12} />
                  Rename
                </ContextMenu.Item>
                <ContextMenu.Item 
                  onClick={() => duplicateFile(item.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
                >
                  <Files size={12} />
                  Duplicate
                </ContextMenu.Item>
                <ContextMenu.Item 
                  onClick={() => navigator.clipboard.writeText(item.name)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
                >
                  <Copy size={12} />
                  Copy Path
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-[1px] bg-subtle my-1" />
                <ContextMenu.Item 
                  onClick={() => deleteFile(item.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-error hover:bg-error hover:text-white rounded cursor-pointer outline-none"
                >
                  <Trash2 size={12} />
                  Delete
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>

          {item.type === 'folder' && isExpanded && (
            <div>{renderTree(item.id, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* HEADER */}
      <div className="h-9 flex items-center justify-between px-3 shrink-0 border-b border-default">
        <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">File Tree</span>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="p-1 text-secondary hover:text-primary hover:bg-elevated rounded transition-colors">
              <Plus size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="min-w-[140px] bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50">
              <DropdownMenu.Item 
                onClick={() => createFile('new-file.tsx', 'file', null)}
                className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
              >
                <FilePlus size={12} />
                New File
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={() => createFile('new-folder', 'folder', null)}
                className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
              >
                <FolderPlus size={12} />
                New Folder
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-[1px] bg-subtle my-1" />
              <DropdownMenu.Item className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none">
                <Upload size={12} />
                Upload
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* TREE */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <EmptyState 
              icon={FolderIcon}
              title="No files yet"
              description="Ask the agent to start building your application."
            />
          </div>
        ) : (
          renderTree()
        )}
      </div>
    </div>
  );
}
