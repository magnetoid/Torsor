import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  Check, 
  X, 
  Eye, 
  EyeOff, 
  Plus, 
  Trash2, 
  Box, 
  Code2, 
  Globe, 
  Server, 
  FlaskConical, 
  Github,
  Loader2,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Input } from '../shared/Input';
import { cn } from '../../lib/utils';

type Step = 1 | 2 | 3 | 4;

interface TeamMember {
  email: string;
  role: 'admin' | 'developer' | 'viewer';
}

interface ApiKeyState {
  key: string;
  isVisible: boolean;
  status: 'idle' | 'testing' | 'success' | 'error';
}

export const OnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const createProject = useProjectStore(state => state.createProject);
  const activeWorkspaceId = useWorkspaceStore(state => state.activeWorkspaceId);
  
  const [currentStep, setCurrentStep] = useState<Step>(1);
  
  // Step 1 State
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkspaceSlug(workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  }, [workspaceName]);

  // Step 2 State
  const [useCredits, setUseCredits] = useState(true);
  const [apiKeys, setApiKeys] = useState<Record<string, ApiKeyState>>({
    anthropic: { key: '', isVisible: false, status: 'idle' },
    openai: { key: '', isVisible: false, status: 'idle' },
    google: { key: '', isVisible: false, status: 'idle' },
    openrouter: { key: '', isVisible: false, status: 'idle' },
    ollama: { key: 'http://localhost:11434', isVisible: true, status: 'idle' },
  });

  // Step 3 State
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Step 4 State
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [projectName, setProjectName] = useState('');

  const templates = [
    { id: 'blank', title: 'Blank Project', description: 'Start from scratch with a clean slate.', icon: <Box className="w-6 h-6" /> },
    { id: 'react', title: 'React + Vite', description: 'Modern frontend setup with TailwindCSS.', icon: <Code2 className="w-6 h-6" /> },
    { id: 'nextjs', title: 'Next.js App', description: 'Full-stack framework with App Router.', icon: <Globe className="w-6 h-6" /> },
    { id: 'express', title: 'Express API', description: 'Fast, unopinionated Node.js backend.', icon: <Server className="w-6 h-6" /> },
    { id: 'python', title: 'Python Flask', description: 'Lightweight WSGI web application framework.', icon: <FlaskConical className="w-6 h-6" /> },
    { id: 'github', title: 'Import from GitHub', description: 'Connect your existing repository.', icon: <Github className="w-6 h-6" /> },
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const testApiKey = async (provider: string) => {
    setApiKeys(prev => ({
      ...prev,
      [provider]: { ...prev[provider], status: 'testing' }
    }));
    
    await new Promise(r => setTimeout(r, 800));
    
    const success = Math.random() > 0.2; // 80% success rate for mock
    setApiKeys(prev => ({
      ...prev,
      [provider]: { ...prev[provider], status: success ? 'success' : 'error' }
    }));
  };

  const addInvite = () => {
    if (inviteEmail && !teamMembers.find(m => m.email === inviteEmail)) {
      setTeamMembers([...teamMembers, { email: inviteEmail, role: 'developer' }]);
      setInviteEmail('');
    }
  };

  const removeInvite = (email: string) => {
    setTeamMembers(teamMembers.filter(m => m.email !== email));
  };

  const handleFinish = () => {
    const projectId = createProject({
      name: projectName || 'Untitled Project',
      description: `A new ${selectedTemplate} project.`,
      template: selectedTemplate
    }, activeWorkspaceId || 'w1');
    navigate(`/project/${projectId}`);
  };

  const renderProgress = () => (
    <div className="flex items-center justify-center gap-4 mb-12">
      {[1, 2, 3, 4].map((step) => (
        <React.Fragment key={step}>
          <div 
            className={cn(
              "w-3 h-3 rounded-full transition-all duration-300",
              currentStep === step ? "bg-violet-500 ring-4 ring-violet-500/20" : 
              currentStep > step ? "bg-success" : "bg-zinc-700"
            )}
          />
          {step < 4 && (
            <div 
              className={cn(
                "w-12 h-[2px] rounded-full",
                currentStep > step ? "bg-success" : "bg-zinc-700"
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-surface border border-default rounded-xl p-10 shadow-2xl relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
        
        {renderProgress()}

        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-primary mb-2">Name your workspace</h2>
            <p className="text-secondary mb-8">This is where your team and projects will live.</p>
            
            <div className="space-y-6">
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Workspace Name</label>
                <Input 
                  placeholder="Acme Corp" 
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Workspace URL</label>
                <div className="flex items-center gap-2 bg-page border border-default rounded-md px-3 h-10">
                  <span className="text-sm text-secondary">torsor.app/</span>
                  <input 
                    className="flex-1 bg-transparent text-sm text-primary focus:outline-none"
                    value={workspaceSlug}
                    onChange={(e) => setWorkspaceSlug(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Workspace Logo</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-32 border-2 border-dashed border-default rounded-xl hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-4" />
                  ) : (
                    <>
                      <Upload size={24} className="text-secondary" />
                      <span className="text-sm text-secondary">Click to upload logo</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-primary mb-2">Connect your AI</h2>
            <p className="text-secondary mb-8">Choose how you want to power your agents.</p>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Sparkles size={20} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="text-primary font-medium">Use Torsor credits</h3>
                    <p className="text-xs text-secondary">Recommended for easy setup</p>
                  </div>
                </div>
                <Switch.Root 
                  checked={useCredits}
                  onCheckedChange={setUseCredits}
                  className="w-11 h-6 bg-subtle rounded-full relative data-[state=checked]:bg-accent outline-none cursor-default"
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>

              {useCredits ? (
                <div className="p-6 bg-accent/5 border border-accent/20 rounded-xl text-center">
                  <div className="text-3xl font-bold text-accent mb-1">50,000</div>
                  <div className="text-sm text-secondary">free tokens to start your journey</div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {(Object.entries(apiKeys) as [string, ApiKeyState][]).map(([provider, state]) => (
                    <div key={provider} className="grid gap-2">
                      <label className="text-xs font-semibold text-secondary uppercase tracking-wider capitalize">{provider}</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input 
                            type={state.isVisible ? 'text' : 'password'}
                            placeholder={`Enter ${provider} API key`}
                            className="pr-10"
                            value={state.key}
                            onChange={(e) => setApiKeys(prev => ({
                              ...prev,
                              [provider]: { ...prev[provider], key: e.target.value }
                            }))}
                          />
                          <button 
                            onClick={() => setApiKeys(prev => ({
                              ...prev,
                              [provider]: { ...prev[provider], isVisible: !state.isVisible }
                            }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary"
                          >
                            {state.isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <button 
                          onClick={() => testApiKey(provider)}
                          disabled={state.status === 'testing' || !state.key}
                          className="px-4 bg-surface border border-default rounded-md text-sm font-medium hover:bg-elevated disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                        >
                          {state.status === 'testing' ? <Loader2 size={16} className="animate-spin" /> : 
                           state.status === 'success' ? <Check size={16} className="text-success" /> :
                           state.status === 'error' ? <X size={16} className="text-error" /> : 'Test'}
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <Collapsible.Root className="mt-4">
                    <Collapsible.Trigger className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover font-medium">
                      <Plus size={16} /> Add Local Model (Ollama)
                    </Collapsible.Trigger>
                    <Collapsible.Content className="mt-4 space-y-4 p-4 bg-surface rounded-xl border border-default">
                      <div className="grid gap-2">
                        <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Ollama URL</label>
                        <Input placeholder="http://localhost:11434" />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Model Name</label>
                        <Input placeholder="llama3, deepseek-coder, etc." />
                      </div>
                    </Collapsible.Content>
                  </Collapsible.Root>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-primary mb-2">Invite your team</h2>
            <p className="text-secondary mb-8">Collaboration is better with agents and humans.</p>
            
            <div className="space-y-6">
              <div className="flex gap-2">
                <Input 
                  placeholder="colleague@company.com" 
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addInvite()}
                />
                <button 
                  onClick={addInvite}
                  className="px-6 bg-accent hover:bg-accent-hover text-white font-bold rounded-md transition-colors"
                >
                  Add
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {teamMembers.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-default rounded-xl">
                    <p className="text-sm text-secondary">No team members added yet.</p>
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.email} className="flex items-center justify-between p-3 bg-surface border border-default rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                          {member.email[0].toUpperCase()}
                        </div>
                        <span className="text-sm text-primary">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select.Root defaultValue={member.role}>
                          <Select.Trigger className="inline-flex items-center justify-between rounded px-3 py-1 text-xs font-medium bg-elevated border border-default text-primary w-28 outline-none">
                            <Select.Value />
                            <Select.Icon />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="overflow-hidden bg-elevated border border-default rounded-md shadow-xl z-50">
                              <Select.Viewport className="p-1">
                                <Select.Item value="admin" className="text-xs text-primary p-2 hover:bg-accent rounded cursor-pointer outline-none">
                                  <Select.ItemText>Admin</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="developer" className="text-xs text-primary p-2 hover:bg-accent rounded cursor-pointer outline-none">
                                  <Select.ItemText>Developer</Select.ItemText>
                                </Select.Item>
                                <Select.Item value="viewer" className="text-xs text-primary p-2 hover:bg-accent rounded cursor-pointer outline-none">
                                  <Select.ItemText>Viewer</Select.ItemText>
                                </Select.Item>
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                        <button 
                          onClick={() => removeInvite(member.email)}
                          className="p-1.5 text-secondary hover:text-error transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="text-center">
                <button 
                  onClick={() => setCurrentStep(4)}
                  className="text-sm text-secondary hover:text-accent transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-primary mb-2">Create your first project</h2>
            <p className="text-secondary mb-8">Choose a template to start building immediately.</p>
            
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                {templates.map((t) => (
                  <div 
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-3",
                      selectedTemplate === t.id 
                        ? "bg-accent/10 border-accent shadow-[0_0_20px_rgba(124,111,247,0.1)]" 
                        : "bg-surface border-default hover:border-accent/50"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      selectedTemplate === t.id ? "bg-accent text-white" : "bg-elevated text-secondary"
                    )}>
                      {t.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-primary">{t.title}</h4>
                      <p className="text-[10px] text-secondary leading-tight">{t.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider">Project Name</label>
                <Input 
                  placeholder="My Awesome App" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-12 flex items-center justify-between pt-8 border-t border-default">
          <button 
            onClick={() => currentStep > 1 && setCurrentStep((prev) => (prev - 1) as Step)}
            disabled={currentStep === 1}
            className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-primary transition-colors disabled:opacity-0"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          
          <button 
            onClick={() => {
              if (currentStep < 4) {
                setCurrentStep((prev) => (prev + 1) as Step);
              } else {
                handleFinish();
              }
            }}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-8 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-accent/20"
          >
            {currentStep === 4 ? 'Create & Open' : 'Next'}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
