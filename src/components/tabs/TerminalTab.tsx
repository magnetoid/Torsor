import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { wsUrlFor } from '../../lib/api';
import { useProjectStore } from '../../stores/projectStore';
import { useThemeColors } from '../../lib/theme';

interface TerminalInstance {
  id: string;
  name: string;
  xterm?: XTerm;
  fitAddon?: FitAddon;
  ws?: WebSocket;
}

export default function TerminalTab() {
  const [instances, setInstances] = useState<TerminalInstance[]>([
    { id: 'term-1', name: 'Terminal 1' }
  ]);
  const [activeId, setActiveId] = useState('term-1');
  const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const instancesRef = useRef<Record<string, TerminalInstance>>({});
  const colors = useThemeColors();

  const createTerminal = (id: string, container: HTMLDivElement) => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      theme: {
        background: colors['bg-page'] || '#202023',
        foreground: colors['text-primary'] || '#F6F6F8',
        cursor: colors['accent'] || '#8577F2',
        selectionBackground: colors['accent-muted'] || 'rgba(123, 106, 238, 0.25)',
        black: colors['bg-surface'] || '#303034',
        red: colors['error'] || '#FF5449',
        green: colors['success'] || '#3DD263',
        yellow: colors['warning'] || '#FFA71F',
        blue: colors['info'] || '#64CDFB',
        magenta: colors['accent'] || '#8577F2',
        cyan: colors['info'] || '#64CDFB',
        white: colors['text-primary'] || '#F6F6F8',
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    term.writeln('\x1b[1;35mTorsor Terminal\x1b[0m — interactive shell inside this project\'s workspace container.\r\n');

    const projectId = useProjectStore.getState().activeProjectId;
    if (!projectId) {
      term.writeln('\x1b[1;33mNo active project — open a project to start a shell in its workspace.\x1b[0m');
      return { term, fitAddon, ws: undefined };
    }

    // Real PTY over a WebSocket: the server bridges this to the workspace runtime's
    // ExecInteractive (a true pseudo-terminal in docker-runtime). We stream every keystroke
    // as stdin — the PTY echoes and does its own line editing — and forward resize events.
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrlFor(`/api/v1/projects/${projectId}/workspace/pty`));
    } catch {
      term.writeln('\x1b[1;31mUnable to open a terminal connection.\x1b[0m');
      return { term, fitAddon, ws: undefined };
    }

    let ended = false;
    const endSession = (msg: string) => {
      if (ended) return;
      ended = true;
      term.writeln(`\r\n\x1b[1;33m${msg}\x1b[0m`);
    };

    ws.onopen = () => {
      // First frame starts the session: empty command => the runtime's default shell.
      ws.send(JSON.stringify({ command: [], workingDir: '', rows: term.rows, cols: term.cols }));
    };
    ws.onmessage = (ev) => {
      let frame: { stdout?: string; stderr?: string; error?: string; done?: boolean };
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (frame.stdout) term.write(frame.stdout);
      if (frame.stderr) term.write(`\x1b[31m${frame.stderr}\x1b[0m`);
      if (frame.error) term.writeln(`\r\n\x1b[1;31m${frame.error}\x1b[0m`);
      if (frame.done) endSession('Session ended.');
    };
    ws.onerror = () => {
      endSession('No workspace for this project yet, or the terminal is unavailable — ask the agent to start one.');
    };
    ws.onclose = () => {
      endSession('Terminal disconnected.');
    };

    // Keystrokes -> stdin (raw passthrough; the PTY handles echo and line editing).
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ stdin: data }));
    });
    // Terminal size -> PTY resize (fires on fitAddon.fit()).
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ resize: { rows, cols } }));
    });

    return { term, fitAddon, ws };
  };

  useEffect(() => {
    instances.forEach(inst => {
      const container = terminalRefs.current[inst.id];
      if (container && !instancesRef.current[inst.id]) {
        const { term, fitAddon, ws } = createTerminal(inst.id, container);
        instancesRef.current[inst.id] = { ...inst, xterm: term, fitAddon, ws };
      }
    });

    const handleResize = () => {
      Object.values(instancesRef.current).forEach(inst => {
        inst.fitAddon?.fit();
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [instances]);

  // On unmount, tear down every PTY WebSocket and dispose the terminals.
  useEffect(() => {
    const instancesSnapshot = instancesRef.current;
    return () => {
      Object.values(instancesSnapshot).forEach(inst => {
        inst.ws?.close();
        inst.xterm?.dispose();
      });
    };
  }, []);

  useEffect(() => {
    Object.values(instancesRef.current).forEach(inst => {
      if (inst.xterm) {
        inst.xterm.options.theme = {
          background: colors['bg-page'] || '#202023',
          foreground: colors['text-primary'] || '#F6F6F8',
          cursor: colors['accent'] || '#8577F2',
          selectionBackground: colors['accent-muted'] || 'rgba(123, 106, 238, 0.25)',
          black: colors['bg-surface'] || '#303034',
          red: colors['error'] || '#FF5449',
          green: colors['success'] || '#3DD263',
          yellow: colors['warning'] || '#FFA71F',
          blue: colors['info'] || '#64CDFB',
          magenta: colors['accent'] || '#8577F2',
          cyan: colors['info'] || '#64CDFB',
          white: colors['text-primary'] || '#F6F6F8',
        };
      }
    });
  }, [colors]);

  const addInstance = () => {
    const newId = `term-${Date.now()}`;
    setInstances(prev => [...prev, { id: newId, name: `Terminal ${prev.length + 1}` }]);
    setActiveId(newId);
  };

  const removeInstance = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (instances.length === 1) return;
    
    setInstances(prev => {
      const filtered = prev.filter(i => i.id !== id);
      if (activeId === id) {
        setActiveId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });

    const inst = instancesRef.current[id];
    inst?.ws?.close();
    inst?.xterm?.dispose();
    delete instancesRef.current[id];
    delete terminalRefs.current[id];
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* SUB-TAB BAR */}
      <div className="h-8 bg-surface flex items-center overflow-x-auto no-scrollbar shrink-0 border-b border-default">
        {instances.map((inst) => (
          <div 
            key={inst.id}
            onClick={() => setActiveId(inst.id)}
            className={cn(
              "h-full flex items-center gap-2 px-3 border-r border-default min-w-[120px] max-w-[200px] cursor-pointer group transition-colors shrink-0",
              activeId === inst.id ? "bg-page text-primary" : "text-tertiary hover:bg-elevated"
            )}
          >
            <TerminalIcon size={12} className={activeId === inst.id ? "text-accent" : "text-tertiary"} />
            <span className="text-xs truncate flex-1">{inst.name}</span>
            {instances.length > 1 && (
              <button 
                onClick={(e) => removeInstance(inst.id, e)}
                className="p-0.5 rounded hover:bg-default/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button 
          onClick={addInstance}
          className="p-2 text-tertiary hover:text-primary hover:bg-elevated transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* TERMINAL VIEWPORT */}
      <div className="flex-1 relative overflow-hidden p-2">
        {instances.map(inst => (
          <div 
            key={inst.id}
            ref={el => { terminalRefs.current[inst.id] = el; }}
            className={cn(
              "absolute inset-2 transition-opacity duration-200",
              activeId === inst.id ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            )}
          />
        ))}
      </div>
    </div>
  );
}
