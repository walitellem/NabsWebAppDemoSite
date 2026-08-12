import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  LogOut, Sun, Moon, LayoutDashboard, UserCircle, 
  ArrowRight, ShieldCheck, Hotel, Calendar, Briefcase,
  Key, ClipboardList
} from 'lucide-react';
import { User, Room, PendingEditRequest, Booking } from '../types';
import { getRooms, getBookings } from '../data';
import { db, isFirebaseConfigured, safeSetDoc } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

interface WelcomeViewProps {
  currentUser: User;
  onLogout: () => void;
  onGoToDashboard: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  currentUser,
  onLogout,
  onGoToDashboard,
  isDarkMode,
  onToggleTheme
}) => {
  const [mainAvailableRooms, setMainAvailableRooms] = useState<string[]>([]);
  const [annexAvailableRooms, setAnnexAvailableRooms] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (currentUser.role !== 'Manager') return;

    let currentRooms: Room[] = getRooms();
    let currentBookings: Booking[] = getBookings();

    const getRoomEffectiveStatus = (room: Room, bookingsList: Booking[]): string => {
      const isOccupied = room.status === 'Occupied' || !!room.guestName || bookingsList.some(b => 
        (b.roomId === room.id || (b.roomNumber && String(b.roomNumber) === String(room.roomNumber))) && 
        (b.branch === room.branch || !b.branch) && 
        (b.status === 'CheckedIn' || (b.status as string) === 'checked_in')
      );
      if (isOccupied) return 'Occupied';
      return room.status || 'Available';
    };

    const updateAvailableRooms = (roomsList: Room[], bookingsList: Booking[]) => {
      const main = roomsList
        .filter(r => r.branch === 'Ayigya' && getRoomEffectiveStatus(r, bookingsList) === 'Available')
        .map(r => r.roomNumber);
      const annex = roomsList
        .filter(r => r.branch === 'Annex' && getRoomEffectiveStatus(r, bookingsList) === 'Available')
        .map(r => r.roomNumber);

      setMainAvailableRooms(main);
      setAnnexAvailableRooms(annex);

      // Auto-heal: If any room document in Firestore is listed as Available but has an active CheckedIn booking, fix it
      if (isFirebaseConfigured && db) {
        roomsList.forEach(r => {
          const hasActiveCheckedIn = bookingsList.some(b => 
            (b.roomId === r.id || (b.roomNumber && String(b.roomNumber) === String(r.roomNumber))) && 
            (b.branch === r.branch || !b.branch) && 
            (b.status === 'CheckedIn' || (b.status as string) === 'checked_in')
          );
          if (hasActiveCheckedIn && r.status !== 'Occupied') {
            safeSetDoc(doc(db, 'rooms', r.id), { status: 'Occupied' }, { merge: true }).catch(() => {});
          }
        });
      }
    };

    // Initial calculation from baseline data
    updateAvailableRooms(currentRooms, currentBookings);

    // Initial local pending edits fallback
    try {
      const storedEdits = localStorage.getItem('nabslodge_pending_edits');
      if (storedEdits) {
        const edits: PendingEditRequest[] = JSON.parse(storedEdits);
        setPendingRequests(edits.filter(e => e.status === 'Pending').length);
      }
    } catch {}

    if (!isFirebaseConfigured || !db) return;

    // Real-time Firestore snapshot listeners
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const roomsData: Room[] = [];
      snapshot.forEach((d) => {
        const data = d.data() || {};
        roomsData.push({
          id: d.id,
          roomNumber: String(data.roomNumber || ''),
          roomType: String(data.roomType || 'Standard'),
          price: Number(data.price) || 0,
          status: data.status || 'Available',
          branch: data.branch || 'Annex',
          amenities: data.amenities || [],
          description: data.description || '',
          maxGuests: data.maxGuests || 2
        });
      });
      currentRooms = roomsData;
      updateAvailableRooms(currentRooms, currentBookings);
    }, (err) => console.warn("WelcomeView rooms subscription error:", err));

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const bookingsData: Booking[] = [];
      snapshot.forEach((d) => {
        bookingsData.push({ id: d.id, ...d.data() } as Booking);
      });
      currentBookings = bookingsData;
      updateAvailableRooms(currentRooms, currentBookings);
    }, (err) => console.warn("WelcomeView bookings subscription error:", err));

    const unsubEdits = onSnapshot(collection(db, 'pendingEditRequests'), (snapshot) => {
      const editsData: PendingEditRequest[] = [];
      snapshot.forEach((d) => {
        editsData.push({ id: d.id, ...d.data() } as PendingEditRequest);
      });
      setPendingRequests(editsData.filter(e => e.status === 'Pending').length);
    }, (err) => console.warn("WelcomeView pending edits subscription error:", err));

    return () => {
      unsubRooms();
      unsubBookings();
      unsubEdits();
    };
  }, [currentUser]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-300 ${
      isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'
    }`}>
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Hotel className="text-white w-6 h-6" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Nabs Lodge</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onToggleTheme}
            className={`p-2.5 rounded-full transition-all ${
              isDarkMode 
                ? 'bg-slate-900 text-amber-400 border border-slate-800 hover:bg-slate-800' 
                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
            }`}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <button
            onClick={onLogout}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              isDarkMode 
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                : 'bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            <LogOut size={14} />
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 flex flex-col justify-center py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-12"
        >
          {/* Hero Section */}
          <div className="space-y-4">
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                isDarkMode ? 'bg-amber-500/10 text-amber-500' : 'bg-amber-50 text-amber-600'
              }`}
            >
              System Access Granted
            </motion.span>
            
            <h1 className="text-5xl md:text-7xl font-display font-black tracking-tighter leading-[0.9]">
              {getGreeting()}, <br />
              <span className="text-amber-500">{currentUser.name}.</span>
            </h1>
            
            <p className={`text-lg md:text-xl max-w-xl font-medium leading-relaxed ${
              isDarkMode ? 'text-zinc-400' : 'text-slate-500'
            }`}>
              Welcome to your centralized management hub. Select your module below to begin managing Nabs Lodge operations.
            </p>
          </div>

          {/* Quick Access Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onGoToDashboard}
              className={`group relative p-8 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between h-full ${
                isDarkMode 
                  ? 'bg-slate-900 border-slate-800 hover:border-amber-500/50 hover:bg-slate-900/80 shadow-2xl shadow-black/40' 
                  : 'bg-white border-slate-200 hover:border-amber-500/50 shadow-xl shadow-slate-200/50'
              }`}
            >
              <div className="flex flex-col space-y-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                  isDarkMode ? 'bg-amber-500/10 text-amber-500' : 'bg-amber-50 text-amber-500'
                }`}>
                  <LayoutDashboard size={28} />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-display font-bold tracking-tight">Main Dashboard</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Access room bookings, check-ins, financial reports, and real-time activity logs for the current session.
                  </p>
                </div>
              </div>
              <div className="pt-6 flex items-center text-xs font-black uppercase tracking-widest text-amber-500 gap-2">
                Launch Module <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            <div className="flex flex-col gap-6">
              <div className={`p-6 rounded-3xl border ${
                isDarkMode ? 'bg-slate-900/40 border-slate-800/50' : 'bg-slate-50/50 border-slate-100'
              }`}>
                <div className="flex items-center gap-4 opacity-90">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-500'
                  }`}>
                    <UserCircle size={24} />
                  </div>
                  
                  <div className="space-y-1 w-full">
                    <h3 className="text-base font-display font-bold tracking-tight">Session Info</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-300' : 'text-slate-600'}`}>
                          {currentUser.role}
                        </span>
                      </div>
                      {currentUser.branch && (
                        <div className="flex items-center gap-1.5">
                          <Briefcase size={14} className="text-amber-500" />
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-300' : 'text-slate-600'}`}>
                            {currentUser.branch}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-purple-500" />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-300' : 'text-slate-600'}`}>
                          {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {currentUser.role === 'Manager' && (
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className={`p-5 rounded-3xl border flex flex-col justify-start space-y-3 ${
                    isDarkMode ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50/50 border-emerald-100'
                  } max-h-[160px] overflow-hidden`}>
                    <div className="flex items-center gap-2 shrink-0">
                      <Key size={16} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Available Rooms</span>
                    </div>
                    <div className="space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-500/20 pr-1">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Ayigya Lodge ({mainAvailableRooms.length})</span>
                        </div>
                        {mainAvailableRooms.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {mainAvailableRooms.map((r, i) => (
                              <span key={`${r}-${i}`} className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${isDarkMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-200/50 text-emerald-700'}`}>
                                {r}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className={`text-[10px] italic ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>No rooms available</div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Annex Lodge ({annexAvailableRooms.length})</span>
                        </div>
                        {annexAvailableRooms.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {annexAvailableRooms.map((r, i) => (
                              <span key={`${r}-${i}`} className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${isDarkMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-200/50 text-emerald-700'}`}>
                                {r}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className={`text-[10px] italic ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>No rooms available</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={`p-5 rounded-3xl border flex flex-col justify-center space-y-3 ${
                    isDarkMode ? 'bg-amber-500/5 border-amber-500/10' : 'bg-amber-50/50 border-amber-100'
                  }`}>
                    <div className="flex items-center gap-2">
                      <ClipboardList size={16} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Pending</span>
                    </div>
                    <div className="flex flex-col flex-1 justify-center">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black font-display leading-none ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                          {pendingRequests}
                        </span>
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Requests</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer Decoration */}
      <footer className={`py-8 text-center text-[10px] font-medium tracking-[0.2em] uppercase opacity-40 ${
        isDarkMode ? 'text-white' : 'text-slate-900'
      }`}>
        Nabs Lodge Management System v3.2.0 • {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default WelcomeView;
