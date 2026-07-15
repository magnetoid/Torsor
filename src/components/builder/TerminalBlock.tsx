import React, { useState, useRef, useEffect } from 'react';
import { Terminal, ChevronDown, ChevronUp, Copy, Check, XCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TerminalBlockProps {
  command: string;
  output: string[];
  exitCode?: number;
  isStreaming?: boolean;
}

export function TerminalBlock({ command, output, exitCode, isStreaming }: TerminalBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLineColor = (line: string) => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('failed')) return 'text-error';
    if (lower.includes('warning')) return 'text-warning';
    if (lower.includes('success') || lower.includes('ready in') || lower.includes('compiled')) return 'text-success';
    return 'text-primary';
  };

  const displayedOutput = isExpanded ? output : output.slice(-3);

  return (
    <div className="w-full bg-page rounded-xl border border-subtle overflow-hidden my-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="h-8 bg-surface px-3 flex items-center justify-between border-b border-subtle">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", isStreaming ? "bg-warning animate-pulse" : "bg-success")} />
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Terminal</span>
          </div>
          <span className="text-xs font-mono text-primary truncate opacity-80">$ {command}</span>
        </div>

        <div className="flex items-center gap-2">
          {exitCode !== undefined && (
            <div className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter",
              exitCode === 0 ? "text-success bg-success/10" : "text-error bg-error/10"
            )}>
              {exitCode === 0 ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              Exit {exitCode}
            </div>
          )}
          
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-secondary hover:text-primary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          <button 
            onClick={handleCopy}
            className="p-1 text-secondary hover:text-primary transition-colors"
            title="Copy output"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Body */}
      <div 
        ref={scrollRef}
        className={cn(
          "p-3 font-mono text-[11px] leading-relaxed overflow-y-auto no-scrollbar transition-all duration-300",
          isExpanded ? "max-h-[400px]" : "max-h-[100px]"
        )}
      >
        {displayedOutput.map((line, i) => (
          <div key={i} className={cn("whitespace-pre-wrap break-all", getLineColor(line))}>
            {line || '\u00A0'}
          </div>
        ))}
        {isStreaming && (
          <div className="flex items-center gap-1 mt-1">
            <div className="w-1 h-3 bg-accent animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
