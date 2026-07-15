/**
 * README: ArrayIDE State Management & Data Flow
 * 
 * This Zustand store powers both 'builder' and 'ide' modes, acting as the single source of truth.
 * 
 * Data Flow Between Modes:
 * 1. Mode Switching: `mode` state toggles the UI between the conversational Builder and the full IDE.
 *    `previousMode` allows for back-navigation. State is persisted to localStorage.
 * 2. Agent State: The 6 core agents (Orchestrator, Architect, Executor, Reasoner, Worker, Scout) 
 *    maintain their status, logs, and token usage across both modes. You can view their activity 
 *    in the Builder's chat or the IDE's AgentPanel.
 * 3. Chat State (Builder): Manages the conversation history. `simulateBuilderFlow` orchestrates 
 *    a mock sequence of agent interactions, updating agent statuses and triggering a build.
 * 4. File State (IDE): Manages the virtual file system. Files created or modified by agents in 
 *    Builder mode are immediately available in the IDE's file tree and editor tabs.
 * 5. Build State: Tracks the status of the preview build (idle, building, success, error), 
 *    shared between the Builder's preview panel and the IDE's terminal/status bars.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useErrorStore } from './stores/errorStore';
import { apiRequest } from './lib/api';

// --- Types ---

export type AppMode = 'builder' | 'ide';
export type AgentRole = 'orchestrator' | 'architect' | 'executor' | 'reasoner' | 'worker' | 'scout';
export type AgentStatus = 'idle' | 'thinking' | 'running' | 'done' | 'error';
export type EconomyMode = 'economy' | 'balanced' | 'max-power';

export interface LogEntry {
  timestamp: number;
  text: string;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask: string;
  tokensUsed: number;
  tokenLimit: number;
  outputLog: LogEntry[];
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export type MessageRole = 'user' | 'orchestrator' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  timestamp: number;
  type?: 'text' | 'insight' | 'comparison' | 'terminal' | 'error-card' | 'error-fix' | 'error-prevention';
  terminal?: {
    command: string;
    output: string[];
    exitCode?: number;
    isStreaming?: boolean;
  };
  comparisonData?: {
    models: {
      name: string;
      dotColor: string;
      content: string;
      metrics: { time: string; tokens: string; cost: string };
    }[];
  };
  metadata?: any;
}

export type FileType = 'file' | 'folder';

export interface FileNode {
  id: string;
  name: string;
  type: FileType;
  parentId: string | null;
  content?: string;
  extension?: string;
}

export type BuildStatus = 'idle' | 'building' | 'success' | 'error';
export type DeployStatus = 'idle' | 'building' | 'success' | 'error';

export interface DeployEntry {
  id: string;
  status: 'success' | 'error' | 'building';
  target: 'Vercel' | 'Netlify' | 'Coolify' | 'Custom';
  environment: 'Preview' | 'Staging' | 'Production';
  duration: string;
  commit: string;
  timestamp: string;
  url: string;
  logs: string[];
}

// --- Initial State ---

const INITIAL_AGENTS: Agent[] = [
  { id: '1', name: 'Opus 4.6', role: 'orchestrator', status: 'idle', currentTask: 'Awaiting instructions.', tokensUsed: 0, tokenLimit: 8192, outputLog: [] },
  { id: '2', name: 'Sonnet 4.6', role: 'architect', status: 'idle', currentTask: 'Awaiting architectural tasks.', tokensUsed: 0, tokenLimit: 8192, outputLog: [] },
  { id: '3', name: 'GPT-5.3 Codex', role: 'executor', status: 'idle', currentTask: 'Awaiting execution commands.', tokensUsed: 0, tokenLimit: 4096, outputLog: [] },
  { id: '4', name: 'DeepSeek R1', role: 'reasoner', status: 'idle', currentTask: 'Awaiting complex algorithmic tasks.', tokensUsed: 0, tokenLimit: 8192, outputLog: [] },
  { id: '5', name: 'DeepSeek V3.2', role: 'worker', status: 'idle', currentTask: 'Awaiting implementation tasks.', tokensUsed: 0, tokenLimit: 8192, outputLog: [] },
  { id: '6', name: 'Kimi K2 Thinking', role: 'scout', status: 'idle', currentTask: 'Awaiting research tasks.', tokensUsed: 0, tokenLimit: 4096, outputLog: [] }
];

const INITIAL_MODELS: Record<AgentRole, string> = {
  orchestrator: 'claude-3-opus',
  architect: 'claude-3-sonnet',
  executor: 'gpt-5',
  reasoner: 'deepseek-reasoner',
  worker: 'deepseek-worker',
  scout: 'kimi-k2'
};

const INITIAL_FILES: FileNode[] = [];

const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Build me a modern landing page for a SaaS product called "Array". It should have a dark theme, a hero section with a glowing gradient, and a features grid.',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'msg-2',
    role: 'orchestrator',
    agentId: '1',
    content: 'I will orchestrate the creation of the "Array" SaaS landing page. I am breaking this down into three tasks:\n\n1. **Design & Structure**: The Architect will plan the component hierarchy and Tailwind theme.\n2. **Implementation**: The Worker will build the React components (Hero, Features, Footer).\n3. **Setup**: The Executor will ensure dependencies like `lucide-react` and `framer-motion` are installed.',
    timestamp: Date.now() - 55000,
  }
];

// --- Store Definition ---

interface AppState {
  // 1. MODE STATE
  mode: AppMode;
  previousMode: AppMode | null;
  setMode: (mode: AppMode) => void;

  // 2. AGENT STATE
  agents: Agent[];
  activeModels: Record<AgentRole, string>;
  agentMessages: AgentMessage[];
  updateAgentStatus: (role: AgentRole, status: AgentStatus) => void;
  appendAgentOutput: (role: AgentRole, text: string) => void;
  assignTask: (role: AgentRole, task: string) => void;
  broadcastTask: (task: string) => void;
  resetAllAgents: () => void;

  // 3. CHAT STATE
  messages: ChatMessage[];
  isOrchestratorThinking: boolean;
  sendUserMessage: (text: string, targetAgent?: string) => void;
  appendSystemMessage: (agentId: string, text: string) => void;
  clearChat: () => void;
  simulateBuilderFlow: (prompt: string) => Promise<void>;

  // 4. FILE STATE
  files: FileNode[];
  openTabs: string[];
  activeTab: string | null;
  /** Populate the file tree from a project's real workspace (WorkspaceRuntime). Makes
   *  files the agent creates visible in the IDE. */
  loadWorkspaceFiles: (projectId: string) => Promise<void>;
  openFile: (id: string) => void;
  closeTab: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  createFile: (name: string, type: FileType, parentId: string | null) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  duplicateFile: (id: string) => void;

  // 5. BUILD STATE
  buildStatus: BuildStatus;
  buildTime: number;
  filesGenerated: number;
  totalTokens: number;
  previewUrl: string;
  isPreviewOpen: boolean;
  triggerBuild: () => void;
  setBuildSuccess: (time: number, filesCount: number) => void;
  setBuildError: () => void;
  togglePreview: (force?: boolean) => void;

  // 7. DEPLOY STATE
  deployStatus: DeployStatus;
  deployProgress: number;
  deployLogs: string[];
  deployHistory: DeployEntry[];
  startDeploy: (target: string, env: string, branch: string) => Promise<void>;
  rollbackDeploy: (id: string) => void;

  // 6. SETTINGS
  parallelLimit: number;
  autoRoute: boolean;
  economyMode: EconomyMode;
  setEconomyMode: (mode: EconomyMode) => void;
  apiKeys: Record<string, string>;
  setApiKeys: (keys: Record<string, string>) => void;

  // 8. MAX POWER FEATURES
  consensusState: {
    active: boolean;
    models: string[];
    agreement: number;
    status: 'running' | 'agreed' | 'disagreed';
    diff?: { left: string; right: string };
  } | null;
  setConsensusState: (state: AppState['consensusState']) => void;
  taskCount: number;
  // 9. TERMINAL STATE
  isTerminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  // 10. DATABASE STATE
  isDatabaseOpen: boolean;
  setDatabaseOpen: (open: boolean) => void;
  // 11. CONFIG CARDS
  activeConfigCard: 'secrets' | 'packages' | 'config' | null;
  setActiveConfigCard: (card: 'secrets' | 'packages' | 'config' | null) => void;
  // 12. BILLING MODAL
  isBillingModalOpen: boolean;
  setBillingModalOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 9. TERMINAL STATE
      isTerminalOpen: false,
      setTerminalOpen: (open) => set({ isTerminalOpen: open }),
      taskCount: 0,

      // 10. DATABASE STATE
      isDatabaseOpen: false,
      setDatabaseOpen: (open) => set({ isDatabaseOpen: open }),

      // 11. CONFIG CARDS
      activeConfigCard: null,
      setActiveConfigCard: (card) => set({ activeConfigCard: card }),

      // 12. BILLING MODAL
      isBillingModalOpen: false,
      setBillingModalOpen: (open) => set({ isBillingModalOpen: open }),

      // 1. MODE STATE
      mode: 'builder',
      previousMode: null,
      setMode: (mode) => set((state) => ({ previousMode: state.mode, mode })),

      // 2. AGENT STATE
      agents: INITIAL_AGENTS,
      activeModels: INITIAL_MODELS,
      agentMessages: [],
      updateAgentStatus: (role, status) => set((state) => ({
        agents: state.agents.map(a => a.role === role ? { ...a, status } : a)
      })),
      appendAgentOutput: (role, text) => set((state) => {
        const tokensAdded = Math.floor(Math.random() * 20) + 5;
        return {
          agents: state.agents.map(a => {
            if (a.role === role) {
              return {
                ...a,
                outputLog: [...a.outputLog, { timestamp: Date.now(), text }],
                tokensUsed: Math.min(a.tokensUsed + tokensAdded, a.tokenLimit)
              };
            }
            return a;
          }),
          totalTokens: state.totalTokens + tokensAdded
        };
      }),
      assignTask: (role, task) => set((state) => ({
        agents: state.agents.map(a => a.role === role ? { ...a, currentTask: task } : a)
      })),
      broadcastTask: (task) => {
        get().simulateBuilderFlow(task);
      },
      resetAllAgents: () => set((state) => ({
        agents: state.agents.map(a => ({
          ...a,
          status: 'idle',
          currentTask: 'Awaiting instructions.',
          outputLog: [],
          tokensUsed: 0
        }))
      })),

      // 3. CHAT STATE
      messages: INITIAL_CHAT_MESSAGES,
      isOrchestratorThinking: false,
      sendUserMessage: (text, targetAgent) => set((state) => {
        const isDbCommand = text.toLowerCase().includes('show database') || text.toLowerCase().includes('open database');
        
        if (text.toLowerCase().includes('git log') || text.toLowerCase().includes('show commits')) {
          setTimeout(() => {
            set((s) => ({
              messages: [...s.messages, {
                id: `git-log-${Date.now()}`,
                role: 'system',
                agentId: 'executor',
                content: 'Showing git log',
                timestamp: Date.now(),
                type: 'text'
              }]
            }));
          }, 500);
        }

        if (text.toLowerCase() === 'commit') {
          get().simulateBuilderFlow('Commit changes');
        }

        if (text.toLowerCase() === 'push') {
          get().simulateBuilderFlow('Push to origin');
        }

        if (text.toLowerCase().includes('connect github')) {
          setTimeout(() => {
            set((s) => ({
              messages: [...s.messages, {
                id: `github-conn-${Date.now()}`,
                role: 'system',
                agentId: 'orchestrator',
                content: 'Connect to GitHub',
                timestamp: Date.now(),
                type: 'text'
              }]
            }));
          }, 500);
        }

        if (text.toLowerCase().includes('trigger error')) {
          setTimeout(() => {
            const { addError } = useErrorStore.getState();
            addError({
              type: 'Runtime Error',
              message: "Cannot read properties of undefined (reading 'user')",
              file: 'src/components/Auth.tsx',
              line: 42,
              stack: "TypeError: Cannot read properties of undefined (reading 'user')\n    at AuthComponent (Auth.tsx:42:15)\n    at renderWithHooks (react-dom.development.js:16305:18)\n    at mountIndeterminateComponent (react-dom.development.js:20074:13)\n    at beginWork (react-dom.development.js:21587:16)"
            });
          }, 1000);
        }

        return {
          isDatabaseOpen: isDbCommand ? true : state.isDatabaseOpen,
          isPreviewOpen: isDbCommand ? false : state.isPreviewOpen,
          messages: [...state.messages, {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            agentId: targetAgent,
            timestamp: Date.now()
          }]
        };
      }),
      appendSystemMessage: (agentId, text) => set((state) => ({
        messages: [...state.messages, {
          id: Date.now().toString(),
          role: 'system',
          content: text,
          agentId,
          timestamp: Date.now()
        }]
      })),
      clearChat: () => set({ messages: [] }),
      simulateBuilderFlow: async (prompt) => {
        const { sendUserMessage, appendSystemMessage, triggerBuild, setBuildSuccess, updateAgentStatus, assignTask, appendAgentOutput, economyMode, setConsensusState, taskCount } = get();
        
        // a. Adds user message
        sendUserMessage(prompt);
        
        // b. Sets orchestrator thinking (1.5s)
        set({ isOrchestratorThinking: true });
        updateAgentStatus('orchestrator', 'thinking');
        assignTask('orchestrator', 'Analyzing user request...');
        
        await new Promise(r => setTimeout(r, 1500));
        set({ isOrchestratorThinking: false });
        updateAgentStatus('orchestrator', 'running');
        appendAgentOutput('orchestrator', 'Decomposing task into subtasks.');

        // If Max Power mode, run consensus on the first major task
        if (economyMode === 'max-power') {
          setConsensusState({
            active: true,
            models: ['Claude 3.5 Opus', 'DeepSeek R1'],
            agreement: 0,
            status: 'running'
          });

          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const agreement = Math.floor(Math.random() * (98 - 70 + 1)) + 70;
          const status = agreement > 85 ? 'agreed' : 'disagreed';
          
          setConsensusState({
            active: true,
            models: ['Claude 3.5 Opus', 'DeepSeek R1'],
            agreement,
            status,
            diff: status === 'disagreed' ? {
              left: "const config = {\n  theme: 'dark',\n  animations: true\n};",
              right: "const config = {\n  theme: 'dark',\n  animations: false,\n  gpuAcceleration: true\n};"
            } : undefined
          });

          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // c. Posts 3 system messages from different agents with 0.8s gaps
        const subtasks = [
          { role: 'architect' as AgentRole, msg: 'Architect assigned: Design component hierarchy.' },
          { role: 'worker' as AgentRole, msg: 'Worker assigned: Implement React components.' },
          { role: 'executor' as AgentRole, msg: 'Executor assigned: Setup build tools.' }
        ];
        
        for (const st of subtasks) {
          updateAgentStatus(st.role, 'thinking');
          assignTask(st.role, st.msg);
          appendSystemMessage(st.role, `→ ${st.msg}`);
          await new Promise(r => setTimeout(r, 800));
          updateAgentStatus(st.role, 'running');
          appendAgentOutput(st.role, `Executing: ${st.msg}`);
        }

        // Check for database needs
        const dbKeywords = ['database', 'auth', 'user data', 'store', 'blog', 'posts', 'comments'];
        const needsDb = dbKeywords.some(kw => prompt.toLowerCase().includes(kw));

        if (needsDb) {
          appendSystemMessage('orchestrator', "This needs a database. I'll set up Supabase for you.");
          await new Promise(r => setTimeout(r, 1000));
          
          set((state) => ({
            messages: [...state.messages, {
              id: `db-setup-${Date.now()}`,
              role: 'system',
              agentId: 'executor',
              content: '⟳ Provisioning database...',
              timestamp: Date.now(),
              type: 'text'
            }]
          }));

          await new Promise(r => setTimeout(r, 2000));

          set((state) => ({
            messages: [...state.messages.filter(m => !m.content.includes('Provisioning')), {
              id: `db-ready-${Date.now()}`,
              role: 'system',
              agentId: 'executor',
              content: 'Database ready',
              timestamp: Date.now(),
              type: 'text',
              terminal: {
                command: 'supabase init',
                output: ['Project URL: https://xyz.supabase.co', 'Anon Key: eyJhbG... (masked)', 'Service Key: eyJhbG... (masked)'],
                exitCode: 0
              }
            }]
          }));
        }

        // Check for secrets needs
        if (prompt.toLowerCase().includes('stripe') || prompt.toLowerCase().includes('api key')) {
          await new Promise(r => setTimeout(r, 1500));
          set((state) => ({
            messages: [...state.messages, {
              id: `secret-req-${Date.now()}`,
              role: 'orchestrator',
              content: "I'll need your Stripe API key to proceed with the payment integration. Add it to secrets?",
              timestamp: Date.now(),
              type: 'insight'
            }]
          }));
        }

        // Check for package installs
        if (prompt.toLowerCase().includes('install') || prompt.toLowerCase().includes('add package')) {
          await new Promise(r => setTimeout(r, 1000));
          set((state) => ({
            messages: [...state.messages, {
              id: `pkg-work-${Date.now()}`,
              role: 'system',
              agentId: 'executor',
              content: '↕ Added 3 packages: prisma, @prisma/client, zod',
              timestamp: Date.now(),
              type: 'text'
            }]
          }));
        }

        // Add terminal blocks
        set((state) => ({
          messages: [...state.messages, {
            id: `term-${Date.now()}`,
            role: 'system',
            agentId: 'executor',
            content: prompt.toLowerCase().includes('push') ? 'Pushing to origin...' : 'Installing dependencies...',
            timestamp: Date.now(),
            type: 'terminal',
            terminal: {
              command: prompt.toLowerCase().includes('push') ? 'git push origin main' : 'npm install',
              output: prompt.toLowerCase().includes('push')
                ? ['⟳ Pushing to origin/main...', '✓ Pushed 3 commits to origin/main']
                : [
                  'added 142 packages, and audited 143 packages in 2s',
                  'found 0 vulnerabilities'
                ],
              exitCode: 0
            }
          }]
        }));

        // Auto-commit after successful build
        if (!prompt.toLowerCase().includes('push') && !prompt.toLowerCase().includes('commit')) {
          await new Promise(r => setTimeout(r, 1000));
          const commitMsg = `✓ Committed: ${prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt}`;
          set((state) => ({
            messages: [...state.messages, {
              id: `git-auto-${Date.now()}`,
              role: 'system',
              agentId: 'executor',
              content: commitMsg,
              timestamp: Date.now(),
              type: 'text'
            }]
          }));
        } else if (prompt.toLowerCase().includes('commit')) {
          await new Promise(r => setTimeout(r, 500));
          set((state) => ({
            messages: [...state.messages, {
              id: `git-manual-${Date.now()}`,
              role: 'system',
              agentId: 'executor',
              content: '✓ Committed: Manual update',
              timestamp: Date.now(),
              type: 'text'
            }]
          }));
        }
        await new Promise(r => setTimeout(r, 1000));

        set((state) => ({
          messages: [...state.messages, {
            id: `term-dev-${Date.now()}`,
            role: 'system',
            agentId: 'executor',
            content: 'Starting dev server...',
            timestamp: Date.now(),
            type: 'terminal',
            terminal: {
              command: 'npm run dev',
              output: [
                '> dev',
                '> vite',
                '',
                '  VITE v6.0.0  ready in 128 ms',
                '',
                '  ➜  Local:   http://localhost:3000/',
                '  ➜  Network: use --host to expose'
              ],
              isStreaming: true
            }
          }]
        }));
        await new Promise(r => setTimeout(r, 1000));
        
        // d. Posts orchestrator reply
        set((state) => ({
          messages: [...state.messages, {
            id: Date.now().toString(),
            role: 'orchestrator',
            content: `I've broken down the task. The Architect is planning the structure, the Worker is building the components, and the Executor is setting up the environment.`,
            timestamp: Date.now()
          }]
        }));
        
        // e. Triggers a fake "build" that updates build stats
        triggerBuild();
        
        await new Promise(r => setTimeout(r, 2000));
        
        // Complete agents
        ['orchestrator', 'architect', 'worker', 'executor'].forEach(role => {
          updateAgentStatus(role as AgentRole, 'done');
          assignTask(role as AgentRole, 'Task completed successfully.');
          appendAgentOutput(role as AgentRole, 'Done.');
        });
        
        // f. Sets preview as "ready"
        setBuildSuccess(3.2, 12);

        // g. Randomly trigger a build error if not in Max Power mode
        if (economyMode !== 'max-power' && Math.random() > 0.8) {
          setTimeout(() => {
            const { addError } = useErrorStore.getState();
            addError({
              type: 'Build Error',
              message: "Module not found: Can't resolve './components/AuthLanding' in '/src'",
              file: 'src/App.tsx',
              line: 3,
              stack: "Error: Module not found: Can't resolve './components/AuthLanding' in '/src'\n    at resolveModule (webpack/lib/Resolver.js:42:12)\n    at handleBuild (webpack/lib/Compiler.js:156:8)"
            });
            set({ buildStatus: 'error' });
          }, 500);
        }

        // Create some mock files if none exist
        if (get().files.length === 0) {
          get().createFile('App.tsx', 'file', null);
          get().createFile('index.css', 'file', null);
          get().createFile('utils.ts', 'file', null);
        }

        // Update task count and check for insights
        const newCount = taskCount + 1;
        set({ taskCount: newCount });

        if (newCount % 5 === 0) {
          set((state) => ({
            messages: [...state.messages, {
              id: `insight-${Date.now()}`,
              role: 'orchestrator',
              agentId: '1',
              content: '📊 Model performance this session: Claude Sonnet won 4/5 code tasks, Gemini Flash handled 8 quick tasks. Saved $0.02 vs Max Power mode.',
              timestamp: Date.now(),
              type: 'insight'
            }]
          }));
        }
      },

      // 4. FILE STATE
      files: INITIAL_FILES,
      openTabs: [],
      activeTab: null,
      loadWorkspaceFiles: async (projectId) => {
        try {
          const base = `/api/v1/projects/${projectId}/workspace/files`;
          type Entry = { name: string; path: string; isDir: boolean };
          const nodes: FileNode[] = [];
          // Bounded BFS over the workspace directory tree; a node's id is its path and its
          // parentId is the containing directory's path (null at the root).
          const queue: string[] = [''];
          let visited = 0;
          while (queue.length > 0 && visited < 300) {
            const dir = queue.shift() as string;
            const q = dir ? `?path=${encodeURIComponent(dir)}` : '';
            const data = await apiRequest<{ items: Entry[] }>(`${base}${q}`, { auth: true });
            visited++;
            for (const e of data.items ?? []) {
              const ext = !e.isDir && e.name.includes('.') ? e.name.split('.').pop() : undefined;
              nodes.push({
                id: e.path,
                name: e.name,
                type: e.isDir ? 'folder' : 'file',
                parentId: dir === '' ? null : dir,
                extension: ext,
              });
              if (e.isDir) queue.push(e.path);
            }
          }
          set({ files: nodes });
        } catch {
          // No workspace yet, or a backend without the runtime capability: leave files as-is.
        }
      },
      openFile: (id) => set((state) => {
        const isOpen = state.openTabs.includes(id);
        return {
          openTabs: isOpen ? state.openTabs : [...state.openTabs, id],
          activeTab: id
        };
      }),
      closeTab: (id) => set((state) => {
        const newTabs = state.openTabs.filter(t => t !== id);
        return {
          openTabs: newTabs,
          activeTab: state.activeTab === id ? (newTabs[newTabs.length - 1] || null) : state.activeTab
        };
      }),
      updateFileContent: (id, content) => set((state) => ({
        files: state.files.map(f => f.id === id ? { ...f, content } : f)
      })),
      createFile: (name, type, parentId) => set((state) => {
        const ext = name.split('.').pop();
        const newFile: FileNode = {
          id: `file-${Date.now()}`,
          name,
          type,
          parentId,
          extension: type === 'file' ? ext : undefined,
          content: type === 'file' ? '' : undefined
        };
        return { files: [...state.files, newFile] };
      }),
      deleteFile: (id) => set((state) => {
        const getIdsToDelete = (targetId: string): string[] => {
          const children = state.files.filter(f => f.parentId === targetId).map(f => f.id);
          return [targetId, ...children.flatMap(getIdsToDelete)];
        };
        const idsToDelete = getIdsToDelete(id);
        const newTabs = state.openTabs.filter(t => !idsToDelete.includes(t));
        
        return {
          files: state.files.filter(f => !idsToDelete.includes(f.id)),
          openTabs: newTabs,
          activeTab: idsToDelete.includes(state.activeTab!) ? (newTabs[newTabs.length - 1] || null) : state.activeTab
        };
      }),
      renameFile: (id, newName) => set((state) => {
        const ext = newName.split('.').pop();
        return {
          files: state.files.map(f => f.id === id ? { ...f, name: newName, extension: f.type === 'file' ? ext : undefined } : f)
        };
      }),
      duplicateFile: (id) => set((state) => {
        const file = state.files.find(f => f.id === id);
        if (!file || file.type === 'folder') return state;
        
        const nameParts = file.name.split('.');
        const ext = nameParts.pop();
        const baseName = nameParts.join('.');
        const newName = `${baseName} (copy).${ext}`;
        
        const newFile: FileNode = {
          ...file,
          id: `file-${Date.now()}`,
          name: newName,
        };
        
        return { files: [...state.files, newFile] };
      }),

      // 5. BUILD STATE
      buildStatus: 'idle',
      buildTime: 0,
      filesGenerated: 0,
      totalTokens: 0,
      previewUrl: 'https://ais-pre-xoupfcetkt32dm5uetga6k-107535744547.europe-west1.run.app',
      isPreviewOpen: true,
      triggerBuild: () => set({ buildStatus: 'building' }),
      setBuildSuccess: (time, filesCount) => set({
        buildStatus: 'success',
        buildTime: time,
        filesGenerated: filesCount,
        previewUrl: 'https://ais-pre-xoupfcetkt32dm5uetga6k-107535744547.europe-west1.run.app'
      }),
      setBuildError: () => set({ buildStatus: 'error' }),
      togglePreview: (force) => set((state) => ({ 
        isPreviewOpen: force !== undefined ? force : !state.isPreviewOpen 
      })),

      // 7. DEPLOY STATE
      deployStatus: 'idle',
      deployProgress: 0,
      deployLogs: [],
      deployHistory: [
        {
          id: 'dep-1',
          status: 'success',
          target: 'Vercel',
          environment: 'Production',
          duration: '42s',
          commit: 'a1b2c3d',
          timestamp: '2 hours ago',
          url: 'https://tesseract-demo.vercel.app',
          logs: ['→ Installing dependencies...', '✓ 200 OK']
        },
        {
          id: 'dep-2',
          status: 'error',
          target: 'Netlify',
          environment: 'Staging',
          duration: '15s',
          commit: 'f5e4d3c',
          timestamp: '5 hours ago',
          url: '',
          logs: ['→ Building application...', 'error: Build failed']
        }
      ],
      startDeploy: async (target, env, branch) => {
        set({ deployStatus: 'building', deployProgress: 0, deployLogs: [] });
        
        const logs = [
          "→ Installing dependencies...",
          "  added 847 packages in 12s",
          "→ Building application...",
          "  ✓ 23 modules transformed",
          "  ✓ Bundle size: 142kb (gzipped: 48kb)",
          "→ Optimizing assets...",
          "  ✓ Images compressed (saved 34%)",
          `→ Deploying to ${target}...`,
          "  ✓ Uploaded 12 files",
          "  ✓ Edge functions deployed",
          "→ Running health check...",
          "  ✓ 200 OK",
          "",
          "✅ Deployment successful!",
          `🔗 https://tesseract-demo.${target.toLowerCase()}.app`
        ];

        for (let i = 0; i < logs.length; i++) {
          await new Promise(r => setTimeout(r, 400));
          set(state => ({ 
            deployLogs: [...state.deployLogs, logs[i]],
            deployProgress: Math.min(((i + 1) / logs.length) * 100, 100)
          }));
        }

        const newDeploy: DeployEntry = {
          id: `dep-${Date.now()}`,
          status: 'success',
          target: target as any,
          environment: env as any,
          duration: '38s',
          commit: 'g7h8i9j',
          timestamp: 'Just now',
          url: `https://tesseract-demo.${target.toLowerCase()}.app`,
          logs: logs
        };

        set(state => ({ 
          deployStatus: 'success',
          deployHistory: [newDeploy, ...state.deployHistory]
        }));
      },
      rollbackDeploy: (id) => {
        // Mock rollback
        set(state => ({
          deployHistory: state.deployHistory.map(d => d.id === id ? { ...d, timestamp: 'Rolled back just now' } : d)
        }));
      },

      // 6. SETTINGS
      parallelLimit: 3,
      autoRoute: true,
      economyMode: 'balanced',
      setEconomyMode: (mode) => set({ economyMode: mode }),
      apiKeys: {},
      setApiKeys: (keys) => set({ apiKeys: keys }),

      // 8. MAX POWER FEATURES
      consensusState: null,
      setConsensusState: (consensusState) => set({ consensusState }),
    }),
    {
      name: 'array-ide-storage',
      partialize: (state) => ({
        mode: state.mode,
        activeModels: state.activeModels,
        openTabs: state.openTabs,
        apiKeys: state.apiKeys,
        files: state.files,
      }),
    }
  )
);

// --- Typed Selectors ---

export const useMode = () => useAppStore((state) => state.mode);
export const useAgents = () => useAppStore((state) => state.agents);
export const useChatMessages = () => useAppStore((state) => state.messages);
export const useFiles = () => useAppStore((state) => state.files);
export const useBuildStatus = () => useAppStore((state) => ({
  status: state.buildStatus,
  time: state.buildTime,
  filesGenerated: state.filesGenerated,
  totalTokens: state.totalTokens,
  previewUrl: state.previewUrl
}));
