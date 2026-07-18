import React, { useState } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  Key, 
  Github, 
  Gitlab, 
  ExternalLink, 
  Download, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  RefreshCw,
  Code
} from 'lucide-react';
import { cn } from '../../lib/utils';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';

const CodeBlock = ({ code, language = 'bash' }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group bg-inset border border-default rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-default">
        <span className="text-xs font-bold text-tertiary uppercase tracking-wider">{language}</span>
        <button 
          onClick={handleCopy}
          className="p-1.5 text-secondary hover:text-primary transition-colors"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-4 text-[11px] text-primary font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const CommandRow = ({ command, description }: { command: string; description: string }) => (
  <div className="flex items-center justify-between py-2 border-b border-default last:border-0 group">
    <code className="text-[11px] font-mono text-accent font-bold">{command}</code>
    <span className="text-[11px] text-secondary group-hover:text-primary transition-colors">{description}</span>
  </div>
);

export default function CLIReference() {
  const [token, setToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateToken = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setToken(`tr_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`);
      setIsGenerating(false);
    }, 1000);
  };

  const githubYaml = `name: Deploy to Torsor
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g @torsor/cli
      - run: torsor deploy --token \${{ secrets.TORSOR_TOKEN }}`;

  const gitlabYaml = `deploy:
  stage: deploy
  image: node:20
  script:
    - npm install -g @torsor/cli
    - torsor deploy --token $TORSOR_TOKEN
  only:
    - main`;

  return (
    <div className="space-y-10">
      {/* Installation */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Download size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Install Torsor CLI</h3>
        </div>
        
        <Tabs.Root defaultValue="npm">
          <Tabs.List className="flex gap-4 border-b border-default mb-4">
            {['npm', 'brew', 'curl'].map(method => (
              <Tabs.Trigger 
                key={method} 
                value={method}
                className="pb-2 text-[11px] font-bold text-secondary uppercase tracking-wider hover:text-primary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
              >
                {method}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="npm">
            <CodeBlock code="npm install -g @torsor/cli" />
          </Tabs.Content>
          <Tabs.Content value="brew">
            <CodeBlock code="brew install torsor-cli" />
          </Tabs.Content>
          <Tabs.Content value="curl">
            <CodeBlock code="curl -fsSL https://cli.torsor.app/install.sh | sh" />
          </Tabs.Content>
        </Tabs.Root>
      </section>

      {/* Commands */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Terminal size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Command Reference</h3>
        </div>
        <div className="bg-surface border border-default rounded-xl p-4 space-y-1">
          <CommandRow command="torsor login" description="Authenticate with your Torsor account" />
          <CommandRow command="torsor init" description="Initialize a new project in the current directory" />
          <CommandRow command="torsor dev" description="Start the local development server" />
          <CommandRow command="torsor deploy" description="Deploy the current project to the cloud" />
          <CommandRow command="torsor agent" description='Run the Torsor Agent (e.g. torsor agent "add login")' />
          <CommandRow command="torsor secrets set" description="Manage project environment variables" />
          <CommandRow command="torsor pull" description="Pull the latest changes from the cloud workspace" />
          <CommandRow command="torsor push" description="Push local changes to the cloud workspace" />
          <CommandRow command="torsor logs" description="Stream real-time deployment logs" />
          <CommandRow command="torsor test" description="Run the project's test suite" />
        </div>
      </section>

      {/* API Token */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Key size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">API Token</h3>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-primary">Personal Access Token</p>
            <p className="text-[11px] text-secondary">Used for CLI authentication and CI/CD integration.</p>
          </div>
          {token ? (
            <div className="flex items-center gap-2">
              <code className="bg-inset border border-default px-3 py-1.5 rounded-lg text-xs text-accent font-mono">
                {token.substring(0, 12)}••••••••••••••••
              </code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  // Show toast
                }}
                className="p-2 bg-elevated hover:bg-inset border border-default rounded-lg text-primary transition-all"
              >
                <Copy size={14} />
              </button>
              <button 
                onClick={generateToken}
                className="p-2 bg-elevated hover:bg-inset border border-default rounded-lg text-primary transition-all"
              >
                <RefreshCw size={14} className={cn(isGenerating && "animate-spin")} />
              </button>
            </div>
          ) : (
            <button 
              onClick={generateToken}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-accent/20 transition-all"
            >
              {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              Generate API Token
            </button>
          )}
        </div>
      </section>

      {/* CI/CD Integration */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">CI/CD Integration</h3>
        </div>
        
        <Tabs.Root defaultValue="github">
          <Tabs.List className="flex gap-4 border-b border-default mb-4">
            <Tabs.Trigger 
              value="github"
              className="flex items-center gap-2 pb-2 text-[11px] font-bold text-secondary uppercase tracking-wider hover:text-primary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
            >
              <Github size={14} /> GitHub Actions
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="gitlab"
              className="flex items-center gap-2 pb-2 text-[11px] font-bold text-secondary uppercase tracking-wider hover:text-primary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
            >
              <Gitlab size={14} /> GitLab CI
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="github">
            <p className="text-[11px] text-secondary mb-4">Add your API token as a secret named <code className="text-accent">TORSOR_TOKEN</code> in your GitHub repository settings.</p>
            <CodeBlock code={githubYaml} language="yaml" />
          </Tabs.Content>
          <Tabs.Content value="gitlab">
            <p className="text-[11px] text-secondary mb-4">Add your API token as a CI/CD variable named <code className="text-accent">TORSOR_TOKEN</code> in your GitLab project settings.</p>
            <CodeBlock code={gitlabYaml} language="yaml" />
          </Tabs.Content>
        </Tabs.Root>
      </section>
    </div>
  );
}
