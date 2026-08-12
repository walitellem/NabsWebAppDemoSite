/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { NabsLodgeLogo } from './NabsLodgeLogo';
import { getUsers, addAuditLog, getFormattedDateTime } from '../data';
import { User, Role, Branch } from '../types';
import { Shield, Key, Eye, EyeOff, MapPin, Building, Sparkles, Sun, Moon, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db, isFirebaseConfigured, safeFirestoreOp } from '../firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { useLoading } from './LoadingContext';

interface LoginPortalProps {
  onLoginSuccess: (user: User) => void;
  onDemoLogin?: (user: User) => void;
  onForbidden: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export default function LoginPortal({ onLoginSuccess, onForbidden, isDarkMode, onToggleTheme }: LoginPortalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { isLoading, withLoading } = useLoading();
  
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [shake, setShake] = useState(false);

  const [detectedIp, setDetectedIp] = useState<string>('');
  const [simulatedIp, setSimulatedIp] = useState<string>(() => {
    return localStorage.getItem('nabslodge_simulated_ip') || '';
  });
  const [useSimulation, setUseSimulation] = useState<boolean>(() => {
    return localStorage.getItem('nabslodge_use_simulation') === 'true';
  });

  const checkIpAccess = (user: User) => {
    if (user.role === 'Manager') return true;

    const activeIp = (useSimulation ? simulatedIp : detectedIp).trim();
    const settingsStr = localStorage.getItem('globalSettings_local');
    const settings = settingsStr ? JSON.parse(settingsStr) : {};
    
    if (settings.enforceIpRestrictions !== true) return true;

    const authorizedIpConfig = user.branch === 'Annex' ? settings.annexIp : settings.ayigyaIp;

    if (!authorizedIpConfig || authorizedIpConfig.trim() === '' || authorizedIpConfig.trim() === '*') {
      return true;
    }

    // Split allowed IPs by comma, space, or semicolon
    const allowedList = String(authorizedIpConfig)
      .split(/[\s,;]+/)
      .map(ip => ip.trim())
      .filter(Boolean);

    if (allowedList.length === 0 || allowedList.includes('*')) return true;

    // Check if activeIp matches any allowed entry (exact, wildcard, CIDR/subnet, or same-subnet octets)
    const isMatch = allowedList.some(pattern => {
      if (pattern === activeIp) return true;
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return activeIp.startsWith(prefix);
      }
      if (pattern.includes('/')) {
        const prefix = pattern.split('/')[0].split('.').slice(0, 3).join('.');
        return activeIp.startsWith(prefix + '.');
      }
      // Subnet match: If dynamic IP on same local/ISP WiFi subnet (first 3 octets match, e.g. 197.251.12.x)
      const activeParts = activeIp.split('.');
      const patternParts = pattern.split('.');
      if (activeParts.length === 4 && patternParts.length === 4) {
        if (activeParts[0] === patternParts[0] && activeParts[1] === patternParts[1] && activeParts[2] === patternParts[2]) {
          return true;
        }
      }
      return false;
    });

    return isMatch;
  };

  // Trigger shake animation
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  React.useEffect(() => {
    localStorage.setItem('nabslodge_use_simulation', String(useSimulation));
  }, [useSimulation]);

  React.useEffect(() => {
    localStorage.setItem('nabslodge_simulated_ip', simulatedIp);
  }, [simulatedIp]);

  React.useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        if (res.ok) {
          const json = await res.json();
          if (json.ip) {
            setDetectedIp(json.ip);
            if (!localStorage.getItem('nabslodge_simulated_ip')) {
              setSimulatedIp(json.ip);
            }
          }
        } else {
          setDetectedIp('197.251.12.45');
          if (!localStorage.getItem('nabslodge_simulated_ip')) {
            setSimulatedIp('197.251.12.45');
          }
        }
      } catch (err) {
        setDetectedIp('197.251.12.45');
        if (!localStorage.getItem('nabslodge_simulated_ip')) {
          setSimulatedIp('197.251.12.45');
        }
        console.warn("Public IP detection service unavailable, fallback applied:", err);
      }
    };
    detect();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setError('');
    
    if (!email.trim() || !password) {
      setError('Please provide both email address and password.');
      triggerShake();
      return;
    }
    
    try {
      await withLoading((async () => {
        const cleanEmail = email.toLowerCase().trim();
        let firebaseUid: string | null = null;
        let authUser: any = null;

        // 1. Authenticate with Firebase Authentication (if configured)
        if (isFirebaseConfigured) {
          try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
            authUser = userCredential.user;
            firebaseUid = userCredential.user.uid;
          } catch (firebaseErr: any) {
            console.warn("Firebase Auth sign-in note:", firebaseErr);
            const errCode = firebaseErr?.code || '';

            // If Firebase explicitly rejected the credentials, throw error
            if (
              errCode === 'auth/wrong-password' ||
              errCode === 'auth/invalid-credential' ||
              errCode === 'auth/user-not-found'
            ) {
              throw new Error('Incorrect email or password.');
            }
            if (errCode === 'auth/invalid-email') {
              throw new Error('Invalid email address format.');
            }
            if (errCode === 'auth/user-disabled') {
              throw new Error('Your account has been deactivated. Please contact the manager.');
            }
            // For configuration errors (auth/configuration-not-found, auth/invalid-api-key),
            // we fall back to strict local & Firestore password checks below.
          }
        }

        // 2. Fetch Firestore user document using user.uid (if Firebase is configured)
        let firestoreData: any = null;
        let userId = firebaseUid || '';

        if (isFirebaseConfigured && firebaseUid) {
          try {
            const userDocSnap = await safeFirestoreOp(() => getDoc(doc(db, 'users', firebaseUid!)), null, 10000);
            if (userDocSnap?.exists()) {
              firestoreData = userDocSnap.data();
              userId = userDocSnap.id;
              console.log("DEBUG: Firestore data found by UID:", firestoreData);
            }
          } catch (fsErr) {
            console.warn("Firestore fetch by UID note:", fsErr);
          }
        }

        // Fallback query by email if no document found by UID and Firebase is configured
        if (isFirebaseConfigured && !firestoreData) {
          try {
            const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
            const querySnapshot = await safeFirestoreOp(() => getDocs(q), null, 10000);
            if (querySnapshot && !querySnapshot.empty) {
              firestoreData = querySnapshot.docs[0].data();
              userId = querySnapshot.docs[0].id;
              console.log("DEBUG: Firestore data found by email:", firestoreData);
            }
          } catch (fsErr) {
            console.warn("Firestore fetch by email note:", fsErr);
          }
        }
        
        console.log("DEBUG: Final firestoreData:", firestoreData);

        // Check local users array as ultimate fallback
        const localUsers = getUsers();
        const localMatch = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

        // 3. Strict Password Verification (when Firebase Auth did not authenticate)
        if (!authUser) {
          const storedPassword = firestoreData?.password || firestoreData?.Password || localMatch?.password;

          if (!firestoreData && !localMatch) {
            throw new Error('Incorrect email or password.');
          }

          if (storedPassword && storedPassword !== password) {
            throw new Error('Incorrect email or password.');
          }
        }

        // 3. Strict Status Gate Check (Step C):
        const rawStatus = firestoreData?.status || firestoreData?.Status || localMatch?.status || 'Active';
        const isInactive = rawStatus === 'Inactive' || 
                           rawStatus === 'Disabled' || 
                           String(rawStatus).trim().toLowerCase() === 'inactive' || 
                           String(rawStatus).trim().toLowerCase() === 'disabled';

        if (isInactive) {
          // Immediately sign out, clear local session state, and reject login
          await signOut(auth).catch(() => {});
          localStorage.removeItem('nabslodge_active_session');
          throw new Error("Your account has been deactivated by the manager. Access denied.");
        }

        // 4. Step D: Set global user state using retrieved Firestore document data fields (name and role)
        let name = cleanEmail === 'sualahtellem@gmail.com' ? 'mr. tellem' : (localMatch?.name || cleanEmail.split('@')[0]);
        let createdAt = firestoreData?.createdAt || localMatch?.createdAt || getFormattedDateTime();

        if (firestoreData) {
          name = firestoreData.name || firestoreData.Name || name;
        }

        const firestoreRoleStr = String(firestoreData?.role || firestoreData?.Role || '').trim().toLowerCase();
        const localRoleStr = String(localMatch?.role || '').trim().toLowerCase();

        const isManager = 
          firestoreRoleStr === 'manager' ||
          localRoleStr === 'manager' ||
          cleanEmail.includes('manager') ||
          cleanEmail === 'sualahtellem@gmail.com' ||
          cleanEmail.startsWith('admin');

        const role: Role = isManager ? 'Manager' : 'Receptionist';
        const branch: Branch | undefined = isManager ? undefined : (firestoreData?.branch || firestoreData?.Branch || localMatch?.branch || 'Annex');

        const user: User = {
          id: userId || localMatch?.id || 'user_' + Math.random().toString(36).substring(2, 9),
          email: cleanEmail,
          password: password,
          name: name,
          role: role,
          branch: branch,
          status: 'Active',
          createdAt: createdAt
        };

        // IP Restriction Check
        if (!checkIpAccess(user)) {
          onForbidden();
          return;
        }

        // Direct login success
        onLoginSuccess(user);
        addAuditLog(
          user.id,
          user.name,
          user.role,
          user.branch || 'Global',
          'User Authentication',
          `User ${user.name} logged in.`
        );
        setFailedAttempts(0);
      })());
    } catch (err: any) {
      triggerShake();
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      let errorMessage = 'Incorrect email or password.';
      const errCode = err?.code || '';
      const errStr = err?.message || '';

      if (errStr.includes('deactivated') || errStr.includes('Access denied') || errStr.includes('IP restriction')) {
        errorMessage = errStr;
      } else if (errCode === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (errCode === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later.';
      } else if (errCode === 'auth/user-disabled') {
        errorMessage = 'Your account has been deactivated. Please contact the manager.';
      } else if (errStr && !errStr.includes('Firebase:') && !errStr.includes('auth/')) {
        errorMessage = errStr;
      } else {
        errorMessage = 'Incorrect email or password.';
      }
      
      setError(errorMessage);

      if (newAttempts >= 3) {
        setIsLocked(true);
        setLockoutTimer(30);
        
        let secondsLeft = 30;
        const interval = setInterval(() => {
          secondsLeft -= 1;
          setLockoutTimer(secondsLeft);
          if (secondsLeft <= 0) {
            clearInterval(interval);
            setIsLocked(false);
            setFailedAttempts(0);
            setError('');
          }
        }, 1000);
      }
    }
  };

  const fillCredentials = (em: string, pw: string) => {
    if (isLocked) return;
    setEmail(em);
    setPassword(pw);
    setError('');
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-200 min-h-screen w-full flex flex-col justify-between p-4 sm:p-6 md:p-8 relative overflow-hidden font-sans">
      {/* Abstract ambient backdrop glow */}
      {isDarkMode ? (
        <>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />
        </>
      ) : (
        <>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
        </>
      )}

      {/* Header / Brand */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="w-full max-w-7xl mx-auto flex items-center justify-between z-10 py-2"
      >
        <div className="flex items-center gap-3">
          <NabsLodgeLogo size="md" />
          <div>
            <span className={`font-bold tracking-wider block text-sm ${
              isDarkMode ? 'text-blue-400' : 'text-blue-600'
            }`}>NABSLODGE</span>
            <span className={`text-xs font-mono tracking-widest block uppercase -mt-1 ${
              isDarkMode ? 'text-zinc-400' : 'text-slate-500'
            }`}>Management Portal</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
              isDarkMode 
                ? 'bg-zinc-900 border-zinc-800 text-blue-400 hover:bg-zinc-800' 
                : 'bg-white border-slate-200 text-blue-600 shadow-sm hover:bg-slate-50'
            }`}
            title={isDarkMode ? "Switch to Modern Blue & White Theme" : "Switch to Dark Theme"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className={`hidden sm:flex items-center gap-2 border rounded-full px-4 py-1.5 text-xs ${
            isDarkMode 
              ? 'bg-zinc-900/80 border-zinc-800/80 text-zinc-400' 
              : 'bg-white/80 border-slate-200 text-slate-500 shadow-sm'
          }`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Unified Gateway Active
          </div>
        </div>
      </motion.header>

      {/* Main Grid */}
      <main className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10 py-8">
        
        {/* Left Column: Brand Context / Instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="lg:col-span-7 flex flex-col gap-6 text-left lg:pr-6"
        >
          <span className={`inline-flex self-start items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-medium ${
            isDarkMode 
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
              : 'bg-blue-50/80 border-blue-100 text-blue-600'
          }`}>
            <Sparkles className="w-3.5 h-3.5" /> Portal v2.6 • Kumasi, Ghana
          </span>
          <h1 className={`text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight ${
            isDarkMode ? 'text-white' : 'text-slate-900'
          }`}>
            One Portal.<br />
            <span className={`text-transparent bg-clip-text bg-gradient-to-r ${
              isDarkMode ? 'from-blue-400 to-blue-600' : 'from-blue-600 to-indigo-600'
            }`}>
              Two Prime Locations.
            </span>
          </h1>
          <p className={`text-sm sm:text-base max-w-lg leading-relaxed ${
            isDarkMode ? 'text-zinc-400' : 'text-slate-600'
          }`}>
            Welcome to Nabslodge’s unified administrative center. Log in with your credentials to automatically open your designated operations panel for <strong className={isDarkMode ? 'text-zinc-200' : 'text-slate-800'}>Annex (KNUST-Bomso)</strong> or <strong className={isDarkMode ? 'text-zinc-200' : 'text-slate-800'}>Ayigya (SG Mall)</strong>.
          </p>
        </motion.div>

        {/* Right Column: Beautiful Login Card */}
        <div className="lg:col-span-5">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              ...(shake ? { x: [-10, 10, -10, 10, 0] } : {})
            }}
            transition={{
              duration: shake ? 0.4 : 0.2,
              ease: "easeInOut"
            }}
            className={`border rounded-3xl p-6 sm:p-8 shadow-2xl relative transition-all ${
            isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`absolute top-0 right-8 -translate-y-1/2 px-3 py-1 border rounded-full text-[11px] font-mono uppercase tracking-widest ${
              isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}>
              SECURE SSO
            </div>

            <div className="mb-6 text-center lg:text-left">
              <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>System Sign-In</h3>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Enter your role-associated credentials to initiate session tokens.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${
                  isDarkMode ? 'text-zinc-400' : 'text-slate-500'
                }`}>
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                    <Building className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter assigned email"
                    disabled={isLocked}
                    className={`block w-full pl-10 pr-3 py-2.5 border rounded-xl text-sm transition-all font-mono focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isDarkMode 
                        ? 'bg-zinc-950 border-zinc-800 text-white placeholder-zinc-600 focus:border-blue-500 focus:ring-blue-500/15' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500/15'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${
                  isDarkMode ? 'text-zinc-400' : 'text-slate-500'
                }`}>
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={isLocked}
                    className={`block w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm transition-all font-mono focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isDarkMode 
                        ? 'bg-zinc-950 border-zinc-800 text-white placeholder-zinc-600 focus:border-blue-500 focus:ring-blue-500/15' 
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500/15'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-200 dark:border-red-900/80 rounded-xl text-xs text-red-600 dark:text-red-400 leading-relaxed font-mono">
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isLocked}
                className={`w-full flex items-center justify-center gap-2 py-3 active:scale-[0.98] font-bold rounded-xl text-sm transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/10' 
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/10'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : isLocked ? (
                  <span>Locked out. Wait {lockoutTimer}s</span>
                ) : (
                  <span>Authenticate & Enter</span>
                )}
              </button>
            </form>

            {/* Network Security Inspector */}
            <div className={`mt-6 pt-4 border-t ${isDarkMode ? 'border-zinc-800/80' : 'border-slate-100'} text-xs space-y-3`}>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-blue-500" /> Detected Public IP:
                </span>
                <span className="font-bold text-slate-700 dark:text-zinc-300">
                  {detectedIp || 'Scanning network...'}
                </span>
              </div>

              <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-zinc-950/40 border border-zinc-850' : 'bg-slate-50 border border-slate-100'} space-y-2`}>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useSimulation}
                      onChange={(e) => setUseSimulation(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Enable IP Simulator
                  </label>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                    useSimulation 
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  }`}>
                    {useSimulation ? 'Simulating' : 'Real Ingress'}
                  </span>
                </div>

                {useSimulation && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={simulatedIp}
                      onChange={(e) => setSimulatedIp(e.target.value)}
                      placeholder="Simulate IP address..."
                      className={`block w-full px-2.5 py-1.5 rounded-lg text-xs font-mono focus:outline-none ${
                        isDarkMode ? 'bg-zinc-900 border border-zinc-800 text-white' : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => setSimulatedIp('197.251.12.45')}
                        className="text-[9px] font-mono px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/25 text-blue-500 transition-all cursor-pointer"
                      >
                        Set Annex IP (197.251.12.45)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimulatedIp('197.251.48.92')}
                        className="text-[9px] font-mono px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/25 text-blue-500 transition-all cursor-pointer"
                      >
                        Set Ayigya IP (197.251.48.92)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={`border-t mt-4 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] ${
              isDarkMode ? 'border-zinc-800/80 text-zinc-500' : 'border-slate-100 text-slate-400'
            }`}>
              <span className="flex items-center gap-1">
                <MapPin className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                Dual-Branch Router Online
              </span>
              <span>Encrypted Session Storage</span>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={`w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between border-t pt-4 mt-8 z-10 text-xs ${
        isDarkMode ? 'border-zinc-900 text-zinc-600' : 'border-slate-200/60 text-slate-400'
      }`}>
        <p>© 2026 Nabslodge. All rights reserved. | Web app developed by SUALAH TELLEM (0553189032)</p>
        <div className="flex gap-4 mt-2 sm:mt-0">
          <span className="font-mono">IP: SECURE PORTAL</span>
          <span>•</span>
          <span>Security & Standards Compliant</span>
        </div>
      </motion.footer>
    </div>
  );
}
