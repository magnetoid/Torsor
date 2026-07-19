import React, { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Slider from '@radix-ui/react-slider';
import * as Select from '@radix-ui/react-select';
import { 
  Zap, 
  Activity, 
  ShieldCheck, 
  Lock, 
  ChevronDown, 
  Check, 
  Brain, 
  Rocket, 
  History,
  Settings2,
  Cpu
} from 'lucide-react';
import { usePlanGate } from '../../hooks/usePlanGate';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { UpgradeDialog } from '../shared/UpgradeDialog';
import { useAgentPrefsStore } from '../../stores/agentPrefsStore';

export function AgentSettingsTab() {
  const { checkFeature } = usePlanGate();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { prefs, fetch, save } = useAgentPrefsStore();
  useEffect(() => { void fetch(); }, [fetch]);

  const [economyMode, setEconomyMode] = useState<'turbo' | 'balanced' | 'max'>('balanced');
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [consensusThreshold, setConsensusThreshold] = useState([75]);
  const [contextMode, setContextMode] = useState('auto');

  const handleModeChange = (mode: 'turbo' | 'balanced' | 'max') => {
    if (mode === 'max') {
      const gate = checkFeature('max_power_mode');
      if (!gate.allowed) {
        setUpgradeOpen(true);
        return;
      }
    }
    setEconomyMode(mode);
    toast.success(`Economy mode switched to ${mode}`);
  };

  const models = [
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', enabled: true },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', enabled: true },
    { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', enabled: true },
    { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'DeepSeek', enabled: true },
    { id: 'llama-3-1-405b', name: 'Llama 3.1 405B', provider: 'Meta', enabled: false },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Economy Mode */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Economy Mode</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'turbo', icon: Zap, label: 'Turbo', desc: 'Fastest + cheapest. Best for simple tasks.', price: '~$0.01/task' },
            { id: 'balanced', icon: Activity, label: 'Balanced', desc: 'Smart routing per task complexity.', price: '~$0.05/task' },
            { id: 'max', icon: ShieldCheck, label: 'Max Power', desc: 'Best models + consensus validation.', price: '~$0.15/task', gated: true },
          ].map((mode) => {
            const isGated = mode.gated && !checkFeature('max_power_mode').allowed;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id as any)}
                className={cn(
                  "flex flex-col p-4 rounded-xl border text-left transition-all relative group",
                  economyMode === mode.id 
                    ? "bg-accent-muted border-accent ring-1 ring-accent" 
                    : "bg-surface border-default hover:border-accent/30",
                  isGated && "opacity-80"
                )}
              >
                <div className="flex justify-between items-start">
                  <mode.icon size={20} className={cn(economyMode === mode.id ? "text-accent" : "text-secondary")} />
                  {isGated && <Lock size={14} className="text-tertiary" />}
                </div>
                <div className="mt-3 font-bold text-sm text-primary">{mode.label}</div>
                <div className="mt-1 text-xs text-secondary leading-relaxed">{mode.desc}</div>
                <div className="mt-auto pt-4 text-xs font-bold uppercase tracking-wider text-accent">{mode.price}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Brain size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-primary">Planning Mode</div>
              <div className="text-xs text-secondary mt-0.5">Show plan before writing code.</div>
            </div>
          </div>
          <Switch.Root
            checked={prefs.planningEnabled}
            onCheckedChange={(v) => void save({ planningEnabled: v })}
            className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
          >
            <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
          </Switch.Root>
        </div>

        <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <Rocket size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-primary">Auto-Deploy</div>
              <div className="text-xs text-secondary mt-0.5">Deploy to cloud after successful build.</div>
            </div>
          </div>
          <Switch.Root 
            checked={autoDeploy} 
            onCheckedChange={setAutoDeploy}
            className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-success transition-colors outline-none cursor-pointer"
          >
            <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
          </Switch.Root>
        </div>
      </div>

      {/* Autonomy & Steps (real per-user prefs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-surface border border-default rounded-xl space-y-2">
          <div className="text-sm font-medium text-primary">Default Autonomy</div>
          <div className="text-xs text-secondary">How missions start. v1 honors approve-plan only.</div>
          <Select.Root value={prefs.defaultAutonomy} onValueChange={(v) => void save({ defaultAutonomy: v as 'approve_plan' | 'autonomous' })}>
            <Select.Trigger className="w-full flex items-center justify-between bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors">
              <Select.Value />
              <Select.Icon>
                <ChevronDown size={16} className="text-tertiary" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                <Select.Viewport>
                  {[
                    { id: 'approve_plan', label: 'Approve plan first' },
                    { id: 'autonomous', label: 'Autonomous' },
                  ].map((item) => (
                    <Select.Item
                      key={item.id}
                      value={item.id}
                      className="flex px-3 py-2 text-sm text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer"
                    >
                      <Select.ItemText>{item.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
        <div className="p-4 bg-surface border border-default rounded-xl space-y-2">
          <div className="text-sm font-medium text-primary">Max Steps</div>
          <div className="text-xs text-secondary">Upper bound on agent steps per run.</div>
          <input
            type="number"
            min={1}
            value={prefs.maxSteps}
            onChange={(e) => void save({ maxSteps: +e.target.value })}
            className="w-full bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Model Array */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Model Array</h3>
        </div>
        <div className="bg-surface border border-default rounded-xl overflow-hidden divide-y divide-default">
          {models.map((model) => (
            <div key={model.id} className="flex items-center justify-between p-4 hover:bg-elevated/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-secondary text-xs font-bold">
                  {model.provider.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-primary">{model.name}</div>
                  <div className="text-xs text-tertiary uppercase font-bold tracking-wider">{model.provider}</div>
                </div>
              </div>
              <Switch.Root 
                defaultChecked={model.enabled}
                className="w-8 h-4 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
              >
                <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-4.5" />
              </Switch.Root>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
          <div className="flex items-center gap-2">
            <Settings2 className="text-accent" size={18} />
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Consensus Threshold</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Agreement Required</span>
              <span className="text-accent font-bold">{consensusThreshold}%</span>
            </div>
            <Slider.Root 
              value={consensusThreshold} 
              onValueChange={setConsensusThreshold}
              max={100} 
              step={5}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="bg-elevated relative grow rounded-full h-1.5">
                <Slider.Range className="absolute bg-accent rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb className="block w-4 h-4 bg-white border-2 border-accent rounded-full hover:scale-110 transition-transform focus:outline-none shadow-lg" />
            </Slider.Root>
            <p className="text-xs text-tertiary leading-relaxed">
              Higher threshold increases accuracy but may increase latency and cost by requiring more models to agree.
            </p>
          </div>
        </div>

        <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
          <div className="flex items-center gap-2">
            <History className="text-accent" size={18} />
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Context Management</h3>
          </div>
          <div className="space-y-4">
            <Select.Root value={contextMode} onValueChange={setContextMode}>
              <Select.Trigger className="w-full flex items-center justify-between bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors">
                <Select.Value />
                <Select.Icon>
                  <ChevronDown size={16} className="text-tertiary" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                  <Select.Viewport>
                    {[
                      { id: 'auto', label: 'Auto-summarize', desc: 'Summarize old history to save tokens' },
                      { id: 'full', label: 'Full history', desc: 'Send entire conversation history' },
                      { id: 'last10', label: 'Last 10 messages', desc: 'Only send the most recent context' },
                    ].map((item) => (
                      <Select.Item 
                        key={item.id} 
                        value={item.id}
                        className="flex flex-col px-3 py-2 text-sm text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer"
                      >
                        <Select.ItemText className="font-medium">{item.label}</Select.ItemText>
                        <div className="text-xs opacity-70">{item.desc}</div>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <p className="text-xs text-tertiary leading-relaxed">
              Determines how much conversation history is sent to the models. Auto-summarize is recommended for long sessions.
            </p>
          </div>
        </div>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
