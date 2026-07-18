import React from 'react';
import { 
  Rocket, 
  GitCommit, 
  CheckCircle2, 
  History, 
  ExternalLink, 
  User, 
  Terminal, 
  FileCode,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { cn, formatDistanceToNow } from '../../lib/utils';

interface ActivityItem {
  id: string;
  user: {
    name: string;
    avatar?: string;
  };
  action: string;
  resource: string;
  timestamp: string;
  type: 'deploy' | 'commit' | 'agent' | 'security' | 'system';
}

const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    user: { name: 'Marko', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marko' },
    action: 'deployed',
    resource: 'api-dashboard to Vercel',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    type: 'deploy'
  },
  {
    id: '2',
    user: { name: 'Sarah', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
    action: 'committed',
    resource: "'Add auth middleware' to main",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    type: 'commit'
  },
  {
    id: '3',
    user: { name: 'Torsor Agent', avatar: undefined },
    action: 'completed',
    resource: '12 tasks in website-project',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    type: 'agent'
  },
  {
    id: '4',
    user: { name: 'Alex', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex' },
    action: 'created',
    resource: 'new branch feature/billing',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    type: 'commit'
  },
  {
    id: '5',
    user: { name: 'System', avatar: undefined },
    action: 'upgraded',
    resource: 'workspace to Pro plan',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    type: 'system'
  },
  {
    id: '6',
    user: { name: 'Marko', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marko' },
    action: 'merged',
    resource: 'PR #42: Fix navigation bug',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    type: 'commit'
  },
  {
    id: '7',
    user: { name: 'Torsor Agent', avatar: undefined },
    action: 'refactored',
    resource: 'database schema in backend-api',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    type: 'agent'
  },
  {
    id: '8',
    user: { name: 'Sarah', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
    action: 'published',
    resource: 'template "SaaS Starter" to community',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    type: 'deploy'
  }
];

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'deploy': return <Rocket size={14} className="text-success" />;
    case 'commit': return <GitCommit size={14} className="text-info" />;
    case 'agent': return <Terminal size={14} className="text-accent" />;
    case 'security': return <ShieldAlert size={14} className="text-error" />;
    case 'system': return <Zap size={14} className="text-warning" />;
    default: return <History size={14} className="text-secondary" />;
  }
};

export const ActivityFeed: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
          <History size={16} className="text-accent" />
          Recent Activity
        </h3>
        <button className="text-xs font-bold text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
          View all activity
          <ExternalLink size={12} />
        </button>
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="divide-y divide-subtle">
          {MOCK_ACTIVITY.map((item) => (
            <div 
              key={item.id}
              className="px-4 py-3 flex items-center gap-3 hover:bg-elevated/50 transition-colors group"
            >
              <div className="shrink-0">
                <div className="w-8 h-8 rounded-full bg-inset border border-default flex items-center justify-center overflow-hidden">
                  {item.user.avatar ? (
                    <img 
                      src={item.user.avatar} 
                      alt={item.user.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User size={16} className="text-tertiary" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-primary">{item.user.name}</span>
                  <span className="text-sm text-secondary">{item.action}</span>
                  <span className="text-sm font-medium text-primary truncate max-w-[240px]">
                    {item.resource}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-1">
                    {getActivityIcon(item.type)}
                    <span className="text-xs font-bold text-tertiary uppercase tracking-wider">
                      {item.type}
                    </span>
                  </div>
                  <span className="text-xs text-tertiary font-medium">
                    · {formatDistanceToNow(item.timestamp)}
                  </span>
                </div>
              </div>

              <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 text-tertiary hover:text-primary hover:bg-inset rounded-lg transition-all">
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
