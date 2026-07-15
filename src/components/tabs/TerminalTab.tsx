import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Plus, X, Terminal as TerminalIcon, Play, Square, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { apiExecStream, ApiError } from '../../lib/api';
import { useProjectStore } from '../../stores/projectStore';

const PROMPT = '\x1b[1;34mworkspace\x1b[0m$ ';

/** xterm needs CRLF; container output is LF. */
const toCRLF = (s: string) => s.replace(/\r?\n/g, '\r\n');

interface TerminalInstance {
  id: string;
  name: string;
  xterm?: XTerm;
  fitAddon?: FitAddon;
}

export default function TerminalTab() {
  const [instances, setInstances] = useState<TerminalInstance[]>([
    { id: 'term-1', name: 'Terminal 1' }
  ]);
  const [activeId, setActiveId] = useState('term-1');
  const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const instancesRef = useRef<Record<string, TerminalInstance>>({});

  const createTerminal = (id: string, container: HTMLDivElement) => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      theme: {
        background: '#202023', // --bg-page
        foreground: '#F6F6F8', // --text-primary
        cursor: '#8577F2',     // --accent
        selectionBackground: 'rgba(123, 106, 238, 0.25)', // --accent-muted (adjusted for selection)
        black: '#303034',      // --bg-surface
        red: '#FF5449',        // --error
        green: '#3DD263',      // --success
        yellow: '#FFA71F',     // --warning
        blue: '#64CDFB',       // --info
        magenta: '#8577F2',    // --accent
        cyan: '#64CDFB',       // --info
        white: '#F6F6F8',      // --text-primary
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    term.writeln('\x1b[1;35mTorsor Terminal\x1b[0m — commands run inside this project\'s workspace container.');
    term.writeln('Built-ins: \x1b[1;32mclear\x1b[0m. Press \x1b[1;32mCtrl+C\x1b[0m to cancel a running command.\r\n');
    term.write(PROMPT);

    let currentLine = '';
    let running = false;
    let abort: AbortController | null = null;

    // Runs the line inside the project's workspace via the exec SSE stream. The prompt
    // is written when the stream finishes (commands are async, unlike the old mock).
    const runCommand = async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) {
        term.write(PROMPT);
        return;
      }
      if (trimmed === 'clear') {
        term.clear();
        term.write(PROMPT);
        return;
      }

      const projectId = useProjectStore.getState().activeProjectId;
      if (!projectId) {
        term.writeln('\x1b[1;33mNo active project — open a project to run commands in its workspace.\x1b[0m');
        term.write(PROMPT);
        return;
      }

      running = true;
      abort = new AbortController();
      let sawExit: number | undefined;
      try {
        await apiExecStream(projectId, ['/bin/sh', '-c', trimmed], {
          signal: abort.signal,
          onChunk: (c) => {
            if (c.stdout) term.write(toCRLF(c.stdout));
            if (c.stderr) term.write(`\x1b[31m${toCRLF(c.stderr)}\x1b[0m`);
            if (c.done) sawExit = c.exitCode;
          },
        });
        if (sawExit !== undefined && sawExit !== 0) {
          term.writeln(`\x1b[1;31mexit ${sawExit}\x1b[0m`);
        }
      } catch (err) {
        if (abort.signal.aborted) {
          term.writeln('\x1b[1;33m^C\x1b[0m');
        } else if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
          term.writeln('\x1b[1;33mNo workspace for this project yet — deploy an image or ask the agent to start one.\x1b[0m');
        } else {
          term.writeln(`\x1b[1;31m${err instanceof Error ? err.message : 'Command failed'}\x1b[0m`);
        }
      } finally {
        running = false;
        abort = null;
        term.write(PROMPT);
      }
    };

    term.onData(data => {
      const code = data.charCodeAt(0);
      if (running) {
        // Only Ctrl+C is meaningful while a command streams.
        if (code === 3) abort?.abort();
        return;
      }
      if (code === 13) { // Enter
        term.write('\r\n');
        const line = currentLine;
        currentLine = '';
        void runCommand(line);
      } else if (code === 127) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code === 3) { // Ctrl+C at the prompt: discard the current line
        currentLine = '';
        term.write('^C\r\n' + PROMPT);
      } else if (code < 32) {
        // Ignore other control characters
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    return { term, fitAddon };
  };

  useEffect(() => {
    instances.forEach(inst => {
      const container = terminalRefs.current[inst.id];
      if (container && !instancesRef.current[inst.id]) {
        const { term, fitAddon } = createTerminal(inst.id, container);
        instancesRef.current[inst.id] = { ...inst, xterm: term, fitAddon };
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
