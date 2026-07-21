import React, { useState, useEffect } from 'react';
import Editor, { OnMount, useMonaco } from '@monaco-editor/react';
import { 
  X, 
  ChevronRight, 
  FileCode, 
  FileJson, 
  FileText, 
  Hash, 
  Code2, 
  Terminal,
  Sparkles,
  Wand2,
  Search,
  Zap
} from 'lucide-react';
import { useAppStore } from '../../useAppStore';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/chatStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { cn } from '../../lib/utils';
import { useThemeColors, useThemeStore } from '../../lib/theme';

export default function CodeEditorTab() {
  const { files, updateFileContent, saveFile, saveStatus, workspaceProjectId } = useAppStore();
  const { openFileIds, activeFileId, setActiveFile, closeFile } = useEditorStore();
  const [editorValue, setEditorValue] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const { theme } = useThemeStore();
  const colors = useThemeColors();
  const monaco = useMonaco();

  const activeFile = files.find(f => f.id === activeFileId);
  const openFiles = openFileIds.map(id => files.find(f => f.id === id)).filter(Boolean);
  const activeSaveStatus = activeFileId ? saveStatus[activeFileId] : undefined;

  useEffect(() => {
    if (activeFile) {
      setEditorValue(activeFile.content || '');
    }
  }, [activeFileId, activeFile?.content]);

  // Dynamic Theme Generation
  useEffect(() => {
    if (monaco && colors && Object.keys(colors).length > 0) {
      monaco.editor.defineTheme('torsor-theme', {
        base: theme === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: (colors['text-tertiary'] || '#6D6D74').replace('#', '') },
          { token: 'keyword', foreground: (colors['accent'] || '#8577F2').replace('#', '') },
          { token: 'string', foreground: (colors['success'] || '#3DD263').replace('#', '') },
          { token: 'number', foreground: (colors['warning'] || '#FFA71F').replace('#', '') },
        ],
        colors: {
          'editor.background': colors['bg-page'] || '#202023',
          'editor.lineHighlightBackground': colors['bg-surface'] || '#303034',
          'editorLineNumber.foreground': colors['text-tertiary'] || '#6D6D74',
          'editorLineNumber.activeForeground': colors['text-primary'] || '#F6F6F8',
          'editorIndentGuide.background': colors['border'] || '#43434A',
          'editor.selectionBackground': colors['accent-muted'] || '#8577F240',
          'editorWidget.background': colors['bg-surface'] || '#303034',
          'editorWidget.border': colors['border'] || '#43434A',
        }
      });
      monaco.editor.setTheme('torsor-theme');
    }
  }, [monaco, colors, theme]);

  // Cmd/Ctrl+S forces an immediate save (bypassing the debounce) for workspace-backed files.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeFileId && workspaceProjectId) void saveFile(activeFileId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFileId, workspaceProjectId, saveFile]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && activeFileId) {
      setEditorValue(value);
      updateFileContent(activeFileId, value);
    }
  };

  // Send the current selection (or whole file) to the chat composer as a
  // context-prefilled draft. Uses composerDraft, which the chat input consumes
  // and focuses but never auto-sends — the user reviews and hits send.
  const sendToAgent = (editor: Parameters<OnMount>[0], intent: 'ask' | 'fix' | 'explain' | 'refactor') => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    const selected = model && selection ? model.getValueInRange(selection) : '';
    const code = selected.trim() || model?.getValue() || '';
    if (!code.trim()) return;

    const activeId = useEditorStore.getState().activeFileId;
    const file = useAppStore.getState().files.find((f) => f.id === activeId);
    const fileName = file?.name || 'the current file';
    const lang = fileName.includes('.') ? fileName.split('.').pop() : '';
    const scope = selected.trim() ? 'selection' : 'file';

    const lead: Record<typeof intent, string> = {
      ask: `Question about this ${scope} from ${fileName}:`,
      fix: `Fix any bugs or issues in this ${scope} from ${fileName}:`,
      explain: `Explain what this ${scope} from ${fileName} does:`,
      refactor: `Refactor this ${scope} from ${fileName} for clarity and maintainability:`,
    };

    const draft = `${lead[intent]}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    useChatStore.getState().setComposerDraft(draft);

    // Make sure the chat panel is visible so the draft is seen.
    if (!useLayoutStore.getState().leftPanelOpen) {
      useLayoutStore.getState().toggleLeftPanel();
    }
  };

  const handleEditorMount: OnMount = (editor, monaco) => {

    // Add custom context menu items
    editor.addAction({
      id: 'ask-agent',
      label: 'Ask Agent',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: () => sendToAgent(editor, 'ask'),
    });

    editor.addAction({
      id: 'fix-this',
      label: 'Fix this',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: () => sendToAgent(editor, 'fix'),
    });

    editor.addAction({
      id: 'explain',
      label: 'Explain',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      run: () => sendToAgent(editor, 'explain'),
    });

    editor.addAction({
      id: 'refactor',
      label: 'Refactor',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 4,
      run: () => sendToAgent(editor, 'refactor'),
    });

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop();
    switch (ext) {
      case 'tsx': return <FileCode size={14} className="text-accent" />;
      case 'ts': return <Code2 size={14} className="text-info" />;
      case 'css': return <Hash size={14} className="text-warning" />;
      case 'json': return <FileJson size={14} className="text-tertiary" />;
      case 'md': return <FileText size={14} className="text-success" />;
      default: return <FileText size={14} className="text-tertiary" />;
    }
  };

  const getLanguage = (fileName: string) => {
    const ext = fileName.split('.').pop();
    switch (ext) {
      case 'tsx':
      case 'ts': return 'typescript';
      case 'css': return 'css';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'html': return 'html';
      default: return 'plaintext';
    }
  };

  const getBreadcrumbs = () => {
    if (!activeFile) return [];
    const path = [];
    let current = activeFile;
    while (current) {
      path.unshift(current.name);
      if (current.parentId) {
        current = files.find(f => f.id === current.parentId) as any;
      } else {
        break;
      }
    }
    return path;
  };

  // Guard BOTH the id and the resolved file: a persisted activeFileId can outlive its file
  // (project switch, deletion, a fresh workspace) — rendering on the id alone crashed the
  // editor with "Cannot read properties of undefined (reading 'name')".
  if (!activeFileId || !activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-secondary gap-4">
        <div className="w-16 h-16 rounded-xl bg-surface border border-default flex items-center justify-center">
          <Code2 size={32} />
        </div>
        <p className="text-sm font-medium">Select a file to edit</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* EDITOR TAB BAR */}
      <div className="h-8 bg-surface flex items-center overflow-x-auto no-scrollbar shrink-0">
        {openFiles.map((file) => file && (
          <div 
            key={file.id}
            onClick={() => setActiveFile(file.id)}
            className={cn(
              "h-full flex items-center gap-2 px-3 border-r border-default min-w-[120px] max-w-[200px] cursor-pointer group transition-colors shrink-0",
              activeFileId === file.id ? "bg-page text-primary" : "text-tertiary hover:bg-elevated"
            )}
          >
            <div className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              file.name.endsWith('.tsx') ? "bg-accent" : 
              file.name.endsWith('.ts') ? "bg-info" : 
              file.name.endsWith('.css') ? "bg-warning" : "bg-tertiary"
            )} />
            <span className="text-xs truncate flex-1">{file.name}</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.id);
              }}
              className="p-0.5 rounded hover:bg-default/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* BREADCRUMB */}
      <div className="h-6 px-3 flex items-center gap-1 text-xs text-tertiary border-b border-default bg-page shrink-0">
        {getBreadcrumbs().map((part, idx, arr) => (
          <React.Fragment key={idx}>
            <span className={cn(idx === arr.length - 1 && "text-secondary")}>{part}</span>
            {idx < arr.length - 1 && <ChevronRight size={10} />}
          </React.Fragment>
        ))}
      </div>

      {/* MONACO EDITOR */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={getLanguage(activeFile.name)}
          value={editorValue}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12 },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            renderLineHighlight: 'all',
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            }
          }}
        />
      </div>

      {/* BOTTOM STATUS */}
      <div className="h-6 px-3 flex items-center justify-between text-xs text-tertiary border-t border-default bg-page shrink-0">
        <div className="flex items-center gap-3">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-3">
          {!workspaceProjectId ? (
            // No real workspace backs this file — don't claim it's saved to a backend.
            <span className="flex items-center gap-1 text-tertiary">
              <div className="w-1.5 h-1.5 rounded-full border border-default" />
              Local
            </span>
          ) : activeSaveStatus === 'saving' ? (
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Saving…
            </span>
          ) : activeSaveStatus === 'error' ? (
            <span className="flex items-center gap-1 text-error">
              <div className="w-1.5 h-1.5 rounded-full bg-error" />
              Save failed
            </span>
          ) : activeSaveStatus === 'dirty' ? (
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              Unsaved
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              Saved
            </span>
          )}
          <span className="uppercase">{getLanguage(activeFile.name)}</span>
        </div>
      </div>
    </div>
  );
}
