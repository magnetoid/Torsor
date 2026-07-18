import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { 
  Github, 
  Database, 
  CreditCard, 
  Cloud, 
  Globe, 
  Mail, 
  MessageSquare, 
  Flame, 
  Layers, 
  Zap,
  Search,
  Check,
  ExternalLink,
  Settings,
  X,
  ShieldCheck,
  Key
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  color: string;
}

const INTEGRATIONS: Integration[] = [
  { id: 'github', name: 'GitHub', description: 'Sync code and manage pull requests.', icon: <Github size={24} />, connected: true, color: 'text-white' },
  { id: 'supabase', name: 'Supabase', description: 'PostgreSQL database and authentication.', icon: <Database size={24} />, connected: true, color: 'text-success' },
  { id: 'stripe', name: 'Stripe', description: 'Accept payments and manage subscriptions.', icon: <CreditCard size={24} />, connected: false, color: 'text-info' },
  { id: 'vercel', name: 'Vercel', description: 'Deploy and host your web applications.', icon: <Cloud size={24} />, connected: false, color: 'text-white' },
  { id: 'netlify', name: 'Netlify', description: 'Automated builds and serverless functions.', icon: <Globe size={24} />, connected: false, color: 'text-info' },
  { id: 'sendgrid', name: 'SendGrid', description: 'Email delivery and marketing campaigns.', icon: <Mail size={24} />, connected: false, color: 'text-info' },
  { id: 'twilio', name: 'Twilio', description: 'SMS, voice, and messaging APIs.', icon: <MessageSquare size={24} />, connected: false, color: 'text-error' },
  { id: 'firebase', name: 'Firebase', description: 'Google backend-as-a-service platform.', icon: <Flame size={24} />, connected: false, color: 'text-warning' },
  { id: 'planetscale', name: 'PlanetScale', description: 'Serverless MySQL database platform.', icon: <Layers size={24} />, connected: false, color: 'text-white' },
  { id: 'resend', name: 'Resend', description: 'Modern email API for developers.', icon: <Zap size={24} />, connected: false, color: 'text-white' },
];

export default function IntegrationsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [connectedIds, setConnectedIds] = useState<string[]>(['github', 'supabase']);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const filteredIntegrations = INTEGRATIONS.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConnect = (id: string) => {
    setIsConnecting(id);
    // Simulate connection process
    setTimeout(() => {
      setConnectedIds(prev => [...prev, id]);
      setIsConnecting(null);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* HEADER */}
      <div className="h-12 bg-surface flex items-center justify-between px-4 shrink-0 border-b border-default">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-accent" />
          <h2 className="text-sm font-bold text-primary">Integrations</h2>
        </div>
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input 
            type="text" 
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-default rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* GRID */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {filteredIntegrations.map((item) => {
            const isConnected = connectedIds.includes(item.id);
            const connecting = isConnecting === item.id;

            return (
              <div 
                key={item.id}
                className="bg-surface rounded-xl border border-default p-4 hover:border-tertiary transition-all group relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className={cn(
                  "absolute -top-10 -right-10 w-32 h-32 blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity",
                  item.color.replace('text-', 'bg-')
                )} />

                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={cn("p-2 rounded-lg bg-page border border-default", item.color)}>
                    {item.icon}
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-bold uppercase tracking-tighter">
                      <Check size={10} />
                      Connected
                    </div>
                  ) : (
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20">
                          Connect
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content 
                          className="w-72 bg-elevated border border-default rounded-xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200"
                          sideOffset={8}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Settings size={14} className="text-accent" />
                              <span className="text-xs font-bold text-primary">Configure {item.name}</span>
                            </div>
                            <Popover.Close className="p-1 text-secondary hover:text-primary rounded transition-colors">
                              <X size={14} />
                            </Popover.Close>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-secondary uppercase tracking-wider">API Key</label>
                              <div className="relative">
                                <Key size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
                                <input 
                                  type="password" 
                                  placeholder="sk_test_..."
                                  className="w-full bg-page border border-default rounded-lg pl-8 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-secondary uppercase tracking-wider">Project ID</label>
                              <input 
                                type="text" 
                                placeholder="my-awesome-project"
                                className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button className="flex-1 px-3 py-1.5 rounded-lg border border-default text-primary text-xs font-bold uppercase tracking-wider hover:bg-elevated transition-colors">
                                Test
                              </button>
                              <button 
                                onClick={() => handleConnect(item.id)}
                                disabled={connecting}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {connecting ? <Zap size={12} className="animate-pulse" /> : 'Save'}
                              </button>
                            </div>
                          </div>
                          <Popover.Arrow className="fill-default" />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  )}
                </div>

                <div className="relative z-10">
                  <h3 className="text-sm font-bold text-primary mb-1">{item.name}</h3>
                  <p className="text-xs text-secondary leading-relaxed mb-4">{item.description}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-default">
                    <div className="flex items-center gap-1 text-xs text-tertiary">
                      <ShieldCheck size={12} />
                      <span>Official</span>
                    </div>
                    <a href="#" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 font-medium">
                      Docs
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
