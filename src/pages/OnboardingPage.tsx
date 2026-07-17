import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { OnboardingStep1 } from './steps/OnboardingStep1';
import { OnboardingStep2 } from './steps/OnboardingStep2';
import { OnboardingStep3 } from './steps/OnboardingStep3';
import { OnboardingStep4 } from './steps/OnboardingStep4';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    name: '',
    workspaceName: '',
    role: '',
    economyMode: 'balanced',
    apiKeys: {
      anthropic: '',
      openai: '',
      google: '',
    },
    prompt: '',
    templateId: '',
  });

  const { user, setOnboarded, updateProfile } = useAuthStore();
  const createProject = useProjectStore((state) => state.createProject);
  const navigate = useNavigate();

  // Pre-fill name from user store if available
  React.useEffect(() => {
    if (user && !data.name) {
      setData(prev => ({ ...prev, name: user.name }));
    }
  }, [user]);

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = async (finalData?: typeof data) => {
    const currentData = finalData || data;
    setOnboarded(true);

    // Persist the safe onboarding fields. (API keys are intentionally NOT persisted here —
    // they belong in the encrypted secrets store via Settings → API Keys, not localStorage.)
    const name = currentData.name?.trim();
    if (name && name !== user?.name) updateProfile({ name });
    const workspaceName = currentData.workspaceName?.trim();
    if (workspaceName) {
      const ws = useWorkspaceStore.getState();
      ws.updateWorkspace(ws.activeWorkspaceId, { name: workspaceName });
    }

    if (currentData.prompt || currentData.templateId) {
      const projectId = await createProject({
        name: currentData.prompt?.slice(0, 32) || currentData.templateId || 'My first project',
        description: currentData.prompt || 'Created from onboarding',
        type: 'website',
      }, 'server-default');
      navigate(`/project/${projectId}`);
    } else {
      navigate('/');
    }
  };

  const updateData = (newData: Partial<typeof data>) => {
    setData(prev => ({ ...prev, ...newData }));
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-surface border border-default rounded-3xl shadow-xl overflow-hidden flex flex-col">
        {/* Progress Bar */}
        <div className="p-8 pb-0 flex justify-center gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                step === i ? "bg-accent scale-125" : 
                step > i ? "bg-success" : 
                "bg-border-default border border-default"
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-8 pt-6 relative overflow-hidden min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="h-full"
            >
              {step === 1 && (
                <OnboardingStep1 
                  data={data} 
                  updateData={updateData} 
                  onNext={nextStep} 
                />
              )}
              {step === 2 && (
                <OnboardingStep2 
                  data={data} 
                  updateData={updateData} 
                  onNext={nextStep} 
                  onBack={prevStep}
                />
              )}
              {step === 3 && (
                <OnboardingStep3 
                  data={data} 
                  updateData={updateData} 
                  onNext={nextStep} 
                  onBack={prevStep}
                />
              )}
              {step === 4 && (
                <OnboardingStep4 
                  data={data} 
                  updateData={updateData} 
                  onComplete={handleComplete}
                  onBack={prevStep}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
