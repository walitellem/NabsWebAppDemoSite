/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, isFirebaseConfigured, safeFirestoreOp } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { initializeDb } from './data';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { User } from './types';
import { AnimatePresence, motion } from 'motion/react';
import LoginPortal from './components/LoginPortal';
import ManagerDashboard from './components/ManagerDashboard';
import ReceptionistDashboard from './components/ReceptionistDashboard';
import WelcomeView from './components/WelcomeView';
import { UnauthorizedPage } from './components/UnauthorizedPage';
import { ToastProvider } from './components/ToastContext';
import { LoadingProvider } from './components/LoadingContext';
import { LoadingOverlay } from './components/LoadingOverlay';
import GettingStartedModal from './components/GettingStartedModal';

export default function App() {
  const [activeView, setActiveView] = useState<'welcome' | 'dashboard'>('welcome');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('nabslodge_active_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('nabslodge_dark_mode');
    return saved === 'true';
  });
  useEffect(() => {
    // Initialize the local mock database state on mount
    initializeDb();

    if (!isFirebaseConfigured) {
      setIsAuthReady(true);
      return;
    }

    let unsubscribeAuth = () => {};
    let unsubUserDoc: (() => void) | null = null;
    try {
      // Firebase Auth State Observer Wrapper: Pull custom user profile from Firestore using user.uid
      unsubscribeAuth = onAuthStateChanged(
        auth, 
        async (firebaseUser) => {
          if (unsubUserDoc) {
            unsubUserDoc();
            unsubUserDoc = null;
          }

          if (firebaseUser) {
            try {
              const uid = firebaseUser.uid;
              const cleanEmail = (firebaseUser.email || '').toLowerCase().trim();
              console.log("DEBUG: App.tsx: Auth state changed, firebaseUser.uid:", uid, "email:", cleanEmail);
              
              let docId = uid;

              // 1. First, quickly locate the correct document ID for the user
              try {
                const userDocSnap = await safeFirestoreOp(() => getDoc(doc(db, 'users', uid)), null, 10000);
                if (userDocSnap?.exists()) {
                  docId = userDocSnap.id;
                } else if (cleanEmail) {
                  // Fallback query by email if doc by UID was created manually under another ID
                  const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
                  const qSnap = await safeFirestoreOp(() => getDocs(q), null, 10000);
                  if (qSnap && !qSnap.empty) {
                    docId = qSnap.docs[0].id;
                  }
                }
              } catch (fsErr) {
                console.warn("Firestore user fetch error in App.tsx observer:", fsErr);
              }

              // 2. Establish a real-time snapshot listener on the user's Firestore document
              unsubUserDoc = onSnapshot(doc(db, 'users', docId), async (snapshot) => {
                try {
                  const docData = snapshot.exists() ? snapshot.data() : null;

                  // Also check local database users fallback
                  const { getUsers } = await import('./data');
                  const localUsers = getUsers();
                  const localMatch = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

                  const rawStatus = docData?.status || docData?.Status || localMatch?.status || 'Active';
                  const statusStr = String(rawStatus).trim().toLowerCase();
                  if (statusStr === 'inactive' || statusStr === 'disabled') {
                    await signOut(auth).catch(() => {});
                    setCurrentUser(null);
                    localStorage.removeItem('nabslodge_active_session');
                    setIsAuthReady(true);
                    return;
                  }

                  const rawRole = docData?.role || docData?.Role || localMatch?.role;
                  const roleStr = String(rawRole || '').trim().toLowerCase();
                  const localRoleStr = String(localMatch?.role || '').trim().toLowerCase();

                  const isManagerRole = 
                    roleStr === 'manager' || 
                    localRoleStr === 'manager' ||
                    cleanEmail.includes('manager') || 
                    cleanEmail === 'sualahtellem@gmail.com' ||
                    cleanEmail.startsWith('admin');

                  const finalRole: User['role'] = isManagerRole ? 'Manager' : 'Receptionist';

                  const userProfile: User = {
                    id: docId || localMatch?.id || uid,
                    email: firebaseUser.email || docData?.email || localMatch?.email || '',
                    name: docData?.name || docData?.Name || localMatch?.name || firebaseUser.displayName || (isManagerRole ? 'Manager' : 'Receptionist'),
                    role: finalRole,
                    branch: finalRole === 'Manager' ? undefined : (docData?.branch || docData?.Branch || localMatch?.branch || 'Annex'),
                    status: rawStatus,
                    createdAt: docData?.createdAt || localMatch?.createdAt || new Date().toISOString(),
                    lastShiftReset: docData?.lastShiftReset || localMatch?.lastShiftReset,
                    tutorialSeen: docData?.tutorialSeen ?? localMatch?.tutorialSeen ?? false
                  };

                  setCurrentUser(userProfile);
                  localStorage.setItem('nabslodge_active_session', JSON.stringify(userProfile));
                  setIsAuthReady(true);
                } catch (snapErr) {
                  console.warn("Error processing user doc snapshot update:", snapErr);
                  setIsAuthReady(true);
                }
              }, (snapErr) => {
                console.warn("User document onSnapshot subscription error:", snapErr);
                setIsAuthReady(true);
              });

            } catch (err) {
              console.warn("Auth observer profile sync note:", err);
              setIsAuthReady(true);
            }
          } else {
            // User is logged out
            setCurrentUser(null);
            localStorage.removeItem('nabslodge_active_session');
            setIsAuthReady(true);
          }
        },
        (error) => {
          console.warn("Firebase Auth state observer caught error:", error);
          setIsAuthReady(true);
        }
      );
    } catch (err) {
      console.warn("Firebase Auth setup error:", err);
      setIsAuthReady(true);
    }
    
    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) {
        unsubUserDoc();
      }
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      const idKey = currentUser.id ? localStorage.getItem(`nabslodge_tutorial_seen_${currentUser.id}`) : null;
      const emailKey = currentUser.email ? localStorage.getItem(`nabslodge_tutorial_seen_${currentUser.email.toLowerCase().trim()}`) : null;
      const docSeen = currentUser.tutorialSeen;

      if (idKey === 'true' || emailKey === 'true' || docSeen) {
        setIsTutorialOpen(false);
      } else {
        setIsTutorialOpen(true);
      }
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.tutorialSeen]);

  useEffect(() => {
    localStorage.setItem('nabslodge_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsForbidden(false);
    localStorage.setItem('nabslodge_active_session', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveView('welcome');
    localStorage.removeItem('nabslodge_active_session');
  };

  const handleForbidden = () => {
    setIsForbidden(true);
  };

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  if (!isAuthReady) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-200 min-h-screen w-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <LoadingProvider>
        <AnimatePresence mode="wait">
          {isForbidden ? (
            <motion.div
              key="unauthorized"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <UnauthorizedPage onBack={() => setIsForbidden(false)} />
            </motion.div>
          ) : !currentUser ? (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <LoginPortal 
                onLoginSuccess={handleLoginSuccess} 
                onForbidden={handleForbidden}
                isDarkMode={isDarkMode} 
                onToggleTheme={toggleTheme} 
              />
            </motion.div>
          ) : activeView === 'welcome' ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <WelcomeView 
                currentUser={currentUser}
                onLogout={handleLogout}
                onGoToDashboard={() => setActiveView('dashboard')}
                isDarkMode={isDarkMode}
                onToggleTheme={toggleTheme}
              />
            </motion.div>
          ) : currentUser.role === 'Manager' ? (
            <motion.div
              key="manager"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              <ManagerDashboard 
                currentUser={currentUser} 
                onLogout={handleLogout} 
                isDarkMode={isDarkMode} 
                onToggleTheme={toggleTheme} 
                onOpenTutorial={() => setIsTutorialOpen(true)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="receptionist"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              <ReceptionistDashboard 
                currentUser={currentUser} 
                onLogout={handleLogout} 
                isDarkMode={isDarkMode} 
                onToggleTheme={toggleTheme} 
                onOpenTutorial={() => setIsTutorialOpen(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {currentUser && (
          <GettingStartedModal 
            isOpen={isTutorialOpen} 
            onClose={() => setIsTutorialOpen(false)} 
            currentUser={currentUser} 
            isDarkMode={isDarkMode} 
          />
        )}
      </LoadingProvider>
    </ToastProvider>
  );
}
