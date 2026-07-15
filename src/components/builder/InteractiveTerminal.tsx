import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X, GripHorizontal } from 'lucide-react';
import { useAppStore } from '../../useAppStore';
import { cn } from '../../lib/utils';

export function InteractiveTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const setTerminalOpen = useAppStore(state => state.setTerminalOpen);
  const [height, setHeight] = useState(240);
  const isResizing = useRef(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      theme: {
        background: '#202023',
        foreground: '#F6F6F8',
        cursor: '#8577F2',
        selectionBackground: '#8577F244',
        black: '#303034',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bfbfbf',
      },
      allowTransparency: true,
      rows: 10,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[1;35mTesseract OS v1.0.0\x1b[0m');
    term.writeln('Type \x1b[32mhelp\x1b[0m for available commands.\r\n');
    
    let currentLine = '';
    const prompt = '\x1b[1;32muser@tesseract\x1b[0m:\x1b[1;34m~/project\x1b[0m$ ';
    term.write(prompt);

    term.onData(e => {
      switch (e) {
        case '\r': // Enter
          term.write('\r\n');
          handleCommand(currentLine);
          currentLine = '';
          term.write(prompt);
          break;
        case '\u007F': // Backspace
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b');
          }
          break;
        default:
          if (e >= ' ' && e <= '~') {
            currentLine += e;
            term.write(e);
          }
      }
    });

    const handleCommand = (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      const [command, ...args] = trimmed.split(' ');

      switch (command) {
        case 'help':
          term.writeln('Available commands: ls, cd, npm, git, cat, echo, clear, help');
          break;
        case 'ls':
          term.writeln('App.tsx  index.css  package.json  src/  utils.ts');
          break;
        case 'clear':
          term.clear();
          break;
        case 'npm':
          if (args[0] === 'run' && args[1] === 'dev') {
            term.writeln('\x1b[32m> dev\x1b[0m');
            term.writeln('\x1b[32m> vite\x1b[0m');
            term.writeln('');
            term.writeln('  \x1b[1mVITE v6.0.0\x1b[0m  ready in \x1b[1m128 ms\x1b[0m');
            term.writeln('');
            term.writeln('  \x1b[32m➜\x1b[0m  \x1b[1mLocal\x1b[0m:   \x1b[36mhttp://localhost:3000/\x1b[0m');
          } else if (args[0] === 'install') {
            term.writeln('added 142 packages, and audited 143 packages in 2s');
          } else {
            term.writeln(`Usage: npm [run dev|install]`);
          }
          break;
        case 'git':
          term.writeln('On branch main');
          term.writeln('Your branch is up to date with \'origin/main\'.');
          term.writeln('');
          term.writeln('nothing to commit, working tree clean');
          break;
        case 'echo':
          term.writeln(args.join(' '));
          break;
        default:
          term.writeln(`sh: command not found: ${command}`);
      }
    };

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newHeight = window.innerHeight - e.clientY;
    setHeight(Math.max(150, Math.min(600, newHeight)));
    if (fitAddonRef.current) fitAddonRef.current.fit();
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 bg-page border-t border-subtle z-40 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300"
      style={{ height: `${height}px` }}
    >
      {/* Resize Handle */}
      <div 
        className="h-1 w-full cursor-ns-resize hover:bg-accent/50 transition-colors flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-8 h-1 bg-subtle rounded-full group-hover:bg-accent/50 transition-colors" />
      </div>

      {/* Header */}
      <div className="h-9 bg-surface px-4 flex items-center justify-between border-b border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-xs font-bold text-primary tracking-tight">Interactive Terminal</span>
        </div>
        <button 
          onClick={() => setTerminalOpen(false)}
          className="p-1 text-secondary hover:text-primary hover:bg-elevated rounded transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Terminal Container */}
      <div className="flex-1 p-2 overflow-hidden">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
}
