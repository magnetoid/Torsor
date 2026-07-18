import React, { useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Play, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  Code, 
  FileText, 
  Terminal, 
  ShieldCheck, 
  BarChart3, 
  Github, 
  Check, 
  Copy, 
  ExternalLink,
  Loader2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTestStore, TestSuite, TestCase, FileCoverage } from '../../stores/testStore';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Switch from '@radix-ui/react-switch';
import * as Progress from '@radix-ui/react-progress';
import { Card } from '../shared/Card';
import { Badge } from '../shared/Badge';

const StatusIcon = ({ status, size = 14 }: { status: string; size?: number }) => {
  switch (status) {
    case 'passed': return <CheckCircle size={size} className="text-success" />;
    case 'failed': return <XCircle size={size} className="text-error" />;
    case 'skipped': return <AlertCircle size={size} className="text-warning" />;
    case 'running': return <Loader2 size={size} className="text-accent animate-spin" />;
    default: return <AlertCircle size={size} className="text-secondary" />;
  }
};

const CoverageBar = ({ value, color = 'emerald' }: { value: number; color?: string }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1 h-1.5 bg-inset rounded-full overflow-hidden">
      <div 
        className={cn(
          "h-full rounded-full transition-all duration-500",
          value >= 80 ? "bg-success" : value >= 60 ? "bg-warning" : "bg-error"
        )}
        style={{ width: `${value}%` }}
      />
    </div>
    <span className={cn(
      "text-xs font-bold w-8 text-right",
      value >= 80 ? "text-success" : value >= 60 ? "text-warning" : "text-error"
    )}>
      {value}%
    </span>
  </div>
);

export default function ValidationTab() {
  const { 
    isRunning, 
    framework, 
    globPattern, 
    setGlobPattern, 
    runTests, 
    results, 
    suites, 
    isCoverageEnabled, 
    toggleCoverage, 
    coverage, 
    coverageFiles, 
    ciConfig, 
    generateCIConfig, 
    fixTestWithAgent 
  } = useTestStore();

  const [expandedSuites, setExpandedSuites] = useState<string[]>(['suite-2', 'suite-4']);
  const [activeTab, setActiveTab] = useState<'tests' | 'coverage' | 'ci'>('tests');

  const toggleSuite = (id: string) => {
    setExpandedSuites(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-accent" />
            <span className="text-xs font-bold text-primary">Validation</span>
          </div>
          <Badge variant="accent" className="uppercase px-2 py-0.5 text-xs font-bold rounded">
            {framework}
          </Badge>
          <div className="relative">
            <Code size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
            <input 
              type="text" 
              value={globPattern}
              onChange={(e) => setGlobPattern(e.target.value)}
              className="bg-page border border-default rounded-lg pl-8 pr-3 py-1 text-xs text-primary font-mono focus:border-accent outline-none w-64"
            />
          </div>
        </div>

        <button 
          onClick={runTests}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all focus-ring shadow-lg shadow-accent/20"
        >
          {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run Tests
        </button>
      </header>

      {/* Results Summary */}
      {results && (
        <div className="px-4 py-3 border-b border-default bg-page flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs font-bold text-primary">{results.passed} Passed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-error" />
              <span className="text-xs font-bold text-primary">{results.failed} Failed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-xs font-bold text-primary">{results.skipped} Skipped</span>
            </div>
            <div className="w-[1px] h-4 bg-default" />
            <span className="text-xs text-secondary font-medium">{results.total} Total Tests</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary uppercase font-bold">Coverage</span>
              <Switch.Root 
                checked={isCoverageEnabled}
                onCheckedChange={toggleCoverage}
                className={cn(
                  "w-8 h-4 rounded-full relative transition-colors outline-none focus-ring",
                  isCoverageEnabled ? "bg-accent" : "bg-inset"
                )}
              >
                <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Test Tree */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Test Results</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('tests')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all focus-ring",
                    activeTab === 'tests' ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
                  )}
                >
                  Suites
                </button>
                <button 
                  onClick={() => setActiveTab('coverage')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all focus-ring",
                    activeTab === 'coverage' ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
                  )}
                >
                  Coverage
                </button>
                <button 
                  onClick={() => setActiveTab('ci')}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all focus-ring",
                    activeTab === 'ci' ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
                  )}
                >
                  CI Config
                </button>
              </div>
            </div>

            {activeTab === 'tests' && (
              <div className="space-y-2">
                {suites.map(suite => (
                  <Collapsible.Root 
                    key={suite.id} 
                    open={expandedSuites.includes(suite.id)}
                    onOpenChange={() => toggleSuite(suite.id)}
                    className="bg-surface border border-default rounded-xl overflow-hidden"
                  >
                    <Collapsible.Trigger className="w-full flex items-center justify-between p-3 hover:bg-elevated transition-all group outline-none">
                      <div className="flex items-center gap-3">
                        <StatusIcon status={suite.status} />
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-secondary" />
                          <span className="text-xs font-bold text-primary">{suite.file}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-secondary font-medium">
                          {suite.tests.filter(t => t.status === 'passed').length}/{suite.tests.length} passed
                        </span>
                        {expandedSuites.includes(suite.id) ? <ChevronDown size={14} className="text-secondary" /> : <ChevronRight size={14} className="text-secondary" />}
                      </div>
                    </Collapsible.Trigger>
                    
                    <Collapsible.Content className="border-t border-default bg-page/50">
                      <div className="p-2 space-y-1">
                        {suite.tests.map(test => (
                          <div key={test.id} className="flex flex-col">
                            <div className="flex items-center justify-between p-2 hover:bg-surface rounded-lg transition-all group cursor-pointer hover-lift">
                              <div className="flex items-center gap-3">
                                <StatusIcon status={test.status} size={12} />
                                <span className={cn(
                                  "text-xs",
                                  test.status === 'failed' ? "text-error font-medium" : "text-primary"
                                )}>
                                  {test.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {test.duration && (
                                  <div className="flex items-center gap-1 text-xs text-secondary">
                                    <Clock size={10} />
                                    {test.duration}
                                  </div>
                                )}
                                <button className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-accent transition-all focus-ring">
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            </div>
                            
                            {test.status === 'failed' && test.error && (
                              <div className="ml-8 mr-4 mb-3 p-3 bg-error/5 border border-error/20 rounded-lg space-y-3">
                                <div className="font-mono text-xs text-error whitespace-pre-wrap">
                                  {test.error.message}
                                </div>
                                {test.error.stack && (
                                  <div className="font-mono text-xs text-secondary whitespace-pre-wrap border-t border-error/10 pt-2">
                                    {test.error.stack}
                                  </div>
                                )}
                                <button 
                                  onClick={() => fixTestWithAgent(test.id)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-error hover:bg-error text-white text-xs font-bold rounded-md transition-all focus-ring"
                                >
                                  <Sparkles size={12} />
                                  Fix with Agent
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                ))}
              </div>
            )}

            {activeTab === 'coverage' && isCoverageEnabled && coverage && (
              <div className="space-y-6">
                {/* Coverage Summary */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Statements', value: coverage.statements },
                    { label: 'Branches', value: coverage.branches },
                    { label: 'Functions', value: coverage.functions },
                    { label: 'Lines', value: coverage.lines },
                  ].map(stat => (
                    <Card key={stat.label}>
                      <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">{stat.label}</p>
                      <CoverageBar value={stat.value} />
                    </Card>
                  ))}
                </div>

                {/* File Table */}
                <Card className="overflow-hidden p-0">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-default bg-elevated/50">
                        <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">File</th>
                        <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Statements</th>
                        <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Branches</th>
                        <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Functions</th>
                        <th className="px-4 py-2 text-xs font-bold text-secondary uppercase tracking-wider">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageFiles.map(file => (
                        <tr key={file.file} className="border-b border-default/50 hover:bg-elevated/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-primary font-medium">{file.file}</td>
                          <td className="px-4 py-3"><CoverageBar value={file.statements} /></td>
                          <td className="px-4 py-3"><CoverageBar value={file.branches} /></td>
                          <td className="px-4 py-3"><CoverageBar value={file.functions} /></td>
                          <td className="px-4 py-3"><CoverageBar value={file.lines} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {activeTab === 'ci' && (
              <div className="space-y-4">
                <Card className="text-center p-6">
                  <div className="w-12 h-12 rounded-xl bg-page border border-default flex items-center justify-center mx-auto mb-4">
                    <Github size={24} className="text-accent" />
                  </div>
                  <h4 className="text-sm font-bold text-primary mb-1">CI Readiness</h4>
                  <p className="text-xs text-secondary mb-6 max-w-sm mx-auto">
                    Automate your testing and validation on every push. We'll generate a GitHub Actions workflow tailored to your project.
                  </p>
                  <button 
                    onClick={generateCIConfig}
                    className="px-6 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-accent/20 focus-ring"
                  >
                    Generate CI Config
                  </button>
                </Card>

                {ciConfig && (
                  <Card className="overflow-hidden p-0 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="px-4 py-2 bg-elevated border-b border-default flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-secondary" />
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">.github/workflows/test.yml</span>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-1.5 text-secondary hover:text-primary transition-colors focus-ring">
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-page font-mono text-xs text-secondary leading-relaxed overflow-x-auto">
                      <pre>{ciConfig}</pre>
                    </div>
                    <div className="px-4 py-3 bg-elevated border-t border-default flex justify-end">
                      <button className="px-4 py-1.5 bg-success hover:bg-success text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2 focus-ring">
                        <Check size={14} />
                        Apply Config
                      </button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
