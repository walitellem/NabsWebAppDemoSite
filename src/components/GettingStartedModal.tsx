import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  BookOpen, 
  ShieldCheck, 
  Activity, 
  DollarSign, 
  CheckCircle2, 
  Smartphone, 
  HelpCircle,
  TrendingUp,
  Users,
  Layers,
  KeyRound
} from 'lucide-react';
import { User } from '../types';
import { db, isFirebaseConfigured, safeSetDoc } from '../firebase';
import { doc } from 'firebase/firestore';

interface GettingStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  isDarkMode: boolean;
}

interface TutorialStep {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  tip: string;
  highlights: string[];
}

export default function GettingStartedModal({ isOpen, onClose, currentUser, isDarkMode }: GettingStartedModalProps) {
  const [selectedRole, setSelectedRole] = useState<'Manager' | 'Receptionist'>(
    currentUser.role === 'Manager' ? 'Manager' : 'Receptionist'
  );
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);

  if (!isOpen) return null;

  const managerSteps: TutorialStep[] = [
    {
      id: 1,
      icon: <Sparkles className="w-8 h-8 text-blue-500" />,
      badge: "Welcome Admin",
      title: "Welcome to Nabs Lodge Management",
      description: "You have entered the master control panel. This system coordinates multi-branch operations, finances, room status configurations, and receptionist activities across the entire property.",
      tip: "You can switch between the Annex and Ayigya branch statistics inside the financial and room occupancy pages for granular tracking.",
      highlights: [
        "Consolidated real-time business health",
        "Dual-branch operational isolation",
        "Multi-view auditing and historical reports"
      ]
    },
    {
      id: 2,
      icon: <TrendingUp className="w-8 h-8 text-emerald-500" />,
      badge: "Financial Control",
      title: "Consolidated Financial Reports",
      description: "Review detailed financial registers covering room lodging bookings, bar beverages sales, and additional on-demand activities. Spot business trends with yearly and monthly graphs.",
      tip: "Filter transactions by date and employee to quickly trace revenue leaks or verify daily shift balances.",
      highlights: [
        "Lodging & Room extensions revenues",
        "Lodge bar sales & Inventory valuation",
        "Monthly revenue run-rate charts"
      ]
    },
    {
      id: 3,
      icon: <ShieldCheck className="w-8 h-8 text-purple-500" />,
      badge: "Strict Auditing",
      title: "Shift Handovers & Resets",
      description: "When receptionists end their desk cycles, they submit a Shift Handover. As a manager, you audit their submitted cash-on-hand and mobile money transfers to clear and reset their active shift register.",
      tip: "A receptionist cannot start a new shift register until you review and approve their previous handover.",
      highlights: [
        "MoMo & Cash collection totals",
        "Discrepancy and variance reporting",
        "One-click shift reset authorization"
      ]
    },
    {
      id: 4,
      icon: <KeyRound className="w-8 h-8 text-amber-500" />,
      badge: "Operational Security",
      title: "Staff and Security Management",
      description: "Audit actions instantly with live system logs. Manage receptionist staff accounts, activate or disable profiles, and update security login PINs on the fly.",
      tip: "Keep active receptionist PINs confidential. If a team member leaves, disable their login from the 'Receptionist Accounts' tab immediately.",
      highlights: [
        "Instant Receptionist PIN updates",
        "Real-time system-wide activity logs",
        "Toggle account active/inactive statuses"
      ]
    }
  ];

  const receptionistSteps: TutorialStep[] = [
    {
      id: 1,
      icon: <Sparkles className="w-8 h-8 text-blue-500" />,
      badge: "Front Desk Suite",
      title: "Welcome to Nabslodge Front Desk",
      description: "This is your dedicated daily shift workstation. Easily check guests in and out, track real-time room cleaning states, and keep record of every financial exchange during your active desk hours.",
      tip: "Your dashboard operates under strict security isolation. All operations apply specifically to your assigned branch.",
      highlights: [
        "Rapid check-in & checkout workflows",
        "Automatic accommodation price calculators",
        "Room maintenance status managers"
      ]
    },
    {
      id: 2,
      icon: <Layers className="w-8 h-8 text-indigo-500" />,
      badge: "Room Tracking",
      title: "Live Room & Reservation Board",
      description: "View and filter rooms by status: Available, Occupied, Cleaning, or Maintenance. Book walk-in guests, customize dates, log security keys, and record hourly checkout extensions.",
      tip: "Tap any occupied room to record payments, add extension hours, or begin the checkout checkout flow.",
      highlights: [
        "Color-coded live room states",
        "Instant booking and billing sheets",
        "Flexible hourly extension controls"
      ]
    },
    {
      id: 3,
      icon: <Activity className="w-8 h-8 text-emerald-500" />,
      badge: "Auxiliary Sales",
      title: "Bar Sales & Activity Ledger",
      description: "Log beverage and bar bottle orders directly from the drinks shelf, and post client custom activities to record secondary lodging services with perfect precision.",
      tip: "Always log beverage sales immediately to ensure your shift register balances perfectly during handover audit.",
      highlights: [
        "Real-time drink stock management",
        "On-the-fly walk-in activity registers",
        "Direct MoMo/Cash transaction tagging"
      ]
    },
    {
      id: 4,
      icon: <DollarSign className="w-8 h-8 text-amber-500" />,
      badge: "Financial Handover",
      title: "Ending Shifts & Handovers",
      description: "At the end of your workspace hours, sum up your total physical cash and mobile money collections. Tally them on-screen and submit your shift handover request directly to the manager.",
      tip: "After submitting your handover, your shift balances are locked until the manager approves and resets your desk register.",
      highlights: [
        "Automated cash-on-hand summaries",
        "Transparent Mobile Money transfers",
        "Audit logs of historical handovers"
      ]
    }
  ];

  const activeSteps = selectedRole === 'Manager' ? managerSteps : receptionistSteps;
  const totalSteps = activeSteps.length;
  const currentStepData = activeSteps[currentStep];

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleRoleChange = (role: 'Manager' | 'Receptionist') => {
    setSelectedRole(role);
    setCurrentStep(0);
  };

  const persistTutorialSeen = () => {
    if (currentUser?.id) {
      localStorage.setItem(`nabslodge_tutorial_seen_${currentUser.id}`, 'true');
    }
    if (currentUser?.email) {
      localStorage.setItem(`nabslodge_tutorial_seen_${currentUser.email.toLowerCase().trim()}`, 'true');
    }
    if (isFirebaseConfigured && db && currentUser?.id) {
      safeSetDoc(doc(db, 'users', currentUser.id), { tutorialSeen: true }, { merge: true }).catch(() => {});
    }
  };

  const handleToggleDontShowAgain = (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) {
      persistTutorialSeen();
    } else {
      if (currentUser?.id) {
        localStorage.removeItem(`nabslodge_tutorial_seen_${currentUser.id}`);
      }
      if (currentUser?.email) {
        localStorage.removeItem(`nabslodge_tutorial_seen_${currentUser.email.toLowerCase().trim()}`);
      }
      if (isFirebaseConfigured && db && currentUser?.id) {
        safeSetDoc(doc(db, 'users', currentUser.id), { tutorialSeen: false }, { merge: true }).catch(() => {});
      }
    }
  };

  const handleClose = () => {
    if (dontShowAgain) {
      persistTutorialSeen();
    }
    onClose();
  };

  const handleComplete = () => {
    if (dontShowAgain) {
      persistTutorialSeen();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border transition-colors duration-300 ${
            isDarkMode 
              ? 'bg-zinc-900 border-zinc-800 text-zinc-100' 
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          {/* Header Banner */}
          <div className="relative p-6 pb-4 border-b border-zinc-200/50 dark:border-zinc-800/50">
            <button 
              onClick={handleClose}
              className={`absolute top-4 right-4 p-1.5 rounded-full transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' 
                  : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
              }`}
              title="Close Tutorial"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold font-mono tracking-widest uppercase text-blue-600 dark:text-blue-400">
                Lodge Onboarding Guide
              </span>
            </div>
            
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Getting Started Tutorial
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Select a portal dashboard below to master its features and daily operational workflows.
            </p>

            {/* Role Switcher tabs */}
            <div className="flex gap-2 mt-4 p-1 bg-slate-100 dark:bg-zinc-950 rounded-xl max-w-xs">
              <button
                onClick={() => handleRoleChange('Manager')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'Manager'
                    ? (isDarkMode ? 'bg-zinc-900 text-white shadow-sm' : 'bg-white text-slate-800 shadow-xs')
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                Manager Guide
              </button>
              <button
                onClick={() => handleRoleChange('Receptionist')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'Receptionist'
                    ? (isDarkMode ? 'bg-zinc-900 text-white shadow-sm' : 'bg-white text-slate-800 shadow-xs')
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                Receptionist Guide
              </button>
            </div>
            
            {/* Notice if viewing a different role */}
            {currentUser.role !== selectedRole && (
              <div className="mt-2.5 px-3 py-1.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/40 rounded-lg flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] text-blue-600 dark:text-blue-400">
                  You are currently logged in as a <strong>{currentUser.role}</strong>.
                </span>
              </div>
            )}
          </div>

          {/* Interactive Steps Content */}
          <div className="p-6 md:p-8 min-h-[320px] flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedRole}_step_${currentStep}`}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Step badge & Icon */}
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-800/50 flex items-center justify-center">
                    {currentStepData.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono tracking-wider font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {currentStepData.badge}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                      {currentStepData.title}
                    </h3>
                  </div>
                </div>

                {/* Main description */}
                <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                  {currentStepData.description}
                </p>

                {/* Key items bullet list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {currentStepData.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-zinc-300">
                        {highlight}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Practical Tip Callout */}
                <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-zinc-950/40 border-slate-200 dark:border-zinc-800 flex gap-3">
                  <div className="text-amber-500 select-none shrink-0 text-base">💡</div>
                  <div className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                    <strong className="text-slate-800 dark:text-zinc-300">Pro-Tip: </strong>
                    {currentStepData.tip}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Footer controls */}
            <div className="mt-8 pt-6 border-t border-zinc-200/60 dark:border-zinc-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Skip and "Don't show again" */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => handleToggleDontShowAgain(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-slate-300 dark:border-zinc-700 text-blue-600 bg-transparent focus:ring-0 focus:ring-offset-0 transition-colors"
                  />
                  <span className="text-xs text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200 selection:bg-transparent">
                    Don't show this again
                  </span>
                </label>
              </div>

              {/* Progress and Buttons */}
              <div className="flex items-center justify-between sm:justify-end gap-6">
                {/* Dots indicators */}
                <div className="flex gap-1.5">
                  {activeSteps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentStep(idx)}
                      className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                        currentStep === idx 
                          ? 'w-4 bg-blue-600 dark:bg-blue-400' 
                          : 'bg-slate-300 dark:bg-zinc-700 hover:bg-slate-400 dark:hover:bg-zinc-500'
                      }`}
                      title={`Go to step ${idx + 1}`}
                    />
                  ))}
                </div>

                {/* Back and Next */}
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={handleBack}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        isDarkMode
                          ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-300'
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-md shadow-blue-600/10"
                  >
                    {currentStep === totalSteps - 1 ? 'Finish' : 'Next'}
                    {currentStep < totalSteps - 1 && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
