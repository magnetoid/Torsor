import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MonitorPlay, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  ArrowRight, 
  Plus, 
  Trash2, 
  Settings, 
  ExternalLink, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Sparkles, 
  MessageSquare, 
  AlertCircle, 
  Image as ImageIcon, 
  ChevronDown, 
  History, 
  Search, 
  Loader2,
  MousePointer2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useTestingStore, TestStatus, TestStep, TestScenario, TestResult } from '../../stores/testingStore';
import { useLayoutStore } from '../../stores/layoutStore';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';

const MOCK_STEPS: Partial<TestStep>[] = [
  { description: 'Navigating to /login...', status: 'pass' },
  { description: 'Filling email field...', status: 'pass' },
  { description: 'Filling password field...', status: 'pass' },
  { description: 'Clicking Sign In...', status: 'pass' },
  { description: 'Verifying redirect to /dashboard...', status: 'pass' },
  { description: 'Checking dashboard metrics load...', status: 'pass' },
  { description: 'Opening project settings...', status: 'pass' },
  { description: 'Updating project name...', status: 'pass' },
  { description: 'Verifying name update in sidebar...', status: 'pass' },
  { description: 'Logging out...', status: 'pass' },
];

const BrowserViewport = ({ isRunning }: { isRunning: boolean }) => {
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const [highlightedEl, setHighlightedEl] = useState<string | null>(null);
  const stepIndex = useRef(0);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      // Simulate cursor movement to random positions or specific "elements"
      const newX = Math.random() * 80 + 10;
      const newY = Math.random() * 80 + 10;
      setCursorPos({ x: newX, y: newY });

      // Simulate click every few seconds
      if (Math.random() > 0.7) {
        setRipple({ x: newX, y: newY, id: Date.now() });
        setHighlightedEl(`el-${stepIndex.current}`);
        stepIndex.current = (stepIndex.current + 1) % 10;
        setTimeout(() => setRipple(null), 600);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isRunning]);

  return (
    <div className="relative w-full aspect-video bg-inset border border-default rounded-xl overflow-hidden shadow-2xl">
      {/* Browser Chrome */}
      <div className="h-8 bg-surface border-b border-default flex items-center px-3 gap-4">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-error" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning" />
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
        </div>
        <div className="flex-1 max-w-md h-5 bg-inset rounded border border-default flex items-center px-2">
          <span className="text-xs text-tertiary truncate">https://torsor-app-3000.preview.torsor.io/login</span>
        </div>
      </div>

      {/* App Content Mock */}
      <div className="p-8 space-y-6 opacity-40 grayscale pointer-events-none">
        <div className="flex items-center justify-between">
          <div className="w-24 h-6 bg-elevated rounded" />
          <div className="flex gap-4">
            <div className="w-12 h-4 bg-elevated rounded" />
            <div className="w-12 h-4 bg-elevated rounded" />
          </div>
        </div>
        <div className="max-w-sm mx-auto space-y-4 pt-12">
          <div className="h-8 bg-elevated rounded w-3/4 mx-auto" />
          <div className="h-10 bg-elevated rounded border border-default" />
          <div className="h-10 bg-elevated rounded border border-default" />
          <div className="h-10 bg-accent/30 rounded" />
        </div>
      </div>

      {/* Simulated Elements for Highlighting */}
      <div className="absolute inset-0 p-8 pt-16 pointer-events-none">
        <div className="max-w-sm mx-auto space-y-4 pt-12">
          <div className="h-8 w-3/4 mx-auto" />
          <div className={cn("h-10 rounded transition-all duration-300", highlightedEl === 'el-1' && "ring-2 ring-accent ring-offset-2 ring-offset-inset")} />
          <div className={cn("h-10 rounded transition-all duration-300", highlightedEl === 'el-2' && "ring-2 ring-accent ring-offset-2 ring-offset-inset")} />
          <div className={cn("h-10 rounded transition-all duration-300", highlightedEl === 'el-3' && "ring-2 ring-accent ring-offset-2 ring-offset-inset")} />
        </div>
      </div>

      {/* Cursor Simulation */}
      <motion.div 
        className="absolute z-50 pointer-events-none"
        animate={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      >
        <div className="relative">
          <MousePointer2 size={18} className="text-white drop-shadow-lg fill-black" />
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-error rounded-full shadow-lg shadow-error/80" />
        </div>
      </motion.div>

      {/* Click Ripple */}
      <AnimatePresence>
        {ripple && (
          <motion.div 
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            className="absolute w-4 h-4 bg-accent/40 rounded-full pointer-events-none z-40"
            style={{ left: `${ripple.x}%`, top: `${ripple.y}%`, transform: 'translate(-50%, -50%)' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const TestLog = ({ steps, elapsedTime }: { steps: TestStep[]; elapsedTime: number }) => (
  <div className="flex flex-col h-full bg-surface border-l border-default">
    <div className="h-10 px-4 flex items-center justify-between border-b border-default bg-elevated">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="text-accent animate-spin" />
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Test Log</span>
      </div>
      <div className="flex items-center gap-2 text-secondary">
        <Clock size={12} />
        <span className="text-xs font-mono">{elapsedTime}s elapsed</span>
      </div>
    </div>
    <ScrollArea.Root className="flex-1">
      <ScrollArea.Viewport className="h-full">
        <div className="p-4 space-y-3">
          {steps.map((step, i) => (
            <motion.div 
              key={step.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3 group"
            >
              <div className="flex flex-col items-center shrink-0">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center",
                  step.status === 'pass' ? "bg-success/10 text-success" : 
                  step.status === 'fail' ? "bg-error/10 text-error" : "bg-elevated text-tertiary"
                )}>
                  {step.status === 'pass' ? <CheckCircle2 size={12} /> : 
                   step.status === 'fail' ? <XCircle size={12} /> : <Loader2 size={12} className="animate-spin" />}
                </div>
                {i < steps.length - 1 && <div className="w-[1px] flex-1 bg-default my-1" />}
              </div>
              <div className="flex-1 pb-4">
                <p className="text-xs text-primary font-medium leading-tight">{step.description}</p>
                <p className="text-[9px] text-secondary mt-1">{new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                {step.screenshot && (
                  <div className="mt-2 w-24 aspect-video rounded border border-default overflow-hidden bg-inset group-hover:border-accent/30 transition-colors cursor-zoom-in">
                    <img src={step.screenshot} alt="Screenshot" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-0.5">
        <ScrollArea.Thumb className="bg-default rounded-full" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  </div>
);

export default function AppTestingTab() {
  const { 
    status, 
    startTest, 
    stopTest, 
    resetTest, 
    scenarios, 
    steps, 
    results, 
    elapsedTime, 
    tick, 
    completeTest 
  } = useTestingStore();

  const { openTab } = useLayoutStore();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // Simulation logic
  useEffect(() => {
    let timer: any;
    let stepInterval: any;

    if (status === 'running') {
      timer = setInterval(tick, 1000);
      
      let currentStep = 0;
      stepInterval = setInterval(() => {
        if (currentStep < MOCK_STEPS.length) {
          const mockStep = MOCK_STEPS[currentStep];
          const newStep: TestStep = {
            id: `step-${Date.now()}`,
            description: mockStep.description!,
            status: mockStep.status as any,
            timestamp: Date.now(),
            screenshot: Math.random() > 0.6 ? `https://picsum.photos/seed/step${currentStep}/200/112` : undefined
          };
          
          // Update steps in store (this is a bit hacky for a mock, real app would have a dedicated action)
          useTestingStore.setState(state => ({ steps: [...state.steps, newStep] }));
          currentStep++;
        } else {
          clearInterval(stepInterval);
          setTimeout(() => completeTest(Math.random() > 0.3), 1000);
        }
      }, 2000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(stepInterval);
    };
  }, [status]);

  if (status === 'idle') {
    return (
      <div className="flex flex-col h-full bg-page">
        <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <MonitorPlay size={16} className="text-accent" />
            <span className="text-xs font-bold text-primary">App Testing</span>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
            <MonitorPlay size={32} className="text-accent" />
          </div>
          <h2 className="text-2xl font-bold text-primary mb-3 tracking-tight">Test your app automatically</h2>
          <p className="text-secondary mb-8 leading-relaxed">
            Torsor Agent opens your app in a browser and tests it like a real user — clicking buttons, filling forms, and navigating pages to ensure everything works perfectly.
          </p>

          <div className="w-full grid grid-cols-1 gap-3 mb-8">
            {scenarios.map(scenario => (
              <button 
                key={scenario.id}
                onClick={() => setSelectedScenarioId(scenario.id)}
                className={cn(
                  "flex items-center justify-between p-4 rounded-xl border transition-all text-left group",
                  selectedScenarioId === scenario.id 
                    ? "bg-accent/10 border-accent/50" 
                    : "bg-surface border-default hover:border-tertiary/30"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    selectedScenarioId === scenario.id ? "bg-accent text-white" : "bg-elevated text-secondary group-hover:text-primary"
                  )}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-primary">{scenario.name}</h4>
                    <p className="text-[11px] text-secondary">{scenario.description}</p>
                  </div>
                </div>
                {selectedScenarioId === scenario.id && <CheckCircle2 size={16} className="text-accent" />}
              </button>
            ))}
          </div>

          <button 
            onClick={() => selectedScenarioId && startTest(selectedScenarioId)}
            disabled={!selectedScenarioId}
            className="flex items-center gap-2 px-8 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition-all"
          >
            <Play size={18} fill="currentColor" />
            Run App Test
          </button>
        </div>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="flex flex-col h-full bg-page">
        <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <MonitorPlay size={16} className="text-accent" />
            <span className="text-xs font-bold text-primary">Testing: {scenarios.find(s => s.id === selectedScenarioId)?.name}</span>
          </div>
          <button 
            onClick={stopTest}
            className="px-3 py-1.5 bg-error/10 text-error hover:bg-error/20 text-xs font-bold rounded-lg border border-error/20 transition-all"
          >
            Cancel Test
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Browser Viewport */}
          <div className="flex-[3] p-8 bg-inset flex items-center justify-center">
            <BrowserViewport isRunning={true} />
          </div>

          {/* Test Log */}
          <div className="flex-[2]">
            <TestLog steps={steps} elapsedTime={elapsedTime} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <MonitorPlay size={16} className="text-accent" />
          <span className="text-xs font-bold text-primary">Test Results</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={resetTest}
            className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-inset border border-default text-primary text-xs font-bold rounded-lg transition-all"
          >
            <RotateCcw size={14} />
            Run Again
          </button>
        </div>
      </header>

      <ScrollArea.Root className="flex-1">
        <ScrollArea.Viewport className="h-full">
          <div className="p-8 max-w-4xl mx-auto space-y-8">
            {/* Summary Card */}
            <div className="bg-surface border border-default rounded-xl p-8 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div className="relative w-24 h-24">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="48" cy="48" r="40" 
                      className="stroke-default fill-none" 
                      strokeWidth="8" 
                    />
                    <circle 
                      cx="48" cy="48" r="40" 
                      className={cn(
                        "fill-none transition-all duration-1000",
                        results?.passed === results?.total ? "stroke-success" : "stroke-warning"
                      )}
                      strokeWidth="8" 
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 * (1 - (results?.passed || 0) / (results?.total || 1))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-primary">{results?.passed}/{results?.total}</span>
                    <span className="text-xs font-bold text-secondary uppercase">Passed</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-1">
                    {results?.passed === results?.total ? 'All tests passed!' : 'Tests completed with issues'}
                  </h3>
                  <p className="text-sm text-secondary">
                    Completed in {results?.duration}s. {results?.total - (results?.passed || 0)} failures detected.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="px-4 py-2 bg-elevated rounded-xl border border-default text-center">
                  <p className="text-xs font-bold text-secondary uppercase">Duration</p>
                  <p className="text-lg font-bold text-primary">{results?.duration}s</p>
                </div>
                <div className="px-4 py-2 bg-elevated rounded-xl border border-default text-center">
                  <p className="text-xs font-bold text-secondary uppercase">Coverage</p>
                  <p className="text-lg font-bold text-primary">84%</p>
                </div>
              </div>
            </div>

            {/* Issues Section */}
            {results?.issues && results.issues.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-error" />
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Issues Detected</h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {results.issues.map(issue => (
                    <div key={issue.id} className="bg-surface border border-error/20 rounded-xl overflow-hidden flex">
                      <div className="w-1/3 aspect-video bg-inset border-r border-default">
                        <img src={issue.screenshot} alt="Failure" className="w-full h-full object-cover opacity-80" />
                      </div>
                      <div className="flex-1 p-6 flex flex-col justify-between">
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">{issue.title}</h4>
                          <p className="text-sm text-secondary leading-relaxed">{issue.description}</p>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-error uppercase bg-error/10 px-2 py-0.5 rounded border border-error/20">Critical</span>
                            <span className="text-xs text-secondary">Failed at step 4: Form Validation</span>
                          </div>
                          <button 
                            onClick={() => openTab('skills')}
                            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg shadow-lg shadow-accent/20 transition-all"
                          >
                            <Sparkles size={14} />
                            Fix with Agent
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Report */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <History size={16} className="text-accent" />
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Full Test Report</h3>
              </div>
              <div className="bg-surface border border-default rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-elevated border-b border-default">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold text-secondary uppercase tracking-wider">Step</th>
                      <th className="px-6 py-3 text-xs font-bold text-secondary uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-xs font-bold text-secondary uppercase tracking-wider text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default">
                    {steps.map((step, i) => (
                      <tr key={step.id} className="hover:bg-elevated/50 transition-colors group">
                        <td className="px-6 py-4 text-xs font-mono text-secondary">{i + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-primary">{step.description}</span>
                            {step.screenshot && (
                              <Tooltip.Provider>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <div className="w-6 h-6 rounded bg-inset border border-default flex items-center justify-center text-secondary hover:text-accent hover:border-accent/30 cursor-pointer">
                                      <ImageIcon size={12} />
                                    </div>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50">
                                      <img src={step.screenshot} alt="Step Screenshot" className="w-48 aspect-video object-cover rounded-lg" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold uppercase",
                            step.status === 'pass' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                          )}>
                            {step.status === 'pass' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {step.status}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-0.5">
          <ScrollArea.Thumb className="bg-default rounded-full" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
}
