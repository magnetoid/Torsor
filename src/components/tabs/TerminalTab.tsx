import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Plus, X, Terminal as TerminalIcon, Play, Square, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

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
        background: '#1C1C1E', // --bg-page
        foreground: '#F0F0F2', // --text-primary
        cursor: '#7B6AEE',     // --accent
        selectionBackground: 'rgba(123, 106, 238, 0.25)', // --accent-muted (adjusted for selection)
        black: '#2B2B2E',      // --bg-surface
        red: '#FF453A',        // --error
        green: '#34C759',      // --success
        yellow: '#FF9F0A',     // --warning
        blue: '#5AC8FA',       // --info
        magenta: '#7B6AEE',    // --accent
        cyan: '#5AC8FA',       // --info
        white: '#F0F0F2',      // --text-primary
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    term.writeln('\x1b[1;35mTorsor Terminal v1.0.0\x1b[0m');
    term.writeln('Type \x1b[1;32mhelp\x1b[0m to see available commands.\r\n');
    term.write('\x1b[1;34muser@torsor\x1b[0m:\x1b[1;32m~/project\x1b[0m$ ');

    let currentLine = '';

    term.onData(data => {
      const code = data.charCodeAt(0);
      if (code === 13) { // Enter
        term.write('\r\n');
        handleCommand(currentLine, term);
        currentLine = '';
        term.write('\x1b[1;34muser@torsor\x1b[0m:\x1b[1;32m~/project\x1b[0m$ ');
      } else if (code === 127) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code < 32) {
        // Ignore other control characters
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    return { term, fitAddon };
  };

  const handleCommand = (cmd: string, term: XTerm) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const [command, ...args] = trimmed.split(' ');

    switch (command) {
      case 'help':
        term.writeln('Available commands: ls, cd, npm, git, clear, echo, help');
        break;
      case 'ls':
        term.writeln('src/  public/  package.json  vite.config.ts  tsconfig.json');
        break;
      case 'cd':
        term.writeln(`Changed directory to ${args[0] || '~'}`);
        break;
      case 'clear':
        term.clear();
        break;
      case 'echo':
        term.writeln(args.join(' '));
        break;
      case 'git':
        if (args[0] === 'status') {
          term.writeln('On branch \x1b[1;32mmain\x1b[0m');
          term.writeln('Your branch is up to date with \'origin/main\'.');
          term.writeln('\r\nnothing to commit, working tree clean');
        } else {
          term.writeln(`git ${args[0]} is not implemented in this mock.`);
        }
        break;
      case 'npm':
        if (args[0] === 'run' && args[1] === 'dev') {
          term.writeln('\r\n\x1b[1;32m> torsor-app@0.1.0 dev\x1b[0m');
          term.writeln('\x1b[1;32m> vite\x1b[0m\r\n');
          term.writeln('  \x1b[1;35mVITE v6.0.0\x1b[0m  ready in \x1b[1;33m124 ms\x1b[0m\r\n');
          term.writeln('  \x1b[1;32m➜\x1b[0m  \x1b[1;37mLocal:\x1b[0m   \x1b[1;34mhttp://localhost:3000/\x1b[0m');
          term.writeln('  \x1b[1;32m➜\x1b[0m  \x1b[1;37mNetwork:\x1b[0m \x1b[1;30muse --host to expose\x1b[0m\r\n');
          term.writeln('\x1b[1;30m[vite] hot updated: /src/App.tsx\x1b[0m');
        } else if (args[0] === 'install') {
          term.writeln('Installing dependencies...');
          let progress = 0;
          const interval = setInterval(() => {
            progress += 10;
            term.write(`\r[${'='.repeat(progress / 5)}${' '.repeat(20 - progress / 5)}] ${progress}%`);
            if (progress >= 100) {
              clearInterval(interval);
              term.writeln('\r\n\x1b[1;32madded 42 packages in 2s\x1b[0m');
              term.write('\x1b[1;34muser@torsor\x1b[0m:\x1b[1;32m~/project\x1b[0m$ ');
            }
          }, 200);
        } else {
          term.writeln(`npm ${args[0]} is not implemented in this mock.`);
        }
        break;
      default:
        term.writeln(`\x1b[1;31mCommand not found: ${command}\x1b[0m`);
    }
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
