/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Room, Booking, AuditLog, Branch, RoomStatus, BookingStatus, PaymentStatus, Role, StaffUpdateInput, GlobalSettings, HandoverRecord, HandoverItemBreakdown, DrinkItem, DrinkSale } from './types';
import { db, safeSetDoc, safeUpdateDoc, safeDeleteDoc } from './firebase';
import { doc } from 'firebase/firestore';

const USERS_KEY = 'nabslodge_users';
const HANDOVERS_KEY = 'nabslodge_handovers';
const ROOMS_KEY = 'nabslodge_rooms';
const BOOKINGS_KEY = 'nabslodge_bookings';
const LOGS_KEY = 'nabslodge_logs';
const ACTIVITY_CATALOG_KEY = 'nabslodge_activity_catalog';
const SETTINGS_KEY = 'globalSettings_local';
const DRINKS_KEY = 'nabslodge_drinks';
const DRINK_SALES_KEY = 'nabslodge_drink_sales';

export const SIX_MONTHS_DAYS = 180; // 6 months retention period

export const getSettings = (): GlobalSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      return {
        checkInTime: parsed.checkInTime || '14:00',
        checkOutTime: parsed.checkOutTime || '11:00',
        lateCheckOutFee: parsed.lateCheckOutFee || 200,
        annexIp: parsed.annexIp || '',
        ayigyaIp: parsed.ayigyaIp || '',
        enforceIpRestrictions: !!parsed.enforceIpRestrictions,
        logRetentionDays: parsed.logRetentionDays || SIX_MONTHS_DAYS,
        autoPurgeEnabled: parsed.autoPurgeEnabled !== false
      };
    } catch (e) {}
  }
  return {
    checkInTime: '14:00',
    checkOutTime: '11:00',
    lateCheckOutFee: 200,
    annexIp: '',
    ayigyaIp: '',
    enforceIpRestrictions: false,
    logRetentionDays: SIX_MONTHS_DAYS,
    autoPurgeEnabled: true
  };
};

export const saveSettings = (settings: GlobalSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (db) {
    safeSetDoc(doc(db, 'settings', 'global'), settings, { merge: true });
  }
};

export const initialActivityCatalog: any[] = [];

export const getActivityCatalog = (): any[] => {
  const data = localStorage.getItem(ACTIVITY_CATALOG_KEY);
  if (!data) {
    return [];
  }
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return [];
};

export const saveActivityCatalog = (catalog: any[]) => {
  localStorage.setItem(ACTIVITY_CATALOG_KEY, JSON.stringify(catalog));
};

export const deleteActivityCatalogItem = async (id: string) => {
  const catalog = getActivityCatalog();
  const filtered = catalog.filter((item) => item.id !== id);
  localStorage.setItem(ACTIVITY_CATALOG_KEY, JSON.stringify(filtered));
  if (db) {
    safeDeleteDoc(doc(db, 'ActivityCatalog', id));
  }
};

// Helper to generate IDs
export const generateId = () => Math.random().toString(36).substring(2, 11);

// Helper to get formatted local date-time string
export const getFormattedDateTime = (d?: Date) => {
  const date = d || new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hoursStr = String(hours).padStart(2, '0');
  return `${month} ${day}, ${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
};

// Helper to safely format timestamp or date-time strings into exact local time (e.g., "02:30 PM")
export const formatAuditTime = (ts?: string | number): string => {
  if (!ts) return 'N/A';
  
  if (typeof ts === 'number') {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  const str = String(ts).trim();
  if (!str) return 'N/A';

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i;
  const match = str.match(timeRegex);
  if (match && match[1]) {
    return match[1];
  }

  const cleanStr = str.replace(/,/g, '');
  const parsedClean = new Date(cleanStr);
  if (!isNaN(parsedClean.getTime())) {
    return parsedClean.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return str;
};

// Initial Seed Data
const initialUsers: User[] = [
  {
    id: 'user_mgr_1',
    email: 'manager@nabslodge.com',
    password: 'password', // Standard plain-text password for simulation simplicity
    name: 'Chief Sualah Tellem',
    role: 'Manager',
    createdAt: 'Jul 10, 2026, 09:00:00 AM'
  },
  {
    id: 'user_mgr_sualah',
    email: 'sualahtellem@gmail.com',
    password: 'Dopekid12345',
    name: 'Sualah Tellem',
    role: 'Manager',
    createdAt: 'Jul 10, 2026, 09:00:00 AM'
  },
  {
    id: 'user_rec_1',
    email: 'annex_rec@nabslodge.com',
    password: 'password123',
    name: 'Amara Koffi',
    role: 'Receptionist',
    branch: 'Annex',
    createdAt: 'Jul 11, 2026, 10:15:00 AM'
  },
  {
    id: 'user_rec_2',
    email: 'ayigya_rec@nabslodge.com',
    password: 'password456',
    name: 'Kwame Mensah',
    role: 'Receptionist',
    branch: 'Ayigya',
    createdAt: 'Jul 12, 2026, 02:30:00 PM'
  }
];

const initialRooms: Room[] = [
  // Annex Branch (Standard, cozy aesthetic, near central Kumasi)
  {
    id: 'room_annex_101',
    roomNumber: '101',
    roomType: 'Single Standard',
    price: 350,
    status: 'Available',
    branch: 'Annex',
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Flat-screen TV'],
    description: 'Cozy and quiet single room suitable for single travelers.',
    maxGuests: 1
  },
  {
    id: 'room_annex_102',
    roomNumber: '102',
    roomType: 'Double Deluxe',
    price: 550,
    status: 'Available',
    branch: 'Annex',
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Flat-screen TV', 'Mini Fridge', 'Balcony'],
    description: 'Spacious double bed deluxe room with a wonderful sunset view balcony.',
    maxGuests: 2
  },
  {
    id: 'room_annex_103',
    roomNumber: '103',
    roomType: 'Executive Suite',
    price: 850,
    status: 'Available',
    branch: 'Annex',
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Smart TV', 'Mini Bar', 'Bathtub', 'Balcony', 'Breakfast Included'],
    description: 'Luxury suite featuring executive amenities and exclusive lounge access.',
    maxGuests: 3
  },
  // Ayigya Branch (Close to KNUST campus, high demand for business & academics)
  {
    id: 'room_ayigya_201',
    roomNumber: '201',
    roomType: 'Single Standard',
    price: 400,
    status: 'Available',
    branch: 'Ayigya',
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Desk & Study Lamp'],
    description: 'Fitted with academic study equipment, perfect for business trips and researchers.',
    maxGuests: 1
  },
  {
    id: 'room_ayigya_202',
    roomNumber: '202',
    roomType: 'Double Deluxe',
    price: 600,
    status: 'Available',
    branch: 'Ayigya',
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Flat-screen TV', 'Mini Fridge', 'Desk & Lounge Chair'],
    description: 'Premium double room optimized for dual occupancy and absolute relaxation.',
    maxGuests: 2
  },
  {
    id: 'room_ayigya_203',
    roomNumber: '203',
    roomType: 'VIP Presidential Suite',
    price: 1200,
    status: 'Available',
    branch: 'Ayigya',
    amenities: ['High-Speed Wi-Fi', 'Central AC', '65" Smart TV', 'Premium Mini Bar', 'Jacuzzi', 'Workstation', 'Complimentary Buffet'],
    description: 'The absolute height of luxury in Kumasi, complete with a private jacuzzi.',
    maxGuests: 4
  }
];

const initialBookings: Booking[] = [];

const initialLogs: AuditLog[] = [
  {
    id: 'log_1',
    timestamp: getFormattedDateTime(),
    userId: 'user_mgr_1',
    userName: 'Chief Sualah Tellem',
    userRole: 'Manager',
    branch: 'Global',
    action: 'Database Initialization',
    details: 'System db reset and launched with clean slate.'
  }
];

// DB Accessors
export const getUsers = (): User[] => {
  const data = localStorage.getItem(USERS_KEY);
  if (!data) {
    localStorage.setItem(USERS_KEY, JSON.stringify(initialUsers));
    return initialUsers;
  }
  let parsed = JSON.parse(data);
  // Migration for old schema without email
  let migrated = false;
  parsed = parsed.map((u: any) => {
    if (!u.email) {
      migrated = true;
      if (u.name === 'Chief Sualah Tellem' || u.id === 'user_mgr_1') {
        u.email = 'manager@nabslodge.com';
      } else if (u.name === 'Amara Koffi' || u.branch === 'Annex') {
        u.email = 'annex_rec@nabslodge.com';
      } else if (u.name === 'Kwame Mensah' || u.branch === 'Ayigya') {
        u.email = 'ayigya_rec@nabslodge.com';
      } else {
        u.email = 'receptionist@nabslodge.com'; // fallback
      }
    }
    if (!u.status) {
      migrated = true;
      u.status = 'Active';
    }
    return u;
  });
  if (migrated) {
    saveUsers(parsed);
  }
  return parsed;
};

function sanitizeForFirestore(data: any): any {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return data.map(v => sanitizeForFirestore(v));
  }
  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      if (data[key] !== undefined) {
        sanitized[key] = sanitizeForFirestore(data[key]);
      }
    }
    return sanitized;
  }
  return data;
}

export const saveUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const getRooms = (): Room[] => {
  const data = localStorage.getItem(ROOMS_KEY);
  if (!data) {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(initialRooms));
    return initialRooms;
  }
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      let needsSave = false;
      const rooms = parsed.map((r: any) => {
        if (!r.id) {
          r.id = `room_${Math.random().toString(36).substring(2, 9)}`;
          needsSave = true;
        }
        return {
          id: String(r.id),
          roomNumber: String(r.roomNumber || ''),
          roomType: String(r.roomType || 'Standard'),
          price: typeof r.price === 'number' ? r.price : Number(r.price || 0),
          status: (r.status || 'Available') as RoomStatus,
          branch: (r.branch || 'Annex') as Branch,
          amenities: Array.isArray(r.amenities) ? r.amenities : [],
          description: String(r.description || ''),
          maxGuests: typeof r.maxGuests === 'number' ? r.maxGuests : Number(r.maxGuests || 2),
          normalBookingPrice: typeof r.normalBookingPrice === 'number' ? r.normalBookingPrice : (r.normalBookingPrice ? Number(r.normalBookingPrice) : undefined),
          normalBookingMaxGuests: typeof r.normalBookingMaxGuests === 'number' ? r.normalBookingMaxGuests : (r.normalBookingMaxGuests ? Number(r.normalBookingMaxGuests) : undefined),
          occasionBookingPrice: typeof r.occasionBookingPrice === 'number' ? r.occasionBookingPrice : (r.occasionBookingPrice ? Number(r.occasionBookingPrice) : undefined),
          occasionBookingMaxGuests: typeof r.occasionBookingMaxGuests === 'number' ? r.occasionBookingMaxGuests : (r.occasionBookingMaxGuests ? Number(r.occasionBookingMaxGuests) : undefined),
          monthlyPremiumPrice: typeof r.monthlyPremiumPrice === 'number' ? r.monthlyPremiumPrice : (r.monthlyPremiumPrice ? Number(r.monthlyPremiumPrice) : undefined)
        };
      });
      if (needsSave) {
        saveRooms(rooms);
      }
      return rooms;
    }
  } catch (e) {
    console.error("Error parsing rooms from localStorage", e);
  }
  return initialRooms;
};

export const saveRooms = (rooms: Room[]) => {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
};

export const getBookings = (): Booking[] => {
  const data = localStorage.getItem(BOOKINGS_KEY);
  if (!data) {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(initialBookings));
    return initialBookings;
  }
  return JSON.parse(data);
};

export const saveBookings = (bookings: Booking[]) => {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
};

export const autoPurgeOldLogs = (retentionDays: number = SIX_MONTHS_DAYS): { purgedCount: number; remainingCount: number } => {
  const data = localStorage.getItem(LOGS_KEY);
  if (!data) return { purgedCount: 0, remainingCount: 0 };
  
  try {
    const logs: AuditLog[] = JSON.parse(data);
    const now = Date.now();
    const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
    
    const validLogs = logs.filter(log => {
      if (!log.timestamp) return true;
      const time = new Date(log.timestamp).getTime();
      if (isNaN(time)) return true;
      return (now - time) <= cutoffMs;
    });

    const purgedCount = logs.length - validLogs.length;
    if (purgedCount > 0) {
      saveLogs(validLogs);
    }
    return { purgedCount, remainingCount: validLogs.length };
  } catch (e) {
    return { purgedCount: 0, remainingCount: 0 };
  }
};

export const getLogs = (): AuditLog[] => {
  const data = localStorage.getItem(LOGS_KEY);
  if (!data) {
    localStorage.setItem(LOGS_KEY, JSON.stringify(initialLogs));
    return initialLogs;
  }
  let parsed: AuditLog[] = JSON.parse(data);

  // Auto-Purge enforcement for logs older than retention period (6 months / 180 days by default)
  const settings = getSettings();
  if (settings.autoPurgeEnabled !== false) {
    const retentionDays = settings.logRetentionDays || SIX_MONTHS_DAYS;
    const now = Date.now();
    const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
    const initialCount = parsed.length;
    parsed = parsed.filter(log => {
      if (!log.timestamp) return true;
      const time = new Date(log.timestamp).getTime();
      if (isNaN(time)) return true;
      return (now - time) <= cutoffMs;
    });
    if (parsed.length < initialCount) {
      saveLogs(parsed);
    }
  }

  // Sort descending by timestamp/date representation
  return parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const saveLogs = (logs: AuditLog[]) => {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
};

export const getHandovers = (): HandoverRecord[] => {
  const data = localStorage.getItem(HANDOVERS_KEY);
  if (!data) {
    return [];
  }
  try {
    const parsed: HandoverRecord[] = JSON.parse(data);
    return parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (e) {
    return [];
  }
};

export const saveHandovers = (handovers: HandoverRecord[]) => {
  localStorage.setItem(HANDOVERS_KEY, JSON.stringify(handovers));
};

export const initialDrinks: DrinkItem[] = [
  { id: 'drink_1', name: 'Coca Cola (330ml)', price: 15, category: 'Soft Drink', inStock: true, branch: 'All' },
  { id: 'drink_2', name: 'Fanta Orange (330ml)', price: 15, category: 'Soft Drink', inStock: true, branch: 'All' },
  { id: 'drink_3', name: 'Sprite (330ml)', price: 15, category: 'Soft Drink', inStock: true, branch: 'All' },
  { id: 'drink_4', name: 'Alvaro (Pear)', price: 20, category: 'Soft Drink', inStock: true, branch: 'All' },
  { id: 'drink_5', name: 'Maltina / Guinness Malt', price: 20, category: 'Soft Drink', inStock: true, branch: 'All' },
  { id: 'drink_9', name: 'Red Bull Energy Drink', price: 35, category: 'Energy Drink', inStock: true, branch: 'All' },
  { id: 'drink_10', name: 'Bel-Aqua Mineral Water (1.5L)', price: 10, category: 'Water', inStock: true, branch: 'All' },
  { id: 'drink_11', name: 'Bel-Aqua Mineral Water (500ml)', price: 5, category: 'Water', inStock: true, branch: 'All' }
];

export const getDrinks = (): DrinkItem[] => {
  const data = localStorage.getItem(DRINKS_KEY);
  if (!data) {
    localStorage.setItem(DRINKS_KEY, JSON.stringify(initialDrinks));
    return initialDrinks;
  }
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Clean up previous categories from localStorage (Beer, Wine, etc.) to only allowed ones
      const filtered = parsed.filter(d => ['Soft Drink', 'Energy Drink', 'Water'].includes(d.category || ''));
      if (filtered.length > 0) {
        return filtered;
      }
    }
    localStorage.setItem(DRINKS_KEY, JSON.stringify(initialDrinks));
    return initialDrinks;
  } catch (e) {
    return initialDrinks;
  }
};

export const saveDrinks = (drinks: DrinkItem[]) => {
  localStorage.setItem(DRINKS_KEY, JSON.stringify(drinks));
};

export const addDrink = (drink: Omit<DrinkItem, 'id'>): DrinkItem => {
  const drinks = getDrinks();
  const newDrink: DrinkItem = {
    ...drink,
    id: `drink_${generateId()}`,
    createdAt: getFormattedDateTime()
  };
  drinks.unshift(newDrink);
  saveDrinks(drinks);
  if (db) {
    safeSetDoc(doc(db, 'drinks', newDrink.id), newDrink, { merge: true });
  }
  return newDrink;
};

export const safeParseDateTimestamp = (str?: string): number => {
  if (!str) return 0;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();

  const parts = String(str).trim().split(' ');
  if (parts.length >= 2) {
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      let hour = 0;
      let minute = 0;
      let second = 0;
      const timeStr = parts[1];
      const ampm = parts[2] ? parts[2].toUpperCase() : '';
      const timeParts = timeStr.split(':');
      if (timeParts.length >= 2) {
        hour = parseInt(timeParts[0], 10);
        minute = parseInt(timeParts[1], 10);
        if (timeParts[2]) second = parseInt(timeParts[2], 10);
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
      }
      const parsedD = new Date(year, month, day, hour, minute, second);
      if (!isNaN(parsedD.getTime())) return parsedD.getTime();
    }
  }
  return 0;
};

export const getDrinkSales = (): DrinkSale[] => {
  const data = localStorage.getItem(DRINK_SALES_KEY);
  if (!data) return [];
  try {
    const parsed: DrinkSale[] = JSON.parse(data);
    return parsed.sort((a, b) => safeParseDateTimestamp(b.timestamp) - safeParseDateTimestamp(a.timestamp));
  } catch (e) {
    return [];
  }
};

export const saveDrinkSales = (sales: DrinkSale[]) => {
  localStorage.setItem(DRINK_SALES_KEY, JSON.stringify(sales));
};

export const updateDrinkSale = (sale: DrinkSale): { success: boolean; error?: string } => {
  const sales = getDrinkSales();
  const index = sales.findIndex((s) => s.id === sale.id);
  if (index === -1) return { success: false, error: 'Drink sale record not found.' };
  
  sales[index] = sale;
  saveDrinkSales(sales);
  if (db) {
    safeUpdateDoc(doc(db, 'drinkSales', sale.id), { status: sale.status, quantity: sale.quantity, totalPrice: sale.totalPrice, paymentMethod: sale.paymentMethod, note: sale.note });
  }
  return { success: true };
};

export const deleteDrinkSale = (id: string): { success: boolean; error?: string } => {
  const sales = getDrinkSales();
  const index = sales.findIndex((s) => s.id === id);
  if (index === -1) return { success: false, error: 'Drink sale record not found.' };
  
  const filtered = sales.filter((s) => s.id !== id);
  saveDrinkSales(filtered);
  if (db) {
    safeDeleteDoc(doc(db, 'drinkSales', id));
  }
  return { success: true };
};

export const addDrinkSale = (sale: Omit<DrinkSale, 'id' | 'timestamp'>): DrinkSale => {
  const sales = getDrinkSales();
  const newSale: DrinkSale = {
    ...sale,
    id: `drink_sale_${generateId()}`,
    serialNumber: `DRK-${Date.now().toString().slice(-6)}`,
    timestamp: getFormattedDateTime()
  };
  sales.unshift(newSale);
  saveDrinkSales(sales);
  if (db) {
    safeSetDoc(doc(db, 'drinkSales', newSale.id), newSale, { merge: true });
  }
  return newSale;
};

export const addHandover = (
  receptionistId: string,
  receptionistName: string,
  branch: Branch,
  cashAmount: number,
  momoAmount: number,
  totalAmount: number,
  roomCash: number,
  roomMomo: number,
  walkInCash: number,
  walkInMomo: number,
  drinkCash: number = 0,
  drinkMomo: number = 0,
  notes?: string,
  itemsBreakdown?: HandoverItemBreakdown[]
): HandoverRecord => {
  const handovers = getHandovers();
  const newHandover: HandoverRecord = {
    id: `handover_${generateId()}`,
    receptionistId,
    receptionistName,
    branch,
    timestamp: getFormattedDateTime(),
    roomCash,
    roomMomo,
    walkInCash,
    walkInMomo,
    drinkCash,
    drinkMomo,
    cashAmount,
    momoAmount,
    totalAmount,
    notes: notes || '',
    itemsBreakdown: itemsBreakdown || []
  };
  handovers.unshift(newHandover);
  saveHandovers(handovers);
  if (db) {
    safeSetDoc(doc(db, 'handovers', newHandover.id), newHandover, { merge: true });
  }
  
  // Log this handover in system AuditLogs
  addAuditLog(
    receptionistId,
    receptionistName,
    'Receptionist',
    branch,
    'Shift Handover Logged',
    `Handed over Cash: GH₵${cashAmount.toFixed(2)}, MoMo: GH₵${momoAmount.toFixed(2)}, Total: GH₵${totalAmount.toFixed(2)} (${(itemsBreakdown || []).length} itemized actions)`
  );
  
  return newHandover;
};

export const clearMockStateToBlankSlate = () => {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify([]));
  localStorage.setItem(LOGS_KEY, JSON.stringify(initialLogs));
  localStorage.setItem(HANDOVERS_KEY, JSON.stringify([]));
  localStorage.setItem('nabslodge_room_revenues', JSON.stringify([]));
  localStorage.setItem('nabslodge_activity_transactions', JSON.stringify([]));
  localStorage.setItem(DRINK_SALES_KEY, JSON.stringify([]));
  const rooms = initialRooms.map(r => ({ ...r, status: 'Available' as RoomStatus }));
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  localStorage.setItem('nabslodge_blank_slate_cleared_v5', 'true');
  window.dispatchEvent(new Event('handoversUpdated'));
};

export const purgeAndResetDatabase = async () => {
  console.log("Purging all transaction/booking data from local storage for a blank slate...");
  clearMockStateToBlankSlate();
  console.log("Database successfully reset to a clean blank slate.");
};

export const initializeDb = () => {
  if (localStorage.getItem('nabslodge_blank_slate_cleared_v5') !== 'true') {
    clearMockStateToBlankSlate();
  }
  getUsers();
  getRooms();
  getBookings();
  autoPurgeOldLogs(SIX_MONTHS_DAYS);
  getLogs();
  getActivityCatalog();
  getHandovers();
};

// Log logger helper
export const addAuditLog = (
  userId: string,
  userName: string,
  userRole: Role,
  branch: Branch | 'Global',
  action: string,
  details?: string
): AuditLog => {
  const logs = getLogs();
  const newLog: AuditLog = {
    id: `log_${generateId()}`,
    timestamp: getFormattedDateTime(),
    userId,
    userName,
    userRole,
    branch,
    action,
    details
  };
  logs.unshift(newLog); // Prepend so it's top of list
  saveLogs(logs);
  if (db) {
    safeSetDoc(doc(db, 'auditLogs', newLog.id), newLog, { merge: true });
  }
  return newLog;
};

// Authenticate a user
export const authenticateUser = (email: string, password?: string): { user?: User, error?: string } => {
  if (!email.includes('@')) {
    return { error: 'Invalid email format. Please provide a valid email address.' };
  }

  const users = getUsers();
  const foundByEmail = users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
  
  if (!foundByEmail) {
    return { error: 'No account found with this email address.' };
  }

  if (foundByEmail.password !== password) {
    return { error: 'Incorrect password for this account.' };
  }

  if (!foundByEmail.role) {
    return { error: 'This account has no assigned role and cannot access the system.' };
  }

  // Generate a secure simulation log entry
  addAuditLog(
    foundByEmail.id,
    foundByEmail.name,
    foundByEmail.role,
    foundByEmail.branch || 'Global',
    'User Authentication',
    `User ${foundByEmail.name} logged in successfully.`
  );
  return { user: foundByEmail };
};

// --- CRUD FOR RECEPTIONIST ACCOUNTS (Manager only) ---

export const createReceptionist = (
  managerId: string,
  managerName: string,
  email: string,
  password?: string,
  name?: string,
  branch?: Branch,
  uid?: string
): { success: boolean; error?: string; user?: User } => {
  const users = getUsers();
  
  if (!email || !password || !name || !branch) {
    return { success: false, error: 'All receptionist parameters are required.' };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const exists = users.some((u) => u.email.toLowerCase() === normalizedEmail);
  if (exists) {
    return { success: false, error: `Email "${email}" already exists in the system.` };
  }

  const newUser: User = {
    id: uid || `user_rec_${generateId()}`,
    email: normalizedEmail,
    password: password,
    name: name,
    role: 'Receptionist',
    branch: branch,
    createdAt: getFormattedDateTime(),
    status: 'Active'
  };

  users.push(newUser);
  saveUsers(users);

  addAuditLog(
    managerId,
    managerName,
    'Manager',
    'Global',
    'Create Receptionist Account',
    `Created receptionist "${name}" (${email}) for branch: Nabslodge ${branch}`
  );

  return { success: true, user: newUser };
};

export const updateReceptionist = (
  managerId: string,
  managerName: string,
  input: StaffUpdateInput
): { success: boolean; error?: string } => {
  const users = getUsers();
  const { id, email, password, name, branch, status } = input;
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    return { success: false, error: 'Receptionist not found.' };
  }

  if (!email || !password || !name || !branch) {
    return { success: false, error: 'All fields are required.' };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const exists = users.some((u) => u.id !== id && u.email.toLowerCase() === normalizedEmail);
  if (exists) {
    return { success: false, error: `Email "${email}" is already taken.` };
  }

  const oldUser = users[index];
  users[index] = {
    ...oldUser,
    email: normalizedEmail,
    password,
    name,
    branch,
    status: status || 'Active'
  };

  saveUsers(users);

  addAuditLog(
    managerId,
    managerName,
    'Manager',
    'Global',
    'Update Receptionist Account',
    `Modified credentials/profile of "${name}" (${email}). Status: ${status || 'Active'}. Assigned branch: Nabslodge ${branch}`
  );

  return { success: true };
};

export const deleteReceptionist = (
  managerId: string,
  managerName: string,
  id: string
): { success: boolean; error?: string } => {
  const users = getUsers();
  const userToDelete = users.find((u) => u.id === id);
  if (!userToDelete) {
    return { success: false, error: 'Receptionist account not found.' };
  }

  const filtered = users.filter((u) => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
  if (db) {
    safeDeleteDoc(doc(db, 'users', id));
  }

  addAuditLog(
    managerId,
    managerName,
    'Manager',
    'Global',
    'Delete Receptionist Account',
    `Permanently deleted receptionist account: "${userToDelete.name}" (${userToDelete.email})`
  );

  return { success: true };
};

// --- CRUD FOR ROOMS (Manager only) ---

export const createRoom = (
  managerId: string,
  managerName: string,
  roomNumber: string,
  roomType: string,
  price: number,
  branch: Branch,
  amenities: string[],
  description?: string,
  maxGuests?: number,
  monthlyPremiumPrice?: number
): { success: boolean; error?: string; room?: Room } => {
  const rooms = getRooms();
  
  if (!roomNumber || !roomType || price <= 0 || !branch) {
    return { success: false, error: 'Invalid room details. Number, type, valid price, and branch are required.' };
  }

  // Ensure unique room number WITHIN the same branch
  const exists = rooms.some((r) => r.branch === branch && r.roomNumber === roomNumber);
  if (exists) {
    return { success: false, error: `Room ${roomNumber} already exists in the Nabslodge ${branch} branch.` };
  }

  const newRoom: Room = {
    id: `room_${branch.toLowerCase()}_${generateId()}`,
    roomNumber,
    roomType,
    price,
    status: 'Available',
    branch,
    amenities,
    description: description || '',
    maxGuests: maxGuests || 2,
    monthlyPremiumPrice
  };

  rooms.push(newRoom);
  saveRooms(rooms);
  if (db) {
    safeSetDoc(doc(db, 'rooms', newRoom.id), newRoom, { merge: true });
  }

  addAuditLog(
    managerId,
    managerName,
    'Manager',
    'Global',
    'Create Room',
    `Added Room ${roomNumber} (${roomType}) in Nabslodge ${branch} at GH₵${price.toFixed(2)}/night.`
  );

  return { success: true, room: newRoom };
};

export const updateRoom = (
  userId: string,
  userName: string,
  userRole: Role,
  roomId: string,
  roomNumber: string,
  roomType: string,
  price: number,
  status: RoomStatus,
  branch: Branch,
  amenities: string[],
  description?: string,
  maxGuests?: number
): { success: boolean; error?: string } => {
  const rooms = getRooms();
  const index = rooms.findIndex((r) => r.id === roomId);
  if (index === -1) {
    return { success: false, error: 'Room not found.' };
  }

  // Validate number uniqueness if changing room number
  const exists = rooms.some(
    (r) => r.id !== roomId && r.branch === branch && r.roomNumber === roomNumber
  );
  if (exists) {
    return { success: false, error: `Room ${roomNumber} already exists in Nabslodge ${branch}.` };
  }

  const oldRoom = rooms[index];
  rooms[index] = {
    ...oldRoom,
    roomNumber,
    roomType,
    price,
    status,
    branch,
    amenities,
    description: description || '',
    maxGuests: maxGuests || 2
  };

  saveRooms(rooms);
  if (db) {
      safeUpdateDoc(doc(db, 'rooms', roomId), { status: status });
    }

  addAuditLog(
    userId,
    userName,
    userRole,
    userRole === 'Manager' ? 'Global' : branch,
    'Update Room Config',
    `Updated Room ${roomNumber} (${branch}) details. Status: ${status}, Price: GH₵${price.toFixed(2)}`
  );

  return { success: true };
};

export const deleteRoom = (
  managerId: string,
  managerName: string,
  roomId: string
): { success: boolean; error?: string } => {
  const rooms = getRooms();
  const roomToDelete = rooms.find((r) => r.id === roomId);
  if (!roomToDelete) {
    return { success: false, error: 'Room not found.' };
  }

  // Verify room is not currently occupied
  if (roomToDelete.status === 'Occupied') {
    return { success: false, error: 'Cannot delete an occupied room. Check out guests first.' };
  }

  const filtered = rooms.filter((r) => r.id !== roomId);
  localStorage.setItem(ROOMS_KEY, JSON.stringify(filtered));
  if (db) {
    safeDeleteDoc(doc(db, 'rooms', roomId));
  }

  addAuditLog(
    managerId,
    managerName,
    'Manager',
    'Global',
    'Delete Room',
    `Removed Room ${roomToDelete.roomNumber} from Nabslodge ${roomToDelete.branch} branch.`
  );

  return { success: true };
};

// --- BOOKING OPERATIONS (Receptionist primarily, or automated auditing) ---

export const createBooking = (booking: Booking): { success: boolean; error?: string; booking?: Booking } => {
  const rooms = getRooms();
  const roomIndex = rooms.findIndex((r) => r.id === booking.roomId);
  
  if (roomIndex === -1) {
    return { success: false, error: 'Room does not exist.' };
  }

  const room = rooms[roomIndex];
  if (room.branch !== booking.branch) {
    return { success: false, error: 'Unauthorized: Room belongs to another branch.' };
  }

  // Update room status to Occupied only if guest is actually CheckedIn
  const isCheckedIn = booking.status === 'CheckedIn' || (booking.status as string) === 'checked_in';
  if (isCheckedIn) {
    rooms[roomIndex].status = 'Occupied';
    saveRooms(rooms);
  }

  // Add booking
  const bookings = getBookings();
  bookings.push(booking);
  saveBookings(bookings);

  if (db) {
    if (isCheckedIn) {
      safeUpdateDoc(doc(db, 'rooms', room.id), { status: 'Occupied' });
    }
    safeSetDoc(doc(db, 'bookings', booking.id), booking, { merge: true });
  }

  addAuditLog(
    booking.receptionistId,
    booking.receptionistName,
    'Receptionist',
    booking.branch,
    `Check-in Guest: ${booking.guestName}`,
    `Room: ${room.roomNumber}, Payment: ${booking.paymentStatus}`
  );

  return { success: true, booking };
};

export const checkoutBooking = (
  receptionistId: string,
  receptionistName: string,
  bookingId: string,
  nextRoomStatus: RoomStatus = 'Available',
  finalTotalPrice?: number,
  lateCheckOutFeeApplied?: number,
  checkoutPaymentMethod?: 'Cash' | 'Mobile Money',
  finalDiscountType?: string,
  finalDiscountAmount?: number
): { success: boolean; error?: string; booking?: Booking } => {
  const bookings = getBookings();
  const bookingIndex = bookings.findIndex((b) => b.id === bookingId);
  if (bookingIndex === -1) {
    return { success: false, error: 'Booking record not found.' };
  }

  const booking = bookings[bookingIndex];
  if (booking.status === 'CheckedOut' || booking.status === 'checked_out' || booking.status === 'Cancelled') {
    return { success: false, error: 'This booking is already checked out or cancelled.' };
  }

  // Settle any unpaid drink sales linked to this booking or room
  const drinkSales = getDrinkSales();
  let drinksUpdated = false;
  let unpaidDrinksTotal = 0;
  drinkSales.forEach((sale) => {
    const isMatch = sale.bookingId === bookingId || (sale.roomNumber && booking.roomNumber && sale.roomNumber === booking.roomNumber);
    const isUnpaid = sale.paymentStatus === 'Unpaid' || sale.paymentStatus === 'Split' || sale.paymentStatus?.startsWith('Partially') || sale.paymentMethod === 'Unpaid (Add to Room Bill)';
    if (isMatch && isUnpaid) {
      const unpaidAmt = sale.unpaidAmount || (sale.totalPrice - (sale.paidAmount || 0)) || sale.totalPrice;
      unpaidDrinksTotal += unpaidAmt;
      sale.paymentStatus = 'Paid';
      sale.paidAmount = sale.totalPrice;
      sale.unpaidAmount = 0;
      if (checkoutPaymentMethod) {
        sale.settledPaymentMethod = checkoutPaymentMethod;
      }
      drinksUpdated = true;
    }
  });
  if (drinksUpdated) {
    saveDrinkSales(drinkSales);
  }

  // Update booking record
  bookings[bookingIndex].status = 'CheckedOut';
  bookings[bookingIndex].actualCheckOutDate = getFormattedDateTime();
  const roomStayTotal = finalTotalPrice !== undefined ? finalTotalPrice : bookings[bookingIndex].totalPrice;
  const hasLateFee = Number(lateCheckOutFeeApplied || 0) > 0;
  const priorPaid = Number(bookings[bookingIndex].priorAmountPaid || bookings[bookingIndex].amountPaid || bookings[bookingIndex].deposit || 0);

  if (!bookings[bookingIndex].priorAmountPaid && priorPaid > 0) {
    bookings[bookingIndex].priorAmountPaid = priorPaid;
  }

  bookings[bookingIndex].totalPrice = roomStayTotal;
  bookings[bookingIndex].paymentStatus = 'Paid';
  bookings[bookingIndex].amountPaid = roomStayTotal + unpaidDrinksTotal;
  bookings[bookingIndex].deposit = roomStayTotal + unpaidDrinksTotal;
  bookings[bookingIndex].balance_due = 0;
  bookings[bookingIndex].pending_payment = 0;

  if (lateCheckOutFeeApplied !== undefined) {
    (bookings[bookingIndex] as any).lateCheckOutFeeApplied = lateCheckOutFeeApplied;
  }
  if (finalDiscountType !== undefined) {
    bookings[bookingIndex].discountType = finalDiscountType;
  }
  if (finalDiscountAmount !== undefined) {
    bookings[bookingIndex].discountAmount = finalDiscountAmount;
  }
  saveBookings(bookings);

  // Update Room status back to available
  const rooms = getRooms();
  const roomIndex = rooms.findIndex((r) => r.id === booking.roomId);
  if (roomIndex !== -1) {
    rooms[roomIndex].status = nextRoomStatus;
    saveRooms(rooms);
  }

  if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), {
      status: nextRoomStatus === 'Cleaning' ? 'CheckedOut' : 'CheckedOut',
      paymentStatus: 'Paid',
      totalPrice: bookings[bookingIndex].totalPrice,
      lateCheckOutFee: (bookings[bookingIndex] as any).lateCheckOutFeeApplied || 0,
      paymentMethod: checkoutPaymentMethod || 'Cash',
      discountType: bookings[bookingIndex].discountType,
      discountAmount: bookings[bookingIndex].discountAmount
    });
    if (roomIndex !== -1) {
      safeUpdateDoc(doc(db, 'rooms', booking.roomId), { status: nextRoomStatus });
    }
  }

  addAuditLog(
    receptionistId,
    receptionistName,
    'Receptionist',
    booking.branch,
    `Check-out Guest: ${booking.guestName}`,
    `Room: ${booking.roomNumber} checkout completed. Final invoice GH₵${bookings[bookingIndex].totalPrice.toFixed(2)} paid in full. Room marked as ${nextRoomStatus}.`
  );

  return { success: true, booking: bookings[bookingIndex] };
};

export const cancelBooking = (
  receptionistId: string,
  receptionistName: string,
  bookingId: string
): { success: boolean; error?: string; booking?: Booking } => {
  const bookings = getBookings();
  const bookingIndex = bookings.findIndex((b) => b.id === bookingId);
  if (bookingIndex === -1) {
    return { success: false, error: 'Booking record not found.' };
  }

  const booking = bookings[bookingIndex];
  if (booking.status !== 'CheckedIn' && booking.status !== 'Pending') {
    return { success: false, error: 'Only active Checked-In or Pending bookings can be cancelled.' };
  }

  // Update booking record
  bookings[bookingIndex].status = 'Cancelled';
  saveBookings(bookings);

  // Update Room status back to available
  const rooms = getRooms();
  const roomIndex = rooms.findIndex((r) => r.id === booking.roomId);
  if (roomIndex !== -1) {
    rooms[roomIndex].status = 'Available';
    saveRooms(rooms);
  }

  if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), {
      status: 'Cancelled'
    });
    if (roomIndex !== -1) {
      safeUpdateDoc(doc(db, 'rooms', booking.roomId), { status: 'Available' });
    }
  }

  addAuditLog(
    receptionistId,
    receptionistName,
    'Receptionist',
    booking.branch,
    `Cancel Booking: ${booking.guestName}`,
    `Room: ${booking.roomNumber} booking cancelled.`
  );

  return { success: true, booking: bookings[bookingIndex] };
};

export const updateBookingPayment = (
  receptionistId: string,
  receptionistName: string,
  bookingId: string,
  paymentStatus: PaymentStatus
): { success: boolean; error?: string; booking?: Booking } => {
  const bookings = getBookings();
  const index = bookings.findIndex((b) => b.id === bookingId);
  if (index === -1) {
    return { success: false, error: 'Booking not found.' };
  }

  const booking = bookings[index];
  bookings[index].paymentStatus = paymentStatus;
  if (paymentStatus === 'Paid') {
    bookings[index].amountPaid = bookings[index].totalPrice;
    bookings[index].deposit = bookings[index].totalPrice;
    bookings[index].balance_due = 0;
    bookings[index].pending_payment = 0;

    // Settle any unpaid drink sales linked to this booking
    const drinkSales = getDrinkSales();
    let drinksUpdated = false;
    drinkSales.forEach((sale) => {
      if (sale.bookingId === bookingId && (sale.paymentStatus === 'Unpaid' || sale.paymentStatus === 'Split')) {
        sale.paymentStatus = 'Paid';
        sale.paidAmount = sale.totalPrice;
        sale.unpaidAmount = 0;
        
        drinksUpdated = true;
      }
    });
    if (drinksUpdated) {
      saveDrinkSales(drinkSales);
    }
  }
  saveBookings(bookings);
  if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), { paymentStatus: paymentStatus });
  }

  addAuditLog(
    receptionistId,
    receptionistName,
    'Receptionist',
    booking.branch,
    'Update Payment Status',
    `Guest ${booking.guestName} (Room ${booking.roomNumber}) payment updated to: ${paymentStatus}`
  );

  return { success: true, booking: bookings[index] };
};

export const updateRoomStatus = (
  userId: string,
  userName: string,
  userRole: Role,
  roomId: string,
  status: RoomStatus
): { success: boolean; error?: string } => {
  const rooms = getRooms();
  const index = rooms.findIndex((r) => r.id === roomId);
  if (index === -1) {
    return { success: false, error: 'Room not found.' };
  }

  const room = rooms[index];
  if (room.status === 'Occupied' && status !== 'Occupied') {
    return { success: false, error: 'Cannot change status of occupied room. Please complete guest check-out first.' };
  }

  const oldStatus = room.status;
  room.status = status;
  saveRooms(rooms);
  if (db) {
    safeUpdateDoc(doc(db, 'rooms', roomId), { status: status });
  }

  addAuditLog(
    userId,
    userName,
    userRole,
    room.branch,
    'Update Room Status',
    `Room ${room.roomNumber} status changed from ${oldStatus} to ${status}.`
  );

  return { success: true };
};


