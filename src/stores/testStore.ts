import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'running' | 'idle';

export interface TestCase {
  id: string;
  name: string;
  status: TestStatus;
  duration?: string;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface TestSuite {
  id: string;
  file: string;
  tests: TestCase[];
  status: TestStatus;
}

export interface FileCoverage {
  file: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface TestState {
  isRunning: boolean;
  framework: 'Vitest' | 'Jest' | 'Pytest';
  globPattern: string;
  results: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  } | null;
  suites: TestSuite[];
  isCoverageEnabled: boolean;
  coverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  } | null;
  coverageFiles: FileCoverage[];
  ciConfig: string | null;
  
  // Actions
  runTests: () => void;
  setGlobPattern: (pattern: string) => void;
  toggleCoverage: () => void;
  generateCIConfig: () => void;
  fixTestWithAgent: (testId: string) => void;
}

const MOCK_SUITES: TestSuite[] = [
  {
    id: 'suite-1',
    file: 'src/lib/utils.test.ts',
    status: 'passed',
    tests: [
      { id: 't1', name: 'cn() merges classes correctly', status: 'passed', duration: '12ms' },
      { id: 't2', name: 'formatDate() handles invalid inputs', status: 'passed', duration: '8ms' },
      { id: 't3', name: 'slugify() converts strings to slugs', status: 'passed', duration: '15ms' },
    ]
  },
  {
    id: 'suite-2',
    file: 'src/stores/authStore.test.ts',
    status: 'failed',
    tests: [
      { id: 't4', name: 'login() sets user state on success', status: 'passed', duration: '45ms' },
      { 
        id: 't5', 
        name: 'login() handles network errors', 
        status: 'failed', 
        duration: '120ms',
        error: {
          message: 'Expected error message "Network Error" but received "Timeout"',
          stack: 'at src/stores/authStore.test.ts:42:12\nat Object.run (node_modules/vitest/dist/chunk-runtime.js:12:4)'
        }
      },
      { id: 't6', name: 'logout() clears user state', status: 'passed', duration: '10ms' },
    ]
  },
  {
    id: 'suite-3',
    file: 'src/components/Button.test.tsx',
    status: 'passed',
    tests: [
      { id: 't7', name: 'renders correctly with default props', status: 'passed', duration: '22ms' },
      { id: 't8', name: 'calls onClick when clicked', status: 'passed', duration: '18ms' },
      { id: 't9', name: 'is disabled when loading prop is true', status: 'passed', duration: '25ms' },
      { id: 't10', name: 'applies custom className', status: 'skipped' },
    ]
  },
  {
    id: 'suite-4',
    file: 'src/api/users.test.ts',
    status: 'failed',
    tests: [
      { id: 't11', name: 'fetchUsers() returns list of users', status: 'passed', duration: '85ms' },
      { 
        id: 't12', 
        name: 'createUser() validates input', 
        status: 'failed', 
        duration: '62ms',
        error: {
          message: 'Validation failed: email is required',
          stack: 'at src/api/users.test.ts:28:15'
        }
      },
      { id: 't13', name: 'deleteUser() removes user from list', status: 'passed', duration: '42ms' },
      { id: 't14', name: 'updateUser() updates user fields', status: 'passed', duration: '55ms' },
      { id: 't15', name: 'getUser() returns 404 for non-existent user', status: 'passed', duration: '32ms' },
    ]
  }
];

const MOCK_COVERAGE_FILES: FileCoverage[] = [
  { file: 'src/lib/utils.ts', statements: 95, branches: 88, functions: 100, lines: 96 },
  { file: 'src/stores/authStore.ts', statements: 82, branches: 75, functions: 90, lines: 84 },
  { file: 'src/components/Button.tsx', statements: 100, branches: 100, functions: 100, lines: 100 },
  { file: 'src/api/users.ts', statements: 65, branches: 42, functions: 70, lines: 68 },
];

export const useTestStore = create<TestState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      framework: 'Vitest',
      globPattern: '**/*.test.ts, **/*.spec.ts',
      results: { passed: 12, failed: 2, skipped: 1, total: 15 },
      suites: MOCK_SUITES,
      isCoverageEnabled: true,
      coverage: { statements: 78, branches: 65, functions: 82, lines: 79 },
      coverageFiles: MOCK_COVERAGE_FILES,
      ciConfig: null,

      runTests: () => {
        set({ isRunning: true, results: null });
        
        // Simulate test run
        setTimeout(() => {
          set({ 
            isRunning: false, 
            results: { passed: 12, failed: 2, skipped: 1, total: 15 },
            suites: MOCK_SUITES
          });
        }, 2500);
      },

      setGlobPattern: (pattern) => set({ globPattern: pattern }),

      toggleCoverage: () => set((state) => ({ isCoverageEnabled: !state.isCoverageEnabled })),

      generateCIConfig: () => {
        const config = `name: Test and Validate
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm test -- --coverage
      - name: Lint
        run: npm run lint`;
        set({ ciConfig: config });
      },

      fixTestWithAgent: (_testId) => {
        // Not wired yet — this will hand the failing test to the agent loop when the
        // test runner is connected.
      }
    }),
    {
      name: 'torsor-test-storage',
    }
  )
);
