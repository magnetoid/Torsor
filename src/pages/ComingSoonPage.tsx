import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LucideIcon } from 'lucide-react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { EmptyState } from '../components/shared/EmptyState';
import { AccountBar } from '../components/shared/AccountBar';

/** Shared shell for sidebar destinations that aren't built yet. The sidebar links to
 *  these routes, so they must land somewhere real (not a 404). */
export function ComingSoonPage({
  title,
  description,
  icon = Clock,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />
      <div className="flex-1 min-w-0 flex flex-col animate-in fade-in duration-slow">
        <AccountBar title={title} />
        <div className="flex-1 flex items-center justify-center">
          {/* Page title lives in the AccountBar; the hero says what state this is. */}
          <EmptyState
            icon={icon}
            title="Coming soon"
            description={description}
            actionLabel="Back to Home"
            onAction={() => navigate('/')}
          />
        </div>
      </div>
    </div>
  );
}
