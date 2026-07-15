import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { X, Layout, ChevronDown, Tag, DollarSign, Globe } from 'lucide-react';
import { useSocialStore } from '../../stores/socialStore';

export function PublishTemplateDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { publishTemplate } = useSocialStore();
  const [name, setName] = useState('My Awesome Template');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Landing Page');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [price, setPrice] = useState(0);
  const [isFree, setIsFree] = useState(true);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handlePublish = () => {
    publishTemplate({
      name,
      author: 'me',
      description,
      category,
      tags,
      price: isFree ? 0 : price
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-surface border border-default rounded-2xl p-6 shadow-2xl z-[101] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring outline-none">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Layout size={20} className="text-accent" />
              <Dialog.Title className="text-lg font-bold text-primary">Publish as template</Dialog.Title>
            </div>
            <Dialog.Close className="text-secondary hover:text-primary transition-colors">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Template Name</label>
              <input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-inset border border-default rounded-md px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What makes this template special?"
                className="w-full bg-inset border border-default rounded-md px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Category</label>
              <Select.Root value={category} onValueChange={setCategory}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-inset border border-default rounded-md text-sm text-primary outline-none">
                  <Select.Value />
                  <ChevronDown size={16} className="text-secondary" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-[110] p-1">
                    {['Landing Page', 'API', 'Dashboard', 'Full-Stack', 'Mobile', 'Tool', 'Game', 'AI'].map(cat => (
                      <Select.Item key={cat} value={cat} className="px-2 py-1.5 text-sm text-primary outline-none cursor-pointer hover:bg-accent-muted rounded-sm">
                        <Select.ItemText>{cat}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-accent-muted text-accent text-[10px] font-bold rounded-full border border-accent/30 flex items-center gap-1">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))}><X size={10} /></button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                <input 
                  placeholder="Add tags (type + enter)..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="w-full bg-inset border border-default rounded-md pl-9 pr-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-default">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-secondary" />
                <span className="text-xs text-primary">Make it free</span>
              </div>
              <input 
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="w-4 h-4 rounded border-default bg-inset accent-accent"
              />
            </div>

            {!isFree && (
              <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-200">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Price (Credits)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                  <input 
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-inset border border-default rounded-md pl-9 pr-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>
            )}

            <button 
              onClick={handlePublish}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition-all mt-4"
            >
              Publish Template
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
