import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  // Shimmer sweep (keyframes in index.css) reads as more polished than a flat pulse.
  return (
    <div className={cn(
      "relative overflow-hidden bg-elevated rounded-md",
      className
    )}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
    </div>
  );
};

export const ProjectCardSkeleton: React.FC = () => {
  return (
    <div className="bg-surface border border-default rounded-2xl overflow-hidden shadow-sm flex flex-col h-[280px]">
      <Skeleton className="h-[140px] w-full rounded-none" />
      <div className="p-4 flex-1 flex flex-col gap-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="mt-auto flex items-center justify-between">
          <div className="flex gap-1.5">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="w-6 h-6 rounded-full" />
          </div>
          <div className="flex -space-x-2">
            <Skeleton className="w-6 h-6 rounded-full border-2 border-surface" />
            <Skeleton className="w-6 h-6 rounded-full border-2 border-surface" />
          </div>
        </div>
      </div>
      <div className="border-t border-default px-4 py-2 flex items-center justify-between bg-elevated/30">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
      </div>
    </div>
  );
};

export const MemberRowSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-between py-4 px-6 border-b border-subtle">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
};

export const ChatMessageSkeleton: React.FC<{ isAgent?: boolean }> = ({ isAgent }) => {
  return (
    <div className={cn(
      "flex gap-3 mb-6",
      !isAgent && "flex-row-reverse"
    )}>
      <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
      <div className={cn(
        "space-y-2 max-w-[80%]",
        !isAgent && "items-end flex flex-col"
      )}>
        <Skeleton className={cn(
          "h-16 rounded-2xl",
          isAgent ? "w-[320px]" : "w-[240px]"
        )} />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
};

export const SettingsBlockSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 p-6 bg-surface border border-default rounded-2xl">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="space-y-3 pt-2">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
};
