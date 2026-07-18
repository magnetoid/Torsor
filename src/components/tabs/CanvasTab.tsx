import React, { useState, useMemo } from 'react';
import { 
  Frame, 
  MousePointer2, 
  Hand, 
  Plus, 
  Monitor, 
  Tablet, 
  Smartphone, 
  RefreshCw, 
  Undo2, 
  Redo2, 
  ChevronDown, 
  Code, 
  X, 
  Search, 
  Layers, 
  Settings, 
  Box, 
  Type, 
  Image as ImageIcon, 
  Layout, 
  Square, 
  Circle, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Bold, 
  Italic, 
  Link as LinkIcon, 
  Trash2, 
  Copy, 
  MoreVertical, 
  Github, 
  Figma, 
  ArrowRight, 
  Sparkles, 
  MessageSquare, 
  FileCode,
  Check,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCanvasStore, ViewportMode, ToolType, CanvasElement } from '../../stores/canvasStore';
import { useLayoutStore } from '../../stores/layoutStore';
import * as Select from '@radix-ui/react-select';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';

const ViewportToggle = ({ mode, active, onClick }: { mode: ViewportMode; active: boolean; onClick: () => void }) => {
  const Icon = mode === 'desktop' ? Monitor : mode === 'tablet' ? Tablet : Smartphone;
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-lg transition-all",
        active ? "bg-accent/20 text-accent border border-accent/30" : "text-secondary hover:text-primary hover:bg-elevated"
      )}
    >
      <Icon size={16} />
    </button>
  );
};

const ToolButton = ({ tool, active, onClick }: { tool: ToolType; active: boolean; onClick: () => void }) => {
  const Icon = tool === 'pointer' ? MousePointer2 : Hand;
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-lg transition-all",
        active ? "bg-accent/20 text-accent border border-accent/30" : "text-secondary hover:text-primary hover:bg-elevated"
      )}
    >
      <Icon size={16} />
    </button>
  );
};

const PropertyInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold text-secondary uppercase tracking-wider">{label}</label>
    <input 
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-all"
    />
  </div>
);

const BoxModelEditor = () => (
  <div className="space-y-3">
    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Spacing</label>
    <div className="relative aspect-video bg-page border border-default rounded-xl flex items-center justify-center p-4">
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
        <Box size={80} />
      </div>
      <div className="w-full h-full border border-dashed border-default rounded-lg flex items-center justify-center relative">
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-tertiary">MARGIN</span>
        <div className="w-[70%] h-[60%] border border-default bg-surface rounded flex items-center justify-center relative">
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-tertiary">PADDING</span>
          <div className="w-[60%] h-[50%] bg-elevated border border-default rounded flex items-center justify-center">
            <div className="grid grid-cols-2 gap-2 p-2">
              <input className="w-8 bg-transparent text-xs text-center text-primary outline-none" placeholder="0" />
              <input className="w-8 bg-transparent text-xs text-center text-primary outline-none" placeholder="0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function CanvasTab() {
  const { 
    selectedElementId, 
    selectElement, 
    viewportMode, 
    setViewportMode, 
    activeTool, 
    setActiveTool, 
    isSyncEnabled, 
    toggleSync, 
    elements, 
    updateElement, 
    addElement 
  } = useCanvasStore();

  const { openTab } = useLayoutStore();
  const [isFigmaOpen, setIsFigmaOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const selectedElement = selectedElementId ? elements[selectedElementId] : null;

  const getParentChain = (id: string): string[] => {
    const el = elements[id];
    if (!el || !el.parentId) return [el.type];
    return [...getParentChain(el.parentId), el.type];
  };

  const handleFigmaImport = () => {
    if (!figmaUrl) return;
    setIsImporting(true);
    setTimeout(() => {
      setIsImporting(false);
      setIsFigmaOpen(false);
      setFigmaUrl('');
      // Mock import success
      addElement('FigmaImport');
    }, 2000);
  };

  const renderElement = (id: string) => {
    const el = elements[id];
    if (!el) return null;

    const isSelected = selectedElementId === id;

    return (
      <ContextMenu.Root key={id}>
        <ContextMenu.Trigger>
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'pointer') selectElement(id);
            }}
            className={cn(
              ...el.classes,
              "relative transition-all duration-200",
              isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-page z-50",
              !isSelected && activeTool === 'pointer' && "hover:ring-1 hover:ring-accent/50 cursor-pointer"
            )}
          >
            {isSelected && (
              <div className="absolute -top-6 left-0 flex items-center gap-1">
                <div className="bg-accent text-white text-xs font-bold px-2 py-0.5 rounded-t-lg shadow-lg flex items-center gap-1.5">
                  <Box size={10} />
                  {el.type}
                </div>
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 bg-surface border border-accent rounded-full" />
                  <div className="w-1.5 h-1.5 bg-surface border border-accent rounded-full" />
                </div>
              </div>
            )}
            
            {el.content}
            {el.children?.map(childId => renderElement(childId))}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50 min-w-[180px]">
            <ContextMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent rounded-lg outline-none cursor-pointer">
              <Sparkles size={12} /> Ask Agent to change this
            </ContextMenu.Item>
            <ContextMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-default rounded-lg outline-none cursor-pointer">
              <MessageSquare size={12} /> Drag to Chat
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-[1px] bg-default my-1" />
            <ContextMenu.Item 
              onSelect={() => openTab('code')}
              className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-default rounded-lg outline-none cursor-pointer"
            >
              <FileCode size={12} /> View Code
            </ContextMenu.Item>
            <ContextMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-default rounded-lg outline-none cursor-pointer">
              <Copy size={12} /> Duplicate
            </ContextMenu.Item>
            <ContextMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer">
              <Trash2 size={12} /> Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  };

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Toolbar */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-page p-1 rounded-xl border border-default">
            <ToolButton tool="pointer" active={activeTool === 'pointer'} onClick={() => setActiveTool('pointer')} />
            <ToolButton tool="hand" active={activeTool === 'hand'} onClick={() => setActiveTool('hand')} />
          </div>

          <Separator.Root orientation="vertical" className="h-4 w-[1px] bg-default" />

          <div className="flex items-center gap-1 bg-page p-1 rounded-xl border border-default">
            <ViewportToggle mode="desktop" active={viewportMode === 'desktop'} onClick={() => setViewportMode('desktop')} />
            <ViewportToggle mode="tablet" active={viewportMode === 'tablet'} onClick={() => setViewportMode('tablet')} />
            <ViewportToggle mode="mobile" active={viewportMode === 'mobile'} onClick={() => setViewportMode('mobile')} />
          </div>

          <Separator.Root orientation="vertical" className="h-4 w-[1px] bg-default" />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-default border border-default text-primary text-[11px] font-bold rounded-lg transition-all outline-none">
                <Plus size={14} />
                Insert
                <ChevronDown size={14} className="text-secondary" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50 min-w-[160px]">
                {[
                  { type: 'Button', icon: Square },
                  { type: 'Input', icon: Type },
                  { type: 'Card', icon: Layout },
                  { type: 'Text', icon: AlignLeft },
                  { type: 'Image', icon: ImageIcon },
                  { type: 'Form', icon: FileCode },
                  { type: 'Table', icon: Layers },
                ].map(item => (
                  <DropdownMenu.Item 
                    key={item.type}
                    onSelect={() => addElement(item.type, selectedElementId || 'root')}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent rounded-lg outline-none cursor-pointer"
                  >
                    <item.icon size={12} /> {item.type}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-secondary hover:text-primary rounded-lg transition-all"><Undo2 size={16} /></button>
            <button className="p-1.5 text-secondary hover:text-primary rounded-lg transition-all"><Redo2 size={16} /></button>
          </div>

          <Separator.Root orientation="vertical" className="h-4 w-[1px] bg-default" />

          <Dialog.Root open={isFigmaOpen} onOpenChange={setIsFigmaOpen}>
            <Dialog.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-default border border-default text-primary text-[11px] font-bold rounded-lg transition-all">
                <Figma size={14} className="text-error" />
                Figma Import
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-page/60 backdrop-blur-sm z-[100]" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-elevated border border-default rounded-xl p-6 shadow-2xl z-[101] outline-none">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                      <Figma size={20} className="text-error" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-bold text-primary">Import from Figma</Dialog.Title>
                      <Dialog.Description className="text-xs text-secondary">Paste a Figma URL to convert frames to components</Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close className="text-secondary hover:text-primary"><X size={20} /></Dialog.Close>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Figma File URL</label>
                    <input 
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                      placeholder="https://www.figma.com/file/..."
                      className="w-full bg-page border border-default rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-accent/50 transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleFigmaImport}
                    disabled={!figmaUrl || isImporting}
                    className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    {isImporting ? 'Converting Components...' : 'Import Design'}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-elevated border border-default rounded-lg">
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">Sync</span>
            <button 
              onClick={toggleSync}
              className={cn(
                "w-8 h-4 rounded-full relative transition-colors outline-none",
                isSyncEnabled ? "bg-accent" : "bg-inset"
              )}
            >
              <div className={cn(
                "absolute top-0.5 left-0.5 w-3 h-3 bg-primary rounded-full transition-transform",
                isSyncEnabled && "translate-x-4"
              )} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 bg-inset relative overflow-auto custom-scrollbar flex items-center justify-center p-12">
          <div 
            className={cn(
              "bg-page shadow-2xl transition-all duration-300 overflow-hidden relative",
              viewportMode === 'desktop' && "w-full max-w-5xl aspect-video",
              viewportMode === 'tablet' && "w-[768px] h-[1024px]",
              viewportMode === 'mobile' && "w-[375px] h-[812px]"
            )}
            onClick={() => selectElement(null)}
          >
            {renderElement('root')}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-[280px] border-l border-default bg-surface flex flex-col overflow-hidden">
          <ScrollArea.Root className="flex-1">
            <ScrollArea.Viewport className="h-full">
              <div className="p-6 space-y-8">
                {selectedElement ? (
                  <>
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Box size={14} className="text-accent" />
                          <h3 className="text-xs font-bold text-primary">{selectedElement.type}</h3>
                        </div>
                        <button onClick={() => selectElement(null)} className="text-secondary hover:text-primary"><X size={14} /></button>
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto pb-2 no-scrollbar">
                        {getParentChain(selectedElementId!).map((type, i) => (
                          <React.Fragment key={i}>
                            <span className="text-xs text-secondary whitespace-nowrap">{type}</span>
                            {i < getParentChain(selectedElementId!).length - 1 && <ArrowRight size={8} className="text-tertiary shrink-0" />}
                          </React.Fragment>
                        ))}
                      </div>
                    </section>

                    <Separator.Root className="h-[1px] bg-default" />

                    <section className="space-y-4">
                      <PropertyInput 
                        label="Text Content" 
                        value={selectedElement.content} 
                        onChange={(v) => updateElement(selectedElementId!, { content: v })}
                      />

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">Tailwind Classes</label>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedElement.classes.map((cls, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-0.5 bg-page border border-default rounded text-xs text-accent font-mono">
                              {cls}
                              <button 
                                onClick={() => updateElement(selectedElementId!, { classes: selectedElement.classes.filter((_, idx) => idx !== i) })}
                                className="text-tertiary hover:text-error"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          <button className="px-2 py-0.5 bg-page border border-dashed border-default rounded text-xs text-secondary hover:text-primary hover:border-default">
                            + Add class
                          </button>
                        </div>
                      </div>
                    </section>

                    <Separator.Root className="h-[1px] bg-default" />

                    <section className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">Variant</label>
                        <Select.Root value={selectedElement.props.variant || 'default'} onValueChange={(v) => updateElement(selectedElementId!, { props: { ...selectedElement.props, variant: v } })}>
                          <Select.Trigger className="w-full flex items-center justify-between px-3 py-1.5 bg-page border border-default rounded-lg text-xs text-primary outline-none">
                            <Select.Value />
                            <ChevronDown size={14} className="text-secondary" />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50">
                              {['default', 'primary', 'secondary', 'outline', 'ghost'].map(v => (
                                <Select.Item key={v} value={v} className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent rounded-lg outline-none cursor-pointer">
                                  <Select.ItemText>{v}</Select.ItemText>
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">Size</label>
                        <div className="flex bg-page p-1 rounded-xl border border-default">
                          {['sm', 'md', 'lg', 'xl'].map(s => (
                            <button 
                              key={s}
                              onClick={() => updateElement(selectedElementId!, { props: { ...selectedElement.props, size: s } })}
                              className={cn(
                                "flex-1 py-1 text-xs font-bold uppercase rounded-lg transition-all",
                                selectedElement.props.size === s ? "bg-accent text-white" : "text-secondary hover:text-primary"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>

                    <Separator.Root className="h-[1px] bg-default" />

                    <BoxModelEditor />

                    <Separator.Root className="h-[1px] bg-default" />

                    <button 
                      onClick={() => openTab('code')}
                      className="w-full py-2 bg-accent/5 hover:bg-accent/10 border border-accent/20 rounded-xl text-[11px] font-bold text-accent transition-all flex items-center justify-center gap-2"
                    >
                      <Code size={14} />
                      View in Code Editor
                    </button>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <MousePointer2 size={32} className="text-tertiary mb-4 opacity-20" />
                    <p className="text-xs font-bold text-secondary uppercase tracking-wider">No Element Selected</p>
                    <p className="text-[11px] text-tertiary mt-2">Click an element on the canvas to edit its properties</p>
                  </div>
                )}
              </div>
            </ScrollArea.Viewport>
          </ScrollArea.Root>
        </div>
      </div>
    </div>
  );
}
