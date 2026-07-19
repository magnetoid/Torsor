import React, { useEffect } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { Brain, ChevronDown, Cpu, Gauge, Settings2 } from 'lucide-react';
import { useAgentPrefsStore } from '../../stores/agentPrefsStore';

export function AgentSettingsTab() {
  const { prefs, fetch, save } = useAgentPrefsStore();
  useEffect(() => { void fetch(); }, [fetch]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Planning Mode (real, persisted) */}
      <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
            <Brain size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-primary">Planning Mode</div>
            <div className="text-xs text-secondary mt-0.5">Show a plan before writing code.</div>
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

      {/* Autonomy & Steps (real per-user prefs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-surface border border-default rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <Settings2 className="text-accent" size={16} />
            <div className="text-sm font-medium text-primary">Default Autonomy</div>
          </div>
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
          <div className="flex items-center gap-2">
            <Gauge className="text-accent" size={16} />
            <div className="text-sm font-medium text-primary">Max Steps</div>
          </div>
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

      {/* Preferred Model (real, persisted) */}
      <div className="p-4 bg-surface border border-default rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <Cpu className="text-accent" size={16} />
          <div className="text-sm font-medium text-primary">Preferred Model</div>
        </div>
        <div className="text-xs text-secondary">Model id the agent uses by default. Leave blank to use the workspace default.</div>
        <input
          type="text"
          value={prefs.preferredModel}
          onChange={(e) => void save({ preferredModel: e.target.value })}
          placeholder="e.g. claude-3-5-sonnet"
          className="w-full bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary placeholder:text-tertiary outline-none focus:border-accent transition-colors"
        />
      </div>
    </div>
  );
}
