import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  HardDrive, 
  Upload, 
  Grid, 
  List, 
  Search, 
  MoreVertical, 
  Copy, 
  Trash2, 
  Edit2, 
  File, 
  FileImage, 
  FileVideo, 
  FileText, 
  ChevronRight, 
  X, 
  Download,
  ExternalLink,
  Loader2,
  Folder
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Progress from '@radix-ui/react-progress';
import { cn } from '../../lib/utils';
import { useStorageStore, StorageFile, FileType } from '../../stores/storageStore';
import { useProjectStore } from '../../stores/projectStore';

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const FileIcon = ({ type, className }: { type: FileType; className?: string }) => {
  switch (type) {
    case 'image': return <FileImage className={cn("text-success", className)} />;
    case 'video': return <FileVideo className={cn("text-accent", className)} />;
    case 'document': return <FileText className={cn("text-warning", className)} />;
    default: return <File className={cn("text-tertiary", className)} />;
  }
};

export default function AppStorageTab() {
  const {
    files,
    viewMode,
    setViewMode,
    totalCapacity,
    uploadFile,
    deleteFile,
    renameFile,
    uploads,
    currentPath,
    setPath,
    fetchFiles,
    downloadFile,
  } = useStorageStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Load the real asset list for the active project.
  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles, activeProjectId]);
  
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const selectedFile = useMemo(() => files.find(f => f.id === selectedFileId), [files, selectedFileId]);
  
  const usedCapacity = useMemo(() => files.reduce((acc, f) => acc + f.size, 0), [files]);
  const usagePercent = (usedCapacity / totalCapacity) * 100;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(uploadFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(uploadFile);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    // In a real app, toast success
  };

  return (
    <div 
      className="flex flex-col h-full bg-page relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-accent/10 border-2 border-dashed border-accent flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-200">
          <Upload size={48} className="text-accent mb-4 animate-bounce" />
          <p className="text-lg font-bold text-accent">Drop files to upload</p>
        </div>
      )}

      {/* Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-accent" />
            <span className="text-xs font-bold text-primary">App Storage</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-32 h-1.5 bg-elevated rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent transition-all duration-500" 
                style={{ width: `${usagePercent}%` }} 
              />
            </div>
            <span className="text-xs text-secondary font-medium">
              {formatSize(usedCapacity)} / {formatSize(totalCapacity)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-page p-0.5 rounded-lg border border-default">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1 rounded-md transition-all",
                viewMode === 'grid' ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
              )}
            >
              <Grid size={14} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-1 rounded-md transition-all",
                viewMode === 'list' ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
              )}
            >
              <List size={14} />
            </button>
          </div>
          
          <input 
            type="file" 
            multiple 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded-lg transition-all"
          >
            <Upload size={14} />
            Upload
          </button>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="h-8 px-4 flex items-center gap-2 border-b border-default bg-page text-xs text-secondary">
        <button onClick={() => setPath('/')} className="hover:text-primary transition-colors">Root</button>
        <ChevronRight size={12} />
        <span className="text-primary font-medium">All Files</span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Browser */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {/* Upload Progress Section */}
          {uploads.length > 0 && (
            <div className="mb-6 space-y-2">
              <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Uploading</h3>
              {uploads.map(upload => (
                <div key={upload.id} className="bg-surface border border-default rounded-lg p-3 flex items-center gap-4">
                  <Loader2 size={16} className="text-accent animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-primary truncate">{upload.name}</span>
                      <span className="text-xs text-secondary">{Math.round(upload.progress)}%</span>
                    </div>
                    <Progress.Root className="h-1 bg-elevated rounded-full overflow-hidden">
                      <Progress.Indicator 
                        className="h-full bg-accent transition-all duration-300" 
                        style={{ width: `${upload.progress}%` }} 
                      />
                    </Progress.Root>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {files.map(file => (
                <div 
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={cn(
                    "group relative bg-surface border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-default",
                    selectedFileId === file.id ? "border-accent ring-1 ring-accent/20" : "border-default"
                  )}
                >
                  <div className="aspect-square bg-page flex items-center justify-center relative">
                    {file.type === 'image' && file.thumbnailUrl ? (
                      <img 
                        src={file.thumbnailUrl} 
                        alt={file.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <FileIcon type={file.type} className="w-10 h-10 opacity-50" />
                    )}
                    
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button 
                            className="p-1 bg-elevated/80 backdrop-blur-sm rounded-md text-primary hover:bg-accent transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[140px]">
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
                              onClick={() => copyUrl(file.url)}
                            >
                              <Copy size={14} /> Copy URL
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none">
                              <Edit2 size={14} /> Rename
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="h-[1px] bg-border-default my-1" />
                            <DropdownMenu.Item 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-error hover:bg-error hover:text-white rounded cursor-pointer outline-none"
                              onClick={() => deleteFile(file.id)}
                            >
                              <Trash2 size={14} /> Delete
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-medium text-primary truncate mb-0.5">{file.name}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-secondary">{formatSize(file.size)}</span>
                      <span className="text-[9px] text-tertiary">{new Date(file.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-surface border border-default rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-default bg-elevated/50">
                    <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Size</th>
                    <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Uploaded</th>
                    <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map(file => (
                    <tr 
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      className={cn(
                        "border-b border-subtle hover:bg-elevated/30 cursor-pointer transition-colors",
                        selectedFileId === file.id && "bg-accent/5"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <FileIcon type={file.type} className="w-4 h-4" />
                          <span className="text-xs text-primary font-medium truncate max-w-[200px]">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-secondary capitalize">{file.type}</td>
                      <td className="px-4 py-2.5 text-[11px] text-secondary">{formatSize(file.size)}</td>
                      <td className="px-4 py-2.5 text-[11px] text-secondary">{new Date(file.uploadedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); copyUrl(file.url); }}
                            className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
                          >
                            <Copy size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                            className="p-1.5 text-secondary hover:text-error hover:bg-error/10 rounded-md transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {selectedFile && (
          <div className="w-80 border-l border-default bg-surface flex flex-col animate-in slide-in-from-right duration-300">
            <div className="h-10 px-4 flex items-center justify-between border-b border-default">
              <span className="text-xs font-bold text-primary">File Preview</span>
              <button 
                onClick={() => setSelectedFileId(null)}
                className="p-1 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="aspect-video bg-page rounded-lg border border-default flex items-center justify-center overflow-hidden mb-4">
                {selectedFile.type === 'image' ? (
                  <img 
                    src={selectedFile.url} 
                    alt={selectedFile.name} 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : selectedFile.type === 'video' ? (
                  <video 
                    src={selectedFile.url} 
                    controls 
                    className="w-full h-full"
                  />
                ) : (
                  <FileIcon type={selectedFile.type} className="w-12 h-12 opacity-50" />
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Details</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-secondary">Name</span>
                      <span className="text-primary font-medium truncate max-w-[160px]">{selectedFile.name}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-secondary">Type</span>
                      <span className="text-primary font-medium capitalize">{selectedFile.type}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-secondary">Size</span>
                      <span className="text-primary font-medium">{formatSize(selectedFile.size)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-secondary">Uploaded</span>
                      <span className="text-primary font-medium">{new Date(selectedFile.uploadedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">CDN URL</h4>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-page border border-default rounded-lg px-2 py-1.5 text-xs text-secondary font-mono truncate">
                      {selectedFile.url}
                    </div>
                    <button 
                      onClick={() => copyUrl(selectedFile.url)}
                      className="p-1.5 bg-elevated border border-default rounded-lg text-primary hover:bg-accent transition-colors"
                      title="Copy CDN URL"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4">
                  <button
                    onClick={() => selectedFile && void downloadFile(selectedFile.id)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-elevated border border-default rounded-lg text-xs font-bold text-primary hover:bg-inset transition-all focus-ring"
                  >
                    <Download size={14} />
                    Download
                  </button>
                  <a 
                    href={selectedFile.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-elevated border border-default rounded-lg text-xs font-bold text-primary hover:bg-inset transition-all"
                  >
                    <ExternalLink size={14} />
                    Open
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
