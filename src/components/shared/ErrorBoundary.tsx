import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'App'}:`, error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mb-6 border border-error/20 shadow-lg shadow-error/10">
            <AlertTriangle size={32} />
          </div>
          
          <h2 className="text-xl font-bold text-primary mb-2 tracking-tight">
            Something went wrong
          </h2>
          
          <p className="text-sm text-secondary max-w-[320px] leading-relaxed mb-8">
            An unexpected error occurred in {this.props.name || 'this section'}. We've been notified and are looking into it.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mb-8">
            <Button 
              onClick={this.handleReload}
              variant="primary"
              size="lg"
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Reload page
            </Button>
            
            <a 
              href="https://github.com/torsor/platform/issues" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm font-bold text-secondary hover:text-primary transition-colors flex items-center gap-2 px-4 py-2"
            >
              <MessageSquare size={16} />
              Report issue
            </a>
          </div>

          {this.state.error && (
            <div className="w-full max-w-lg bg-surface border border-default rounded-xl overflow-hidden shadow-sm">
              <button 
                onClick={this.toggleDetails}
                className="w-full px-4 py-2 flex items-center justify-between text-[10px] font-bold text-tertiary uppercase tracking-wider hover:bg-elevated transition-colors"
              >
                Error details
                {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              
              {this.state.showDetails && (
                <div className="p-4 text-left bg-inset border-t border-default overflow-x-auto">
                  <pre className="text-[11px] font-mono text-error leading-relaxed whitespace-pre-wrap">
                    {this.state.error.name}: {this.state.error.message}
                    {this.state.error.stack && `\n\nStack trace:\n${this.state.error.stack}`}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
