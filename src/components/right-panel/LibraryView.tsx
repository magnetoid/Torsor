import React, { useState } from 'react';
import { Search, Package, Layout, FileCode, ChevronRight, ChevronDown, BadgeCheck, Zap, Box, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LibraryItem {
  id: string;
  name: string;
  type: 'artifact' | 'template' | 'package';
  icon: React.ReactNode;
  badge?: string;
  description?: string;
}

const MOCK_LIBRARY: LibraryItem[] = [
  { id: 'art-1', name: 'Start application', type: 'artifact', icon: <Zap size={14} className="text-success" />, badge: 'Artifact', description: 'Main entry point for the application' },
  { id: 'art-2', name: 'Build project', type: 'artifact', icon: <Zap size={14} className="text-success" />, badge: 'Artifact', description: 'Compiles the project for production' },
  { id: 'temp-1', name: 'Auth Landing', type: 'template', icon: <Layout size={14} className="text-accent-hover" />, badge: 'Template', description: 'Modern authentication landing page' },
  { id: 'temp-2', name: 'Dashboard Grid', type: 'template', icon: <Layout size={14} className="text-accent-hover" />, badge: 'Template', description: 'Responsive dashboard layout grid' },
  { id: 'pkg-1', name: 'lucide-react', type: 'package', icon: <Box size={14} className="text-info" />, badge: 'v0.475.0', description: 'Beautiful & consistent icons' },
  { id: 'pkg-2', name: 'framer-motion', type: 'package', icon: <Box size={14} className="text-info" />, badge: 'v12.4.2', description: 'A production-ready motion library' },
  { id: 'pkg-3', name: 'zustand', type: 'package', icon: <Box size={14} className="text-info" />, badge: 'v5.0.3', description: 'A small, fast and scalable bearbones state-management solution' },
  { id: 'pkg-4', name: 'radix-ui', type: 'package', icon: <Box size={14} className="text-info" />, badge: 'v1.1.2', description: 'Unstyled, accessible components for building high-quality design systems' },
];

export default function LibraryView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['Other', 'Templates', 'Packages']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const filteredItems = MOCK_LIBRARY.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sections = [
    { name: 'Other', type: 'artifact' },
    { name: 'Templates', type: 'template' },
    { name: 'Packages', type: 'package' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* HEADER */}
      <div className="h-9 flex items-center px-3 shrink-0 border-b border-subtle">
        <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Library</span>
      </div>

      {/* INPUT */}
      <div className="p-3 border-b border-subtle">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input 
            type="text" 
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-subtle rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* SECTIONS */}
      <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
        {sections.map((section) => {
          const items = filteredItems.filter(i => i.type === section.type);
          const isExpanded = expandedSections.includes(section.name);

          if (items.length === 0) return null;

          return (
            <div key={section.name} className="mb-2">
              <button 
                onClick={() => toggleSection(section.name)}
                className="w-full h-7 flex items-center gap-2 px-3 hover:bg-elevated transition-colors group"
              >
                <div className="text-tertiary">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-secondary">{section.name}</span>
                <span className="text-xs text-tertiary ml-auto">{items.length}</span>
              </button>

              {isExpanded && (
                <div className="space-y-1 px-1 mt-1">
                  {items.map((item) => (
                    <div 
                      key={item.id}
                      className="p-2 hover:bg-elevated cursor-pointer rounded-md transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {item.icon}
                        <span className="text-[11px] text-primary font-medium truncate">{item.name}</span>
                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-inset text-secondary font-bold uppercase tracking-tighter ml-auto">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-tertiary truncate pl-5 group-hover:text-secondary transition-colors">
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
