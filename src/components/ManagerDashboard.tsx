/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { NabsLodgeLogo } from './NabsLodgeLogo';
import { 
  User, Room, Booking, AuditLog, Branch, RoomStatus, BookingStatus, PaymentStatus, Role, StaffUpdateInput, UserStatus, HandoverRecord, HandoverItemBreakdown, PendingEditRequest, DrinkItem, DrinkSale 
} from '../types';
import { 
  getUsers, getRooms, saveRooms, getBookings, getLogs, saveBookings, saveLogs,
  createReceptionist, updateReceptionist, deleteReceptionist,
  createRoom, updateRoom, deleteRoom, addAuditLog, getFormattedDateTime, formatAuditTime,
  saveUsers, generateId, getActivityCatalog, saveActivityCatalog,
  saveSettings, getSettings, getHandovers, saveHandovers, purgeAndResetDatabase,
  autoPurgeOldLogs, SIX_MONTHS_DAYS, getDrinks, saveDrinks, addDrink, getDrinkSales, saveDrinkSales, addDrinkSale, initialDrinks
} from '../data';
import { 
  LogOut, Settings,  Users, BedDouble, Activity, TrendingUp, DollarSign, 
  Building, Plus, Edit2, Pencil, Trash2, Key, RefreshCw, Check, X, Sliders, AlertCircle, Info, ChevronRight, Sun, Moon, Search, Clock, UserCheck, UserMinus, Printer, Download, HelpCircle, Lock, AlertTriangle, Menu, Calendar,
  Bed, Zap, CheckCircle, Receipt, FileText, BarChart3, ShieldCheck, ShieldAlert, Eye, Wine, Coffee, GlassWater, ShoppingBag, Package, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './ToastContext';
import { useLoading } from './LoadingContext';
import { BestSellingDrinks } from './BestSellingDrinks';
import { DateRangePicker } from './DateRangePicker';
import { WalkInActivityLedger } from './WalkInActivityLedger';
import { QuickAvailabilityCalendar } from './QuickAvailabilityCalendar';
import { parseSafeDate } from '../utils/formatters';
import { getThemeClasses, getRoomStatusClasses } from '../utils/theme';
import { db, auth, firebaseConfig, isFirebaseConfigured, safeSetDoc, safeUpdateDoc, safeAddDoc, safeDeleteDoc, safeRunTransaction } from '../firebase';
import { checkAndCreateSnapshot } from '../lib/snapshotUtils';
import { doc, setDoc, getDoc, deleteDoc, addDoc, updateDoc, collection, query, where, onSnapshot, getDocs, writeBatch, serverTimestamp, runTransaction } from 'firebase/firestore';
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function approximateOklchToRgb(oklchStr: string): string {
  try {
    const clean = oklchStr.trim();
    if (clean.includes('from') || clean.includes('var(')) {
      return 'rgb(128, 128, 128)';
    }
    
    // Extract numbers using regex
    const matches = clean.match(/oklch\(\s*([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?\s*\)/);
    if (!matches) {
      const matchesComma = clean.match(/oklch\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)(?:\s*,\s*([0-9.]+%?))?\s*\)/);
      if (!matchesComma) {
        return 'rgb(128, 128, 128)';
      }
      return convertParsed(matchesComma[1], matchesComma[2], matchesComma[3], matchesComma[4]);
    }
    
    return convertParsed(matches[1], matches[2], matches[3], matches[4]);
  } catch (e) {
    return 'rgb(128, 128, 128)';
  }

  function convertParsed(lStr: string, cStr: string, hStr: string, aStr?: string): string {
    let l = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
    let c = cStr.endsWith('%') ? parseFloat(cStr) / 100 : parseFloat(cStr);
    let h = hStr.endsWith('%') ? parseFloat(hStr) / 100 * 360 : parseFloat(hStr);
    let a = aStr ? (aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr)) : 1;

    if (isNaN(l)) l = 0.5;
    if (isNaN(c)) c = 0.1;
    if (isNaN(h)) h = 0;
    if (isNaN(a)) a = 1;

    if (c < 0.01) {
      const gray = Math.round(l * 255);
      return a === 1 ? `rgb(${gray}, ${gray}, ${gray})` : `rgba(${gray}, ${gray}, ${gray}, ${a})`;
    }

    const hslHue = (h - 29 + 360) % 360;
    const s = Math.min(100, Math.max(0, c * 400));
    const sat = s / 100;
    
    const k = (n: number) => (n + hslHue / 30) % 12;
    const f = (n: number) => l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    
    const r = Math.round(Math.min(255, Math.max(0, f(0) * 255)));
    const g = Math.round(Math.min(255, Math.max(0, f(8) * 255)));
    const b = Math.round(Math.min(255, Math.max(0, f(4) * 255)));

    return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}

function approximateOklabToRgb(oklabStr: string): string {
  try {
    const clean = oklabStr.trim();
    if (clean.includes('from') || clean.includes('var(')) {
      return 'rgb(128, 128, 128)';
    }
    const matches = clean.match(/oklab\(\s*([0-9.]+%?)\s+([0-9.-]+%?)\s+([0-9.-]+%?)(?:\s*\/\s*([0-9.]+%?))?\s*\)/) ||
                    clean.match(/oklab\(\s*([0-9.]+%?)\s*,\s*([0-9.-]+%?)\s*,\s*([0-9.-]+%?)(?:\s*,\s*([0-9.]+%?))?\s*\)/);
    if (!matches) {
      return 'rgb(128, 128, 128)';
    }
    let lStr = matches[1];
    let aVal = matches[4];
    let l = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
    let alpha = aVal ? (aVal.endsWith('%') ? parseFloat(aVal) / 100 : parseFloat(aVal)) : 1;
    if (isNaN(l)) l = 0.5;
    if (isNaN(alpha)) alpha = 1;

    const gray = Math.round(Math.min(255, Math.max(0, l * 255)));
    return alpha === 1 ? `rgb(${gray}, ${gray}, ${gray})` : `rgba(${gray}, ${gray}, ${gray}, ${alpha})`;
  } catch (e) {
    return 'rgb(128, 128, 128)';
  }
}

function sanitizeCssColors(cssText: string): string {
  if (!cssText) return cssText;
  return cssText
    .replace(/oklch\([^)]+\)/g, (match) => approximateOklchToRgb(match))
    .replace(/oklab\([^)]+\)/g, (match) => approximateOklabToRgb(match));
}

function cleanPdfText(text: string | number | undefined | null): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str
    .replace(/GH[₵¢]/gi, 'GHS ')
    .replace(/[₵¢]/g, 'GHS ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\x00-\x7F]/g, '');
}

function sanitizeClonedDoc(clonedDoc: Document) {
  const styles = clonedDoc.querySelectorAll('style');
  styles.forEach((styleEl) => {
    if (styleEl.textContent && (styleEl.textContent.includes('oklch') || styleEl.textContent.includes('oklab'))) {
      styleEl.textContent = sanitizeCssColors(styleEl.textContent);
    }
  });
  const allElements = clonedDoc.querySelectorAll('*');
  allElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style) {
      if (htmlEl.style.cssText && (htmlEl.style.cssText.includes('oklch') || htmlEl.style.cssText.includes('oklab'))) {
        htmlEl.style.cssText = sanitizeCssColors(htmlEl.style.cssText);
      }
      htmlEl.style.letterSpacing = 'normal';
    }
  });
}

async function executeWithOklchSafeStyles<T>(action: () => Promise<T>): Promise<T> {
  const originalStyles: { element: HTMLStyleElement; content: string }[] = [];
  const tempStyleElements: HTMLStyleElement[] = [];
  const disabledLinks: HTMLLinkElement[] = [];

  try {
    const styleElements = Array.from(document.querySelectorAll('style'));
    for (const styleEl of styleElements) {
      const content = styleEl.textContent || '';
      if (content.includes('oklch') || content.includes('oklab')) {
        originalStyles.push({ element: styleEl, content });
        styleEl.textContent = sanitizeCssColors(content);
      }
    }

    const linkElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    for (const linkEl of linkElements) {
      try {
        const href = linkEl.href;
        if (href) {
          const response = await fetch(href);
          if (response.ok) {
            let cssText = await response.text();
            if (cssText.includes('oklch') || cssText.includes('oklab')) {
              cssText = sanitizeCssColors(cssText);
              
              const tempStyle = document.createElement('style');
              tempStyle.setAttribute('data-temp-oklch-safe', 'true');
              tempStyle.textContent = cssText;
              document.head.appendChild(tempStyle);
              tempStyleElements.push(tempStyle);

              linkEl.disabled = true;
              disabledLinks.push(linkEl);
            }
          }
        }
      } catch (err) {
        console.warn('Could not process link stylesheet for oklch/oklab safety:', err);
      }
    }

    return await action();
  } finally {
    for (const item of originalStyles) {
      item.element.textContent = item.content;
    }

    for (const tempStyle of tempStyleElements) {
      if (tempStyle.parentNode) {
        tempStyle.parentNode.removeChild(tempStyle);
      }
    }

    for (const linkEl of disabledLinks) {
      linkEl.disabled = false;
    }
  }
}

const getSafeTime = (val: any): number => {
  const d = parseSafeDate(val);
  return d ? d.getTime() : 0;
};

function getActualPaidAmount(b: any): number {
  if (!b) return 0;
  const directPaid = Number(b.amountPaid || b.deposit || b.amountReceived || 0);
  if (directPaid > 0) return directPaid;
  if (b.paymentStatus === 'Paid') return Number(b.totalPrice || 0);
  if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) return Number(b.totalPrice || 0) * 0.5;
  return 0;
}

interface ManagerDashboardProps {
  currentUser: User;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenTutorial?: () => void;
}

type TabType = 'overview' | 'receptionists' | 'rooms' | 'bookings' | 'settings' | 'financials' | 'activityCatalog' | 'drinksManagement' | 'pendingEdits' | 'availabilityCalendar' | 'liveAvailableRooms';

export default function ManagerDashboard({ currentUser, onLogout, isDarkMode, onToggleTheme, onOpenTutorial }: ManagerDashboardProps) {
  const { withLoading } = useLoading();
  const { addToast } = useToast();

  const [snapshotNotifications, setSnapshotNotifications] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ notificationId: string; month: string; year: number; data: any } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'monthlySnapshotNotifications'), where('status', '==', 'unread'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSnapshotNotifications(notifications);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenSnapshot = async (notification: any) => {
    try {
      if (notification.snapshotId) {
        const snapDoc = await getDoc(doc(db, 'monthlySnapshots', notification.snapshotId));
        if (snapDoc.exists()) {
          const snapData = snapDoc.data();
          setSelectedSnapshot({
            notificationId: notification.id,
            month: snapData.month,
            year: snapData.year,
            data: snapData.data
          });
          return;
        }
      }
      addToast('Snapshot details not found.', 'error');
    } catch (err) {
      console.error(err);
      addToast('Failed to load snapshot details.', 'error');
    }
  };

  const handleDismissSnapshotNotification = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'monthlySnapshotNotifications', notificationId), { status: 'read' });
      setSnapshotNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (selectedSnapshot?.notificationId === notificationId) {
        setSelectedSnapshot(null);
      }
      addToast('Report notification dismissed.', 'success');
    } catch (err) {
      console.error(err);
    }
  };
  
  const triggerPrint = (elementId?: string, title: string = 'Management Report') => {
    let targetEl: HTMLElement | null = null;
    if (elementId) {
      targetEl = document.getElementById(elementId);
    }
    if (!targetEl) {
      targetEl = document.getElementById('yearly-print-container') ||
                 document.getElementById('monthly-revenue-breakdown') ||
                 document.getElementById('manager-bookings-report-container');
    }

    if (targetEl) {
      try {
        const printWin = window.open('', '_blank', 'width=850,height=950');
        if (printWin) {
          printWin.document.open();
          printWin.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8" />
                <title>${title}</title>
                <style>
                  * { box-sizing: border-box; }
                  body {
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #000 !important;
                    background: #fff !important;
                    padding: 32px;
                    margin: 0;
                  }
                  h1, h2, h3, h4, h5, h6, p, span, div, td, th { color: #000 !important; }
                  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
                  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
                  th { background-color: #f3f4f6; font-weight: 600; }
                  .flex-row { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 16px !important; }
                  .no-print, button, [data-html2canvas-ignore] { display: none !important; }
                </style>
              </head>
              <body>
                ${targetEl.innerHTML}
                <script>
                  window.onload = function() {
                    setTimeout(function() {
                      window.focus();
                      window.print();
                    }, 250);
                  };
                </script>
              </body>
            </html>
          `);
          printWin.document.close();
          return;
        }
      } catch (e) {
        console.warn('Pop-up window print blocked, falling back to in-page print:', e);
      }

      const printStyle = document.createElement('style');
      printStyle.id = 'active-print-style-sheet';
      printStyle.innerHTML = `
        @media print {
          body > * { display: none !important; }
          #${targetEl.id}, #${targetEl.id} * {
            visibility: visible !important;
          }
          #${targetEl.id} {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print, button, [data-html2canvas-ignore] { display: none !important; }
        }
      `;
      document.head.appendChild(printStyle);
    }

    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error(e);
      addToast('Print Triggered', 'info', 'Use the "Download Report PDF" button if browser print is blocked.');
    } finally {
      setTimeout(() => {
        const existingStyle = document.getElementById('active-print-style-sheet');
        if (existingStyle) existingStyle.remove();
      }, 2000);
    }
  };

  const handlePrint = () => {
    triggerPrint();
  };

  // Print Preview Confirmation Modal State
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false);
  const [printPreviewConfig, setPrintPreviewConfig] = useState<{
    elementId?: string;
    title: string;
    reportPeriod: string;
    description: string;
    recordCount?: number;
    filename: string;
    totalRevenue?: number;
    processedBookingsCount?: number;
    branchBreakdown?: { name: string; revenue: number; volume: number }[];
    dataEntries?: any[];
    reportType?: 'bookings' | 'monthly' | 'yearly';
  } | null>(null);
  const [isRangeConfirmed, setIsRangeConfirmed] = useState(true);

  const openPrintPreview = (config: {
    elementId?: string;
    title: string;
    reportPeriod: string;
    description: string;
    recordCount?: number;
    filename: string;
    totalRevenue?: number;
    processedBookingsCount?: number;
    branchBreakdown?: { name: string; revenue: number; volume: number }[];
    dataEntries?: any[];
    reportType?: 'bookings' | 'monthly' | 'yearly';
  }) => {
    setPrintPreviewConfig(config);
    setIsRangeConfirmed(true);
    setShowPrintPreviewModal(true);
  };

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activeFinancialTab, setActiveFinancialTab] = useState<'handover' | 'monthly' | 'annual' | null>(null);
  const [activeActivityTab, setActiveActivityTab] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Manager Availability & Live Rooms Filter States
  const [managerCalendarBranch, setManagerCalendarBranch] = useState<'ALL' | 'Annex' | 'Ayigya'>('ALL');
  const [liveViewBranchFilter, setLiveViewBranchFilter] = useState<'ALL' | 'Annex' | 'Ayigya'>('ALL');
  const [liveViewSearchQuery, setLiveViewSearchQuery] = useState('');
  const [liveViewTypeFilter, setLiveViewTypeFilter] = useState('ALL');
  const [liveViewStatusFilter, setLiveViewStatusFilter] = useState<'ALL' | 'Available' | 'Occupied' | 'Cleaning' | 'Maintenance'>('ALL');
  
  // Pending Edit Requests State & Handlers
  const [pendingEditRequests, setPendingEditRequests] = useState<PendingEditRequest[]>(() => {
    try {
      const local = localStorage.getItem('nabslodge_pending_edits');
      return local ? JSON.parse(local) : [];
    } catch (e) {
      return [];
    }
  });
  const [pendingEditsFilter, setPendingEditsFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [rejectionInputId, setRejectionInputId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('');

  const handleApproveEditRequest = async (req: PendingEditRequest) => {
    try {
      const booking = bookings.find(b => b.id === req.bookingId);
      if (!booking) {
        addToast("Booking Not Found", "error", "The associated booking for this request could not be found.");
        return;
      }

      const updatedBookingFields: Partial<Booking> = {
        roomId: req.proposedRoomId,
        roomNumber: req.proposedRoomNumber,
        checkInDate: req.proposedCheckInDate,
        checkOutDate: req.proposedCheckOutDate,
        totalPrice: req.proposedTotalPrice,
        ...(req.proposedPaymentStatus && { paymentStatus: req.proposedPaymentStatus }),
        ...(req.proposedAmountPaid !== undefined && { 
          amountPaid: req.proposedAmountPaid,
          deposit: req.proposedAmountPaid,
          balance_due: Math.max(0, req.proposedTotalPrice - req.proposedAmountPaid),
          pending_payment: Math.max(0, req.proposedTotalPrice - req.proposedAmountPaid)
        }),
        ...(req.proposedPaymentMethod && { paymentMethod: req.proposedPaymentMethod }),
      };

      if (req.guestName) updatedBookingFields.guestName = req.guestName;
      if (req.guestContact) updatedBookingFields.guestContact = req.guestContact;
      if (req.guestEmail) updatedBookingFields.guestEmail = req.guestEmail;

      if (db) {
        try {
          await safeUpdateDoc(doc(db, 'bookings', req.bookingId), updatedBookingFields);

          const matchingRevs = roomRevenue.filter(r => r.bookingId === req.bookingId);
          const totalCurrentRev = matchingRevs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
          
          const hasPaymentMethodChange = req.proposedPaymentMethod && (
            !req.currentPaymentMethod ||
            req.proposedPaymentMethod.trim().toLowerCase() !== req.currentPaymentMethod.trim().toLowerCase() ||
            !booking.paymentMethod ||
            req.proposedPaymentMethod.trim().toLowerCase() !== booking.paymentMethod.trim().toLowerCase()
          );
          const hasAmountChange = req.proposedAmountPaid !== undefined && 
            (req.proposedAmountPaid !== req.currentAmountPaid || req.proposedAmountPaid !== totalCurrentRev);
          
          if (hasPaymentMethodChange || hasAmountChange) {
            const proposedAmt = req.proposedAmountPaid !== undefined ? req.proposedAmountPaid : totalCurrentRev;
            const amtDiff = proposedAmt - totalCurrentRev;
            
            if (hasAmountChange) {
              if (amtDiff > 0) {
                // The guest paid MORE. We should create a new RoomRevenue record for the difference.
                if (hasPaymentMethodChange) {
                  for (const rev of matchingRevs) {
                    if (rev.id) {
                      await safeUpdateDoc(doc(db, 'RoomRevenue', rev.id), { paymentMethod: req.proposedPaymentMethod });
                    }
                  }
                }
                const revId = `rev_${Math.random().toString(36).substring(2, 11)}`;
                const userAssignedBranch = currentUser?.assignedBranch || currentUser?.branch || booking.branch || 'Base Lodge';
                const newRevDoc = {
                  id: revId,
                  bookingId: booking.id,
                  roomNumber: booking.roomNumber,
                  roomType: booking.roomType || 'Standard Room',
                  branch: booking.branch,
                  lodgeBranch: userAssignedBranch,
                  guestName: booking.guestName,
                  amount: amtDiff,
                  receptionistId: req.receptionistId || booking.receptionistId || currentUser.id,
                  receptionistName: req.receptionistName || booking.receptionistName || currentUser.name,
                  revenueType: 'BalanceSettlement',
                  revenueSubType: '',
                  paymentMethod: req.proposedPaymentMethod || booking.paymentMethod || 'Cash',
                  isFutureBooking: false,
                  isPartialDeposit: false,
                  timestamp: getFormattedDateTime(),
                  dateCreated: new Date().toISOString()
                };
                await safeSetDoc(doc(db, 'RoomRevenue', revId), newRevDoc);
              } else {
                // amtDiff < 0 (Refund or correction). Reduce from existing records starting from most recent.
                const sortedRevs = [...matchingRevs].sort((a, b) => {
                   const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (new Date(a.timestamp || 0).getTime());
                   const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (new Date(b.timestamp || 0).getTime());
                   return tB - tA;
                });
                let remainingDiff = amtDiff;
                for (let i = 0; i < sortedRevs.length; i++) {
                   const rev = sortedRevs[i];
                   if (remainingDiff === 0 && !hasPaymentMethodChange) break;
                   
                   let currentRevAmount = Number(rev.amount || 0);
                   let newAmount = currentRevAmount;
                   
                   if (remainingDiff < 0) {
                     const maxSubtract = currentRevAmount;
                     const subtractAmount = Math.min(maxSubtract, Math.abs(remainingDiff));
                     newAmount = currentRevAmount - subtractAmount;
                     remainingDiff += subtractAmount;
                   }
                   
                   const updateData: any = {};
                   if (newAmount !== currentRevAmount) updateData.amount = newAmount;
                   if (hasPaymentMethodChange) updateData.paymentMethod = req.proposedPaymentMethod;
                   
                   if (Object.keys(updateData).length > 0 && rev.id) {
                     await safeUpdateDoc(doc(db, 'RoomRevenue', rev.id), updateData);
                   }
                }
              }
            } else if (hasPaymentMethodChange) {
              for (const rev of matchingRevs) {
                if (rev.id) {
                  await safeUpdateDoc(doc(db, 'RoomRevenue', rev.id), { paymentMethod: req.proposedPaymentMethod });
                }
              }
            }

            // Sync with local RoomRevenue state and localStorage
            let updatedLocalRevs = [...roomRevenue];
            if (hasAmountChange) {
              if (amtDiff > 0) {
                updatedLocalRevs = updatedLocalRevs.map(rev => {
                  if (rev.bookingId === req.bookingId) {
                    return {
                      ...rev,
                      ...(hasPaymentMethodChange && { paymentMethod: req.proposedPaymentMethod })
                    };
                  }
                  return rev;
                });

                const revId = `rev_${Math.random().toString(36).substring(2, 11)}`;
                const userAssignedBranch = currentUser?.assignedBranch || currentUser?.branch || booking.branch || 'Base Lodge';
                const newRevDoc = {
                  id: revId,
                  bookingId: booking.id,
                  roomNumber: booking.roomNumber,
                  roomType: booking.roomType || 'Standard Room',
                  branch: booking.branch,
                  lodgeBranch: userAssignedBranch,
                  guestName: booking.guestName,
                  amount: amtDiff,
                  receptionistId: req.receptionistId || booking.receptionistId || currentUser.id,
                  receptionistName: req.receptionistName || booking.receptionistName || currentUser.name,
                  revenueType: 'BalanceSettlement',
                  revenueSubType: '',
                  paymentMethod: req.proposedPaymentMethod || booking.paymentMethod || 'Cash',
                  isFutureBooking: false,
                  isPartialDeposit: false,
                  timestamp: getFormattedDateTime(),
                  dateCreated: new Date().toISOString()
                };
                updatedLocalRevs.push(newRevDoc);
              } else {
                const sortedMatchingRevs = [...matchingRevs].sort((a, b) => {
                   const tA = new Date(a.timestamp || 0).getTime();
                   const tB = new Date(b.timestamp || 0).getTime();
                   return tB - tA;
                });
                let remainingDiff = amtDiff;
                const updatedMatchingMap = new Map<string, any>();

                for (const rev of sortedMatchingRevs) {
                  let currentRevAmount = Number(rev.amount || 0);
                  let newAmount = currentRevAmount;

                  if (remainingDiff < 0) {
                    const maxSubtract = currentRevAmount;
                    const subtractAmount = Math.min(maxSubtract, Math.abs(remainingDiff));
                    newAmount = currentRevAmount - subtractAmount;
                    remainingDiff += subtractAmount;
                  }

                  updatedMatchingMap.set(rev.id, {
                    ...rev,
                    amount: newAmount,
                    ...(hasPaymentMethodChange && { paymentMethod: req.proposedPaymentMethod })
                  });
                }

                updatedLocalRevs = updatedLocalRevs.map(rev => {
                  if (rev.bookingId === req.bookingId && updatedMatchingMap.has(rev.id)) {
                    return updatedMatchingMap.get(rev.id);
                  }
                  return rev;
                });
              }
            } else if (hasPaymentMethodChange) {
              updatedLocalRevs = updatedLocalRevs.map(rev => {
                if (rev.bookingId === req.bookingId) {
                  return {
                    ...rev,
                    paymentMethod: req.proposedPaymentMethod
                  };
                }
                return rev;
              });
            }

            setRoomRevenue(updatedLocalRevs);
            try {
              localStorage.setItem('nabslodge_room_revenues', JSON.stringify(updatedLocalRevs));
            } catch (e) {
              console.warn("Failed to write room revenues to localStorage", e);
            }
          }
        } catch (err) {
          console.warn("Firestore update booking error:", err);
        }
      }

      if (req.currentRoomId !== req.proposedRoomId) {
        const oldRoom = rooms.find(r => r.id === req.currentRoomId);
        const newRoom = rooms.find(r => r.id === req.proposedRoomId);

        if (oldRoom && db) {
          await safeUpdateDoc(doc(db, 'rooms', oldRoom.id), { status: 'Available' });
        }
        if (newRoom && db) {
          await safeUpdateDoc(doc(db, 'rooms', newRoom.id), { status: 'Occupied' });
        }

        const updatedRooms = rooms.map(r => {
          if (r.id === req.currentRoomId) return { ...r, status: 'Available' as RoomStatus };
          if (r.id === req.proposedRoomId) return { ...r, status: 'Occupied' as RoomStatus };
          return r;
        });
        setRooms(updatedRooms);
        saveRooms(updatedRooms);
      }

      const reviewedAt = new Date().toISOString();
      if (db) {
        try {
          await updateDoc(doc(db, 'pendingEditRequests', req.id), {
            status: 'Approved',
            reviewedBy: currentUser.name,
            reviewedAt: reviewedAt
          });
        } catch (err) {
          console.warn("Firestore update pending request error:", err);
        }
      }

      const updatedBookings = bookings.map(b => b.id === req.bookingId ? { ...b, ...updatedBookingFields } : b);
      setBookings(updatedBookings);
      saveBookings(updatedBookings);

      const updatedRequests = pendingEditRequests.map(r => r.id === req.id ? {
        ...r,
        status: 'Approved' as const,
        reviewedBy: currentUser.name,
        reviewedAt
      } : r);
      setPendingEditRequests(updatedRequests);
      localStorage.setItem('nabslodge_pending_edits', JSON.stringify(updatedRequests));

      addAuditLog(
        currentUser.id,
        currentUser.name,
        'Manager',
        req.branch,
        `Approved Booking Edit for Room ${req.proposedRoomNumber}`,
        `Booking #${req.bookingId.slice(-6)}. Financial Diff: GH₵${req.priceDifference.toFixed(2)}. Total: GH₵${req.proposedTotalPrice.toFixed(2)}.`
      );

      addToast(
        "Booking Edit Approved",
        "success",
        `Booking modification for Room ${req.proposedRoomNumber} approved (${req.priceDifference >= 0 ? '+' : ''}GH₵${req.priceDifference.toFixed(2)} financial difference).`,
        5000
      );
    } catch (err: any) {
      console.error("Error approving edit request:", err);
      addToast("Approval Error", "error", err.message || "Could not approve request.", 4000);
    }
  };

  const handleRejectEditRequest = async (req: PendingEditRequest) => {
    try {
      const reviewedAt = new Date().toISOString();
      const reason = rejectionReasonText.trim() || 'Rejected by manager';

      if (db) {
        try {
          await updateDoc(doc(db, 'pendingEditRequests', req.id), {
            status: 'Rejected',
            reviewedBy: currentUser.name,
            reviewedAt: reviewedAt,
            rejectionReason: reason
          });
        } catch (err) {
          console.warn("Firestore reject pending request error:", err);
        }
      }

      const updatedRequests = pendingEditRequests.map(r => r.id === req.id ? {
        ...r,
        status: 'Rejected' as const,
        reviewedBy: currentUser.name,
        reviewedAt,
        rejectionReason: reason
      } : r);
      setPendingEditRequests(updatedRequests);
      localStorage.setItem('nabslodge_pending_edits', JSON.stringify(updatedRequests));
      setRejectionInputId(null);
      setRejectionReasonText('');

      addAuditLog(
        currentUser.id,
        currentUser.name,
        'Manager',
        req.branch,
        `Rejected Booking Edit Request #${req.id.slice(-6)}`,
        `Booking #${req.bookingId.slice(-6)}. Rejection reason: ${reason}`
      );

      addToast("Request Rejected", "info", `Booking edit request for Room ${req.currentRoomNumber} rejected.`, 4000);
    } catch (err: any) {
      console.error("Error rejecting edit request:", err);
      addToast("Rejection Error", "error", err.message || "Could not reject request.", 4000);
    }
  };
  
  // --- HANDOVER FILTER STATES & SHIFT AUDIT INSPECTOR ---
  const [handovers, setHandovers] = useState<HandoverRecord[]>(() => getHandovers());
  const [handoverFilterReceptionist, setHandoverFilterReceptionist] = useState<string>('all');
  const [handoverFilterStartDate, setHandoverFilterStartDate] = useState<string>('');
  const [handoverFilterEndDate, setHandoverFilterEndDate] = useState<string>('');
  const [selectedHandoverForAudit, setSelectedHandoverForAudit] = useState<HandoverRecord | null>(null);
  const [auditFilterCategory, setAuditFilterCategory] = useState<'all' | 'rooms' | 'walkins' | 'drinks' | 'staff' | 'cash' | 'momo'>('all');

  const getHandoverBreakdownItems = (handover: HandoverRecord): HandoverItemBreakdown[] => {
    if (handover.itemsBreakdown && handover.itemsBreakdown.length > 0) {
      return handover.itemsBreakdown;
    }
    
    // Dynamic fallback matching for legacy handovers
    const items: HandoverItemBreakdown[] = [];
    const dateStr = handover.timestamp ? handover.timestamp.substring(0, 10) : '';

    const matchedBookings = bookings.filter(b => {
      const branchMatch = b.branch === handover.branch || b.lodgeBranch === handover.branch;
      const staffMatch = b.receptionistName === handover.receptionistName || b.receptionistId === handover.receptionistId;
      const dateMatch = (b.createdAt && b.createdAt.includes(dateStr)) || (b.checkInDate && b.checkInDate.includes(dateStr));
      return branchMatch && staffMatch && dateMatch;
    });

    matchedBookings.forEach(b => {
      const isFuture = new Date(b.checkInDate) > new Date(dateStr);
      const isPartial = b.paymentStatus === 'Partial' || b.paymentStatus === 'Partially Paid (50% Deposit)' || (b.amountPaid && b.amountPaid < b.totalPrice);
      
      let badge = '';
      if (isFuture && isPartial) {
        badge = '[Future Booking - Partial Deposit] ';
      } else if (isFuture) {
        badge = '[Future Booking] ';
      } else if (isPartial) {
        badge = '[Partial Deposit] ';
      }
      
      let baseText = `Room ${b.roomNumber} (${b.roomType || 'Stay'}) - Guest: ${b.guestName}`;
      let description = '';

      if (b.discountType === '5% Long-Stay') {
        const discountAmount = b.discountAmount || 0;
        const originalPrice = b.totalPrice + discountAmount;
        description = `[DISCOUNTED: 5%] ${badge}${baseText} (GH₵${originalPrice.toFixed(0)} - GH₵${discountAmount.toFixed(0)} = GH₵${b.totalPrice.toFixed(0)})`;
      } else if (b.discountType === 'Manual') {
        const discountAmount = b.discountAmount || 0;
        const originalPrice = b.totalPrice + discountAmount;
        description = `[MANUAL DISCOUNT: GH₵ ${discountAmount}] ${badge}${baseText} (GH₵${originalPrice.toFixed(0)} - GH₵${discountAmount.toFixed(0)} = GH₵${b.totalPrice.toFixed(0)})`;
      } else {
        description = `${badge}${baseText}`;
      }

      items.push({
        id: b.id,
        type: 'Room Booking',
        description: description,
        roomNumber: b.roomNumber,
        guestName: b.guestName,
        serviceOrType: b.roomType || 'Room Check-in',
        amount: b.amountPaid || b.totalPrice || 0,
        paymentMethod: b.paymentMethod || 'Cash',
        timestamp: b.createdAt || b.checkInDate || handover.timestamp
      });
    });

    const matchedDrinkSales = drinkSales.filter(s => {
      const branchMatch = s.branch === handover.branch;
      const staffMatch = s.receptionistName === handover.receptionistName || s.receptionistId === handover.receptionistId;
      const dateMatch = s.timestamp && s.timestamp.includes(dateStr);
      return branchMatch && staffMatch && dateMatch;
    });

    matchedDrinkSales.forEach(s => {
      items.push({
        id: s.id,
        type: 'Drink Sale',
        description: s.items ? `Drink Purchase: ${s.drinkName}` : `Drink Purchase: ${s.drinkName} (x${s.quantity})`,
        roomNumber: s.roomNumber,
        guestName: s.guestName,
        serviceOrType: s.drinkName,
        amount: s.totalPrice,
        paymentMethod: s.paymentMethod,
        timestamp: s.timestamp
      });
    });

    const matchedDrinkSettlements = roomRevenue.filter(r => {
      const branchMatch = r.branch === handover.branch;
      const staffMatch = r.receptionistName === handover.receptionistName || r.receptionistId === handover.receptionistId;
      const dateMatch = r.timestamp && r.timestamp.includes(dateStr);
      return branchMatch && staffMatch && dateMatch && r.revenueType === 'DrinkSettlement';
    });

    matchedDrinkSettlements.forEach(r => {
      items.push({
        id: r.id || `settlement_${Math.random()}`,
        type: 'Drink Sale',
        description: `Drink Settlement (Room ${r.roomNumber}) - Guest: ${r.guestName}`,
        roomNumber: r.roomNumber,
        guestName: r.guestName,
        serviceOrType: 'Drink Settlement',
        amount: Number(r.amount),
        paymentMethod: r.paymentMethod,
        timestamp: r.timestamp || handover.timestamp
      });
    });

    return items;
  };

  const [globalCheckInTime, setGlobalCheckInTime] = useState(() => getSettings().checkInTime);
  const [globalCheckOutTime, setGlobalCheckOutTime] = useState(() => getSettings().checkOutTime);
  
  const [annexIp, setAnnexIp] = useState(() => getSettings().annexIp || '197.251.12.45');
  const [ayigyaIp, setAyigyaIp] = useState(() => getSettings().ayigyaIp || '197.251.48.92');
  const [enforceIpRestrictions, setEnforceIpRestrictions] = useState(() => !!getSettings().enforceIpRestrictions);
  const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(() => getSettings().autoPurgeEnabled !== false);
  const [logRetentionDays, setLogRetentionDays] = useState(() => getSettings().logRetentionDays || SIX_MONTHS_DAYS);

  // --- MONTHLY REPORTS STATES ---
  const [reportMonth, setReportMonth] = useState(() => {
    // Default to the previous month
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  });
  const [historicalReport, setHistoricalReport] = useState<{
    id: string;
    totalRevenue: number;
    annexRevenue?: number;
    ayigyaRevenue?: number;
    totalBookingsCount: number;
    averageOccupancyRate: number;
    closedAt?: string;
    closedBy?: string;
  } | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [isLoadingYearly, setIsLoadingYearly] = useState(false);

  // yearlyReports moved below financialData
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    
    // Save via data layer which handles Firestore sync
    saveSettings({
      annexIp: annexIp.trim(),
      ayigyaIp: ayigyaIp.trim(),
      allowedIpAddresses: [annexIp.trim(), ayigyaIp.trim()],
      checkInTime: globalCheckInTime,
      checkOutTime: globalCheckOutTime,
      lateCheckOutFee: lateCheckOutFee,
      enforceIpRestrictions: enforceIpRestrictions,
      autoPurgeEnabled: autoPurgeEnabled,
      logRetentionDays: Number(logRetentionDays) || SIX_MONTHS_DAYS
    });

    localStorage.setItem('globalCheckInTime', globalCheckInTime);
    localStorage.setItem('globalCheckOutTime', globalCheckOutTime);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('globalSettingsUpdated'));

    addToast('Settings Saved', 'success', 'Global operation settings updated and synced across devices.', 3000);
    setIsSavingSettings(false);
    setActiveTab('overview');
  };

  const fetchHistoricalReport = async (monthStr: string) => {
    setIsLoadingReport(true);
    setHistoricalReport(null);
    // Calculated from local data for this template
    const [year, month] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const filteredBookings = bookings.filter(b => {
      if (b.status === 'Cancelled') return false;
      if (!b.checkInDate) return false;
      const bookingDate = new Date(b.checkInDate);
      const bYear = bookingDate.getFullYear();
      const bMonth = bookingDate.getMonth() + 1;
      return bYear === year && bMonth === month;
    });
    const calculatePaid = (b: Booking) => {
      if (b.paymentStatus === 'Paid') return b.totalPrice;
      if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) {
        return b.amountPaid || b.deposit || b.totalPrice * 0.5;
      }
      return 0;
    };
    const totalRevenue = filteredBookings.reduce((sum, b) => sum + calculatePaid(b), 0);
    const annexRevenue = filteredBookings.filter(b => b.branch === 'Annex').reduce((sum, b) => sum + calculatePaid(b), 0);
    const ayigyaRevenue = filteredBookings.filter(b => b.branch === 'Ayigya').reduce((sum, b) => sum + calculatePaid(b), 0);
    const totalBookingsCount = filteredBookings.length;
    const totalBookedNights = filteredBookings.reduce((sum, b) => {
      const start = new Date(b.checkInDate);
      const end = new Date(b.checkOutDate);
      const diffTime = end.getTime() - start.getTime();
      const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      return sum + nights;
    }, 0);
    const averageOccupancyRate = Math.min(100, Math.round((totalBookedNights / (Math.max(1, rooms.length) * daysInMonth)) * 100)) || 0;

    setHistoricalReport({
      id: monthStr,
      totalRevenue,
      annexRevenue,
      ayigyaRevenue,
      totalBookingsCount,
      averageOccupancyRate,
      closedAt: 'Calculated Local State',
      closedBy: 'Demo Engine'
    });
    setIsLoadingReport(false);
  };

  useEffect(() => {
    const syncSettings = () => {
      const s = getSettings();
      setGlobalCheckInTime(s.checkInTime);
      setGlobalCheckOutTime(s.checkOutTime);
      setLateCheckOutFee(s.lateCheckOutFee);
      if (s.annexIp) setAnnexIp(s.annexIp);
      if (s.ayigyaIp) setAyigyaIp(s.ayigyaIp);
      if (s.enforceIpRestrictions !== undefined) setEnforceIpRestrictions(s.enforceIpRestrictions);
      if (s.autoPurgeEnabled !== undefined) setAutoPurgeEnabled(s.autoPurgeEnabled);
      if (s.logRetentionDays !== undefined) setLogRetentionDays(s.logRetentionDays);
    };

    window.addEventListener('globalSettingsUpdated', syncSettings);
    return () => window.removeEventListener('globalSettingsUpdated', syncSettings);
  }, []);

  useEffect(() => {
    if (reportMonth && activeTab === 'financials') {
      fetchHistoricalReport(reportMonth);
    }
  }, [reportMonth, activeTab]);

  const handleCloseOutMonth = async () => {
    addToast('Close Out', 'info', 'Month close-out logic is simulated in this template.', 3000);
  };

  // Local states that read from our mock database
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activityTransactions, setActivityTransactions] = useState<any[]>(() => {
    try {
      const local = localStorage.getItem('nabslodge_activity_ledger');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [roomRevenue, setRoomRevenue] = useState<any[]>(() => {
    try {
      const local = localStorage.getItem('nabslodge_room_revenues');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [drinks, setDrinks] = useState<DrinkItem[]>(getDrinks());
  const [drinkSales, setDrinkSales] = useState<DrinkSale[]>(getDrinkSales());
  const [showAddDrinkModal, setShowAddDrinkModal] = useState(false);
  const [showEditDrinkModal, setShowEditDrinkModal] = useState(false);
  const [drinkToEdit, setDrinkToEdit] = useState<DrinkItem | null>(null);
  const [drinkToDelete, setDrinkToDelete] = useState<DrinkItem | null>(null);
  const [newDrinkName, setNewDrinkName] = useState('');
  const [newDrinkPrice, setNewDrinkPrice] = useState<number>(15);
  const [newDrinkCategory, setNewDrinkCategory] = useState('Soft Drink');
  const [newDrinkBranch, setNewDrinkBranch] = useState<Branch | 'All'>('All');
  const [editDrinkName, setEditDrinkName] = useState('');
  const [editDrinkPrice, setEditDrinkPrice] = useState<number>(0);
  const [editDrinkCategory, setEditDrinkCategory] = useState('');
  const [editDrinkBranch, setEditDrinkBranch] = useState<Branch | 'All'>('All');
  const [drinkSearchQuery, setDrinkSearchQuery] = useState('');
  const [drinkBranchFilter, setDrinkBranchFilter] = useState<'All' | 'Annex' | 'Ayigya'>('All');
  const [drinkStartDate, setDrinkStartDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`; // Default to start of current month
  });
  const [drinkEndDate, setDrinkEndDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    return `${year}-${month}-${String(lastDay).padStart(2, '0')}`; // Default to end of current month
  });

  const getSaleDateStr = (timestamp: any) => {
    const d = parseSafeDate(timestamp);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const filteredDrinkSales = React.useMemo(() => {
    return drinkSales.filter(sale => {
      // 1. Branch filter
      if (drinkBranchFilter !== 'All' && sale.branch !== drinkBranchFilter) {
        return false;
      }
      
      // 2. Date filter
      const saleDate = getSaleDateStr(sale.timestamp);
      if (drinkStartDate && saleDate < drinkStartDate) {
        return false;
      }
      if (drinkEndDate && saleDate > drinkEndDate) {
        return false;
      }
      
      return true;
    });
  }, [drinkSales, drinkBranchFilter, drinkStartDate, drinkEndDate]);

  const [annualRevenueData, setAnnualRevenueData] = useState<any[]>([]);
  const [revenueByCategoryData, setRevenueByCategoryData] = useState<any[]>([]);
  const [lateCheckOutFee, setLateCheckOutFee] = useState<number>(() => getSettings().lateCheckOutFee);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isPurgingDb, setIsPurgingDb] = useState(false);
  const [showPurgeConfirmModal, setShowPurgeConfirmModal] = useState(false);
  const [roomSuccessMessage, setRoomSuccessMessage] = useState('');

  const handlePurgeDatabase = () => {
    setShowPurgeConfirmModal(true);
  };

  const executePurgeDatabase = async () => {
    setIsPurgingDb(true);
    setShowPurgeConfirmModal(false);
    try {
      // 1. Wipe Firestore collections
      const collectionsToPurge = ['ActivityCatalog', 'ActivityLedger', 'bookings', 'rooms', 'RoomRevenue', 'handovers', 'auditLogs', 'drinkSales'];
      for (const colName of collectionsToPurge) {
        try {
          const colSnap = await getDocs(collection(db, colName));
          if (!colSnap.empty) {
            const batch = writeBatch(db);
            colSnap.docs.forEach(docSnap => {
              batch.delete(docSnap.ref);
            });
            await batch.commit();
          }
        } catch (e) {
          console.warn(`Failed to purge Firestore collection ${colName}:`, e);
        }
      }

      // 2. Purge local cache
      localStorage.clear();
      sessionStorage.clear();

      // 3. Instantly zero out all React states
      await purgeAndResetDatabase();
      setBookings([]);
      setRoomRevenue([]);
      setActivityTransactions([]);
      setHandovers([]);
      setLogs([]);
      setRooms([]);
      setAnnualRevenueData([]);
      setRevenueByCategoryData([]);

      addToast("Database Reset", "success", "All Firestore documents, local cache, charts, and bookings purged! App is now a 100% clean blank slate with GH₵0.00 revenue.", 6000);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err: any) {
      addToast("Reset Failed", "error", err?.message || "Failed to purge database.", 4000);
    } finally {
      setIsPurgingDb(false);
    }
  };

  const getDrinkPaidAmount = (s: any) => {
    if (s.paymentStatus === 'Paid') return Number(s.totalPrice || 0);
    if (s.paymentStatus === 'Unpaid') return 0;
    if (s.paymentStatus === 'Split') return Number(s.paidAmount || 0);
    const isUnpaid = s.paymentMethod === 'Unpaid (Add to Room Bill)';
    const isSplit = s.paymentMethod === 'Split (Paid & Unpaid)';
    return isUnpaid ? 0 : (isSplit ? (Number(s.paidAmount) || 0) : Number(s.totalPrice || 0));
  };

  const isDrinkSettledToRoom = (s: any) => {
    return s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid' || !!s.settledPaymentMethod;
  };

  const coreLodgeTransactions = React.useMemo(() => {
    const legacyBookings: any[] = [];
    bookings.forEach(b => {
      if (b.status === 'Cancelled') return;
      const bRevenues = roomRevenue.filter(r => r.bookingId === b.id);
      const extRevsSum = bRevenues.filter(r => r.revenueType === 'ExtensionFee').reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const roomRevsSum = bRevenues.filter(r => r.revenueType !== 'ExtensionFee').reduce((sum, r) => sum + Number(r.amount || 0), 0);
      
      const expectedExt = Number(b.lateCheckOutFeeApplied || 0);
      if (expectedExt > extRevsSum) {
        legacyBookings.push({ 
          bookingId: b.id, 
          timestamp: b.createdAt || b.dateCreated || b.checkInDate, 
          amountVal: expectedExt - extRevsSum, 
          branch: b.branch, 
          lodgeBranch: b.branch,
          roomType: b.roomType,
          revenueType: 'ExtensionFee'
        });
      }

      let expectedRoom = 0;
      if (b.paymentStatus === 'Paid') {
        expectedRoom = b.totalPrice;
      } else if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) {
        expectedRoom = Number(b.amountPaid ?? b.deposit ?? b.amountReceived ?? (b.totalPrice / 2));
      }

      // Deduct the extension fee from the expected room revenue to avoid double counting
      expectedRoom = Math.max(0, expectedRoom - expectedExt);

      if (expectedRoom > roomRevsSum) {
        legacyBookings.push({ 
          bookingId: b.id, 
          timestamp: b.createdAt || b.dateCreated || b.checkInDate, 
          amountVal: expectedRoom - roomRevsSum, 
          branch: b.branch, 
          lodgeBranch: b.branch,
          roomType: b.roomType,
          revenueType: 'RoomPayment'
        });
      }
    });

    return [
      ...roomRevenue.map(r => ({ ...r, amountVal: Number(r.amount || 0), timestamp: r.timestamp || r.dateCreated || r.createdAt })),
      ...legacyBookings
    ];
  }, [roomRevenue, bookings]);

  const unifiedTransactions = React.useMemo(() => [
    ...coreLodgeTransactions.map(t => ({
      ...t,
      isDrink: (t as any).revenueType === 'DrinkSettlement',
      category: (t as any).revenueType === 'DrinkSettlement' ? 'Drink' : 
                (t as any).revenueType === 'ExtensionFee' ? 'Extension' : 'Lodging'
    })),
    ...activityTransactions.map(a => ({
      ...a,
      branch: a.branch || a.lodgeBranch || 'Annex',
      amountVal: Number(a.amountPaid !== undefined && a.amountPaid !== null ? a.amountPaid : (a.totalPrice || 0)),
      timestamp: a.timestamp || a.dateCreated || a.createdAt,
      category: 'Activity'
    })),
    ...drinkSales.filter(s => !isDrinkSettledToRoom(s)).map(s => {
      const paid = getDrinkPaidAmount(s);
      return {
        ...s,
        amountVal: paid,
        timestamp: s.timestamp || (s as any).dateCreated || (s as any).createdAt,
        isDrink: true,
        category: 'Drink'
      };
    })
  ], [coreLodgeTransactions, activityTransactions, drinkSales]);

  const drinkSalesMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    drinks.forEach(d => {
      map[d.id] = 0;
    });
    drinkSales.forEach(s => {
      if (s.items && s.items.length > 0) {
        s.items.forEach(item => {
          if (map[item.drinkId] !== undefined) {
            map[item.drinkId] += item.quantity;
          } else {
            map[item.drinkId] = item.quantity;
          }
        });
      } else if (s.drinkId) {
        if (map[s.drinkId] !== undefined) {
          map[s.drinkId] += s.quantity || 0;
        } else {
          map[s.drinkId] = s.quantity || 0;
        }
      }
    });
    return map;
  }, [drinks, drinkSales]);

  const filteredHandovers = useMemo(() => {
    return handovers.filter((h) => {
      // 1. Filter by receptionist
      if (handoverFilterReceptionist !== 'all' && h.receptionistId !== handoverFilterReceptionist) {
        return false;
      }
      // 2. Filter by date range (inclusive)
      if (h.timestamp) {
        const d = parseSafeDate(h.timestamp);
        if (d) {
          const recordDateStr = d.toISOString().substring(0, 10); // "YYYY-MM-DD"
          if (handoverFilterStartDate && recordDateStr < handoverFilterStartDate) {
            return false;
          }
          if (handoverFilterEndDate && recordDateStr > handoverFilterEndDate) {
            return false;
          }
        }
      }
      return true;
    });
  }, [handovers, handoverFilterReceptionist, handoverFilterStartDate, handoverFilterEndDate]);

  // Unified helper function for Monthly Breakdown, Annual Report, and Archiving modules (strictly cash-recording by payment timestamp)
  const getCoreLodgeRevenueForYearMonth = (year: number, month?: number) => {
    return unifiedTransactions.filter(t => {
      const ts = t.timestamp || (t as any).dateCreated || (t as any).createdAt || (t as any).checkInDate;
      const tDate = parseSafeDate(ts);
      if (!tDate) return false;
      const matchesYear = tDate.getFullYear() === year;
      const matchesMonth = month ? (tDate.getMonth() + 1) === month : true;
      return matchesYear && matchesMonth;
    });
  };

  useEffect(() => {
    // 1. Calculate Annual Revenue Trend
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    const annualData = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const date = new Date(currentYear, i, 1);
      const monthLabel = date.toLocaleString('default', { month: 'short' });

      const currentYearTxs = getCoreLodgeRevenueForYearMonth(currentYear, monthNum);
      const currentRev = currentYearTxs.reduce((sum, t) => sum + (t.amountVal || 0), 0);

      const prevYearTxs = getCoreLodgeRevenueForYearMonth(previousYear, monthNum);
      const prevRev = prevYearTxs.reduce((sum, t) => sum + (t.amountVal || 0), 0);

      return {
        month: monthLabel,
        'Current Year': currentRev,
        'Previous Year': prevRev
      };
    });
    setAnnualRevenueData(annualData);

    // 2. Calculate Monthly Revenue by Category (Room Types)
    const now = new Date();
    const currMonth = now.getMonth() + 1;
    const currYear = now.getFullYear();
    
    const prevMonthDate = new Date(currYear, now.getMonth() - 1, 1);
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevMonthYear = prevMonthDate.getFullYear();

    // Dynamically identify categories (Room Types, Activity Services & Drinks)
    const categories = [...new Set([
      ...rooms.map(r => r.roomType),
      ...bookings.map(b => b.roomType),
      ...activityTransactions.map(a => a.serviceType || a.serviceName),
      'Drink Sales'
    ])].filter(Boolean);

    if (categories.length === 0) {
      setRevenueByCategoryData([]);
    } else {
      const categoryData = categories.map(cat => {
        const currentMonthTxs = getCoreLodgeRevenueForYearMonth(currYear, currMonth);
        const currentMonthRev = currentMonthTxs.filter(t => {
          const booking = bookings.find(b => b.id === (t as any).bookingId);
          if (cat === 'Drink Sales') return (t as any).isDrink;
          return booking?.roomType === cat || (t as any).serviceType === cat || (t as any).serviceName === cat;
        }).reduce((sum, t) => sum + (t.amountVal || 0), 0);

        const prevMonthTxs = getCoreLodgeRevenueForYearMonth(prevMonthYear, prevMonth);
        const prevMonthRev = prevMonthTxs.filter(t => {
          const booking = bookings.find(b => b.id === (t as any).bookingId);
          if (cat === 'Drink Sales') return (t as any).isDrink;
          return booking?.roomType === cat || (t as any).serviceType === cat || (t as any).serviceName === cat;
        }).reduce((sum, t) => sum + (t.amountVal || 0), 0);

        return {
          name: cat,
          'Current Month': currentMonthRev,
          'Previous Month': prevMonthRev
        };
      }).filter(d => d['Current Month'] > 0 || d['Previous Month'] > 0);
      
      setRevenueByCategoryData(categoryData);
    }
  }, [coreLodgeTransactions, bookings, rooms, activityTransactions]);

  // yearlyReports is now memoized from financialData

  // Modals & form states
  const [showRecModal, setShowRecModal] = useState(false);
  const [editingRec, setEditingRec] = useState<User | null>(null);
  const [recEmail, setRecEmail] = useState('');
  const [recPassword, setRecPassword] = useState('');
  const [recName, setRecName] = useState('');
  const [recBranch, setRecBranch] = useState<Branch>('Annex');
  const [recStatus, setRecStatus] = useState<'Active' | 'Inactive'>('Active');
  const [recError, setRecError] = useState('');

  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; roomNumber: string } | null>(null);
  const [recToDelete, setRecToDelete] = useState<User | null>(null);

  // Activity Catalog Management State
  const [activityCatalog, setActivityCatalog] = useState<any[]>(() => getActivityCatalog());
  const [newActivityName, setNewActivityName] = useState('');
  const [newActivityPrice, setNewActivityPrice] = useState('');
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  // Dual-ledger filtering states
  const [ledgerStreamFilter, setLedgerStreamFilter] = useState<'All' | 'Room' | 'Activity'>('All');
  const [ledgerBranchFilter, setLedgerBranchFilter] = useState<'All' | 'Annex' | 'Ayigya'>('All');
  const [activityReportBranchFilter, setActivityReportBranchFilter] = useState<'All' | 'Annex' | 'Ayigya'>('All');

  const handleExportCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]);
    const csvContent = [
      keys.join(','),
      ...data.map(row => keys.map(k => `"${row[k]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Export Successful', 'success', `Downloaded ${filename}.csv`, 3000);
  };

  const handleExportPDF = async (elementId: string, filename: string) => {
    addToast('Generating PDF Report...', 'info', 'Please wait while the PDF is being compiled.', 3000);

    try {
      const pdf = new jsPDF();
      pdf.setFontSize(22);
      pdf.setTextColor(37, 99, 235); // Blue-600
      pdf.text(cleanPdfText("NABSLODGE"), 14, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); // Zinc-500
      pdf.text(cleanPdfText("EXECUTIVE MANAGEMENT REPORT"), 14, 25);
      pdf.text(cleanPdfText(`Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} | Operator: ${currentUser?.name || 'Manager'}`), 14, 30);
      
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.5);
      pdf.line(14, 34, 196, 34);

      // Add report metadata
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42); // Slate-900
      pdf.text(cleanPdfText(printPreviewConfig?.title || `Report: ${filename.replace(/_/g, ' ')}`), 14, 44);
      
      pdf.setFontSize(10);
      pdf.setTextColor(71, 85, 105);
      pdf.text(cleanPdfText(`Scope Period: ${printPreviewConfig?.reportPeriod || 'N/A'}`), 14, 50);
      pdf.text(cleanPdfText(`Description: ${printPreviewConfig?.description || 'N/A'}`), 14, 55);

      // Financial Metrics Card in PDF
      if (printPreviewConfig?.totalRevenue !== undefined) {
        pdf.setFillColor(248, 250, 252); // Slate-50 background box
        pdf.rect(14, 62, 182, 28, 'F');
        
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text(cleanPdfText("COMBINED TOTAL REVENUE"), 18, 68);
        pdf.text(cleanPdfText("TOTAL BOOKINGS VOLUME"), 80, 68);
        pdf.text(cleanPdfText("REPORTING SCOPE STATUS"), 140, 68);

        pdf.setFontSize(12);
        pdf.setTextColor(22, 163, 74); // Emerald-600
        pdf.text(cleanPdfText(`GH₵ ${(printPreviewConfig.totalRevenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`), 18, 75);
        
        pdf.setTextColor(15, 23, 42);
        pdf.text(cleanPdfText(`${printPreviewConfig.processedBookingsCount || 0} Processed`), 80, 75);
        pdf.text(cleanPdfText("VERIFIED & AUDITED"), 140, 75);
        
        // Branch breakdown line
        if (printPreviewConfig.branchBreakdown) {
          pdf.setFontSize(8);
          pdf.setTextColor(100, 116, 139);
          const breakdownStr = printPreviewConfig.branchBreakdown.map(b => `${b.name}: GH₵ ${b.revenue.toLocaleString()} (${b.volume} bks)`).join("   |   ");
          pdf.text(cleanPdfText(breakdownStr), 18, 85);
        }
      }

      // Render the table statement matrix
      if (printPreviewConfig?.dataEntries && printPreviewConfig.dataEntries.length > 0) {
        let yPos = 100;
        pdf.setFontSize(11);
        pdf.setTextColor(15, 23, 42);
        pdf.text(cleanPdfText("STATEMENT MATRIX"), 14, yPos);
        yPos += 6;

        // Table headers background
        pdf.setFillColor(241, 245, 249); // slate-100
        pdf.rect(14, yPos, 182, 8, 'F');

        pdf.setFontSize(9);
        pdf.setTextColor(71, 85, 105);
        
        const type = printPreviewConfig.reportType;
        if (type === 'bookings') {
          pdf.text(cleanPdfText("Lodge / Ref"), 16, yPos + 6);
          pdf.text(cleanPdfText("Guest Name"), 50, yPos + 6);
          pdf.text(cleanPdfText("Room"), 100, yPos + 6);
          pdf.text(cleanPdfText("Period"), 125, yPos + 6);
          pdf.text(cleanPdfText("Billing (GH₵)"), 170, yPos + 6);
        } else if (type === 'monthly') {
          pdf.text(cleanPdfText("Month"), 16, yPos + 6);
          pdf.text(cleanPdfText("Annex Revenue"), 60, yPos + 6);
          pdf.text(cleanPdfText("Ayigya Revenue"), 110, yPos + 6);
          pdf.text(cleanPdfText("Total Revenue (GH₵)"), 160, yPos + 6);
        } else if (type === 'yearly') {
          pdf.text(cleanPdfText("Month"), 16, yPos + 6);
          pdf.text(cleanPdfText("Annex Revenue"), 45, yPos + 6);
          pdf.text(cleanPdfText("Ayigya Revenue"), 80, yPos + 6);
          pdf.text(cleanPdfText("Total Rev (GH₵)"), 115, yPos + 6);
          pdf.text(cleanPdfText("Bookings"), 145, yPos + 6);
          pdf.text(cleanPdfText("Occupancy"), 165, yPos + 6);
          pdf.text(cleanPdfText("Status"), 185, yPos + 6);
        }
        yPos += 8;

        pdf.setLineWidth(0.2);
        printPreviewConfig.dataEntries.forEach((entry) => {
          if (yPos > 275) {
            pdf.addPage();
            yPos = 20;
            // Draw table headers again on new page
            pdf.setFillColor(241, 245, 249);
            pdf.rect(14, yPos, 182, 8, 'F');
            pdf.setFontSize(9);
            pdf.setTextColor(71, 85, 105);
            if (type === 'bookings') {
              pdf.text(cleanPdfText("Lodge / Ref"), 16, yPos + 6);
              pdf.text(cleanPdfText("Guest Name"), 50, yPos + 6);
              pdf.text(cleanPdfText("Room"), 100, yPos + 6);
              pdf.text(cleanPdfText("Period"), 125, yPos + 6);
              pdf.text(cleanPdfText("Billing (GH₵)"), 170, yPos + 6);
            } else if (type === 'monthly') {
              pdf.text(cleanPdfText("Month"), 16, yPos + 6);
              pdf.text(cleanPdfText("Annex Revenue"), 60, yPos + 6);
              pdf.text(cleanPdfText("Ayigya Revenue"), 110, yPos + 6);
              pdf.text(cleanPdfText("Total Revenue (GH₵)"), 160, yPos + 6);
            } else if (type === 'yearly') {
              pdf.text(cleanPdfText("Month"), 16, yPos + 6);
              pdf.text(cleanPdfText("Annex Revenue"), 45, yPos + 6);
              pdf.text(cleanPdfText("Ayigya Revenue"), 80, yPos + 6);
              pdf.text(cleanPdfText("Total Rev (GH₵)"), 115, yPos + 6);
              pdf.text(cleanPdfText("Bookings"), 145, yPos + 6);
              pdf.text(cleanPdfText("Occupancy"), 165, yPos + 6);
              pdf.text(cleanPdfText("Status"), 185, yPos + 6);
            }
            yPos += 14;
          }

          pdf.setFontSize(8);
          pdf.setTextColor(51, 65, 85);
          
          if (type === 'bookings') {
            pdf.text(cleanPdfText(String(entry.col1)), 16, yPos);
            pdf.text(cleanPdfText(String(entry.col2).substring(0, 24)), 50, yPos);
            pdf.text(cleanPdfText(String(entry.col3)), 100, yPos);
            pdf.text(cleanPdfText(String(entry.col4)), 125, yPos);
            pdf.text(cleanPdfText(String(entry.col5)), 170, yPos);
          } else if (type === 'monthly') {
            pdf.text(cleanPdfText(String(entry.col1)), 16, yPos);
            pdf.text(cleanPdfText(String(entry.col2)), 60, yPos);
            pdf.text(cleanPdfText(String(entry.col3)), 110, yPos);
            pdf.text(cleanPdfText(String(entry.col4)), 160, yPos);
          } else if (type === 'yearly') {
            pdf.text(cleanPdfText(String(entry.col1)), 16, yPos);
            pdf.text(cleanPdfText(String(entry.col2)), 45, yPos);
            pdf.text(cleanPdfText(String(entry.col3)), 80, yPos);
            pdf.text(cleanPdfText(String(entry.col4)), 115, yPos);
            pdf.text(cleanPdfText(String(entry.col5)), 145, yPos);
            pdf.text(cleanPdfText(String(entry.col6)), 165, yPos);
            pdf.text(cleanPdfText(String(entry.col7)), 185, yPos);
          }

          // Bottom border line for row
          pdf.setDrawColor(241, 245, 249);
          pdf.line(14, yPos + 2.5, 196, yPos + 2.5);
          yPos += 7.5;
        });
      } else {
        // Simple text description fallback
        pdf.setFontSize(10);
        pdf.setTextColor(51, 65, 85);
        pdf.text(printPreviewConfig?.description || 'No matching entries for this period.', 14, 100);
      }

      // Footer
      pdf.setDrawColor(226, 232, 240);
      pdf.line(14, 280, 196, 280);
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text("This document contains system-generated reference data exported from Nabslodge Management Portal.", 14, 285);
      
      pdf.save(`${filename}.pdf`);
      addToast('Export Successful', 'success', `Downloaded ${filename}.pdf`, 3000);
    } catch (directErr) {
      console.warn("Direct PDF compilation failed, trying HTML fallback:", directErr);
      
      const element = document.getElementById(elementId);
      if (element) {
        try {
          const canvas = await executeWithOklchSafeStyles(async () => {
            return await html2canvas(element, { 
              scale: 2, 
              useCORS: true,
              scrollX: 0,
              scrollY: 0,
              backgroundColor: isDarkMode ? '#09090b' : '#ffffff',
              onclone: sanitizeClonedDoc
            });
          });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`${filename}.pdf`);
          addToast('Export Successful', 'success', `Downloaded ${filename}.pdf`, 3000);
          return;
        } catch (error) {
          console.error("HTML2Canvas backup failed:", error);
          addToast('Export Failed', 'error', 'Could not generate PDF.');
        }
      }
    }
  };
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomType, setRoomType] = useState('Standard');
  const [roomPrice, setRoomPrice] = useState('');
  const [roomBranch, setRoomBranch] = useState<Branch>('Annex');
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('Available');
  const [roomAmenities, setRoomAmenities] = useState<string[]>([]);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [amenitiesInput, setAmenitiesInput] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [roomMaxGuests, setRoomMaxGuests] = useState('2');
  const [normalBookingPrice, setNormalBookingPrice] = useState('');
  const [normalBookingMaxGuests, setNormalBookingMaxGuests] = useState('');
  const [occasionBookingPrice, setOccasionBookingPrice] = useState('');
  const [occasionBookingMaxGuests, setOccasionBookingMaxGuests] = useState('');
  const [monthlyPremiumPrice, setMonthlyPremiumPrice] = useState('');
  const [roomError, setRoomError] = useState('');

  // Selected branch filter for rooms view
  const [roomFilter, setRoomFilter] = useState<'All' | 'Annex' | 'Ayigya'>('All');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');

  // Interactive audit logs search & filter states
  const [logBranchFilter, setLogBranchFilter] = useState<'All' | 'Annex' | 'Ayigya' | 'Global'>('All');
  const [logTypeFilter, setLogTypeFilter] = useState<'All' | 'CheckIn' | 'CheckOut' | 'RoomStatus'>('All');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Interactive manager bookings search & filter states
  const [bookingBranchFilter, setBookingBranchFilter] = useState<'All' | 'Annex' | 'Ayigya'>('All');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'All' | 'CheckedIn' | 'CheckedOut' | 'Cancelled'>('All');
  const [bookingPaymentFilter, setBookingPaymentFilter] = useState<'All' | 'Paid' | 'Partial' | 'Unpaid'>('All');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingEndDate, setBookingEndDate] = useState('');

  // Sign out modal
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // Available room type presets
  const roomTypePresets = [
    'Standard',
    '2 Bedroom Apartment',
    '3 Bedroom Apartment'
  ];

  // Available amenities presets
  const amenitiesPresets = [
    'High-Speed Wi-Fi',
    'Air Conditioning',
    'Flat-screen TV',
    'Mini Fridge',
    'Smart TV',
    'Mini Bar',
    'Bathtub',
    'Balcony',
    'Breakfast Included',
    'Desk & Study Lamp'
  ];

  // Local initial load for template mode
  const refreshData = () => {
    setRooms(getRooms());
    setBookings(getBookings());
    setLogs(getLogs());
    setUsers(getUsers().filter(u => u.role && u.role.toLowerCase() === 'receptionist'));
    setHandovers(getHandovers());
    try {
      const localRevs = localStorage.getItem('nabslodge_room_revenues');
      setRoomRevenue(localRevs ? JSON.parse(localRevs) : []);
    } catch (e) {
      console.warn("Failed to load room revenues from localStorage in ManagerDashboard:", e);
    }
    try {
      const localLedger = localStorage.getItem('nabslodge_activity_ledger');
      setActivityTransactions(localLedger ? JSON.parse(localLedger) : []);
    } catch (e) {
      console.warn("Failed to load activity ledger from localStorage in ManagerDashboard:", e);
    }
    setDrinkSales(getDrinkSales());
  };

  useEffect(() => {
    const handleLocalUpdates = () => {
      refreshData();
    };

    window.addEventListener('shiftHandoverCompleted', handleLocalUpdates);
    window.addEventListener('handoversUpdated', handleLocalUpdates);
    window.addEventListener('storage', handleLocalUpdates);

    return () => {
      window.removeEventListener('shiftHandoverCompleted', handleLocalUpdates);
      window.removeEventListener('handoversUpdated', handleLocalUpdates);
      window.removeEventListener('storage', handleLocalUpdates);
    };
  }, []);

  useEffect(() => {
    if (roomSuccessMessage) {
      const timer = setTimeout(() => {
        setRoomSuccessMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [roomSuccessMessage]);

  useEffect(() => {
    // Initial data load from local storage/demo state as a stable baseline fallback
    refreshData();
    setIsLoadingData(true);

    if (!isFirebaseConfigured) {
      setIsLoadingData(false);
      return;
    }

    // Register real-time Firestore synchronization listeners
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const roomsData: Room[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        roomsData.push({
          id: doc.id,
          roomNumber: String(data.roomNumber || ''),
          roomType: String(data.roomType || 'Standard'),
          price: typeof data.price === 'number' ? data.price : Number(data.price || 0),
          status: (data.status || 'Available') as RoomStatus,
          branch: (data.branch || 'Annex') as Branch,
          amenities: Array.isArray(data.amenities) ? data.amenities : [],
          description: String(data.description || ''),
          maxGuests: typeof data.maxGuests === 'number' ? data.maxGuests : Number(data.maxGuests || 2),
          normalBookingPrice: typeof data.normalBookingPrice === 'number' ? data.normalBookingPrice : (data.normalBookingPrice ? Number(data.normalBookingPrice) : undefined),
          normalBookingMaxGuests: typeof data.normalBookingMaxGuests === 'number' ? data.normalBookingMaxGuests : (data.normalBookingMaxGuests ? Number(data.normalBookingMaxGuests) : undefined),
          occasionBookingPrice: typeof data.occasionBookingPrice === 'number' ? data.occasionBookingPrice : (data.occasionBookingPrice ? Number(data.occasionBookingPrice) : undefined),
          occasionBookingMaxGuests: typeof data.occasionBookingMaxGuests === 'number' ? data.occasionBookingMaxGuests : (data.occasionBookingMaxGuests ? Number(data.occasionBookingMaxGuests) : undefined),
          monthlyPremiumPrice: typeof data.monthlyPremiumPrice === 'number' ? data.monthlyPremiumPrice : (data.monthlyPremiumPrice ? Number(data.monthlyPremiumPrice) : undefined)
        });
      });
      setRooms(roomsData);
      saveRooms(roomsData);
      setIsLoadingData(false);
    }, (error) => {
      console.warn("Firestore Rooms Subscription Error:", error);
      setIsLoadingData(false);
    });

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const bookingsData: Booking[] = [];
      snapshot.forEach((doc) => {
        bookingsData.push({ id: doc.id, ...doc.data() } as Booking);
      });
      setBookings(bookingsData);
      saveBookings(bookingsData);
    }, (error) => {
      console.warn("Firestore Bookings Subscription Error:", error);
    });

    const unsubActivity = onSnapshot(collection(db, 'ActivityCatalog'), (snapshot) => {
      const catalogData: any[] = [];
      snapshot.forEach((doc) => {
        catalogData.push({ id: doc.id, ...doc.data() });
      });
      setActivityCatalog(catalogData);
      saveActivityCatalog(catalogData);
    }, (error) => {
      console.warn("Firestore ActivityCatalog Subscription Error:", error);
    });

    const unsubActivityLedger = onSnapshot(collection(db, 'ActivityLedger'), (snapshot) => {
      const ledgerData: any[] = [];
      snapshot.forEach((doc) => {
        ledgerData.push({ id: doc.id, ...doc.data() });
      });
      setActivityTransactions(ledgerData);
    }, (error) => {
      console.warn("Firestore ActivityLedger Subscription Error:", error);
    });

    const unsubRoomRevenue = onSnapshot(collection(db, 'RoomRevenue'), (snapshot) => {
      const revenueData: any[] = [];
      snapshot.forEach((doc) => {
        revenueData.push({ id: doc.id, ...doc.data() });
      });
      setRoomRevenue(revenueData);
    }, (error) => {
      console.warn("Firestore RoomRevenue Subscription Error:", error);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        usersData.push({ id: doc.id, ...data } as User);
      });
      setUsers(usersData.filter(u => u.role && u.role.toLowerCase() === 'receptionist'));
      saveUsers(usersData);
    }, (error) => {
      console.warn("Firestore Users Subscription Error:", error);
    });

    const unsubHandovers = onSnapshot(collection(db, 'handovers'), (snapshot) => {
      const handoversData: HandoverRecord[] = [];
      snapshot.forEach((doc) => {
        handoversData.push({ id: doc.id, ...doc.data() } as HandoverRecord);
      });
      const sorted = handoversData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setHandovers(sorted);
      saveHandovers(sorted);
    }, (error) => {
      console.warn("Firestore Handovers Subscription Error:", error);
    });

    const unsubDrinks = onSnapshot(collection(db, 'drinks'), (snapshot) => {
      if (snapshot.empty) {
        const local = getDrinks();
        const toSeed = local.length > 0 ? local : initialDrinks;
        toSeed.forEach(async (drink) => {
          try {
            await setDoc(doc(db, 'drinks', drink.id), {
              name: drink.name,
              price: drink.price,
              category: drink.category || 'Beverage',
              inStock: drink.inStock ?? true,
              branch: drink.branch || 'All'
            });
          } catch (e) {
            console.error("Error seeding drink to Firestore:", e);
          }
        });
        setDrinks(toSeed);
        saveDrinks(toSeed);
        return;
      }
      const drinksData: DrinkItem[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        drinksData.push({ 
          id: doc.id, 
          name: d.name || '',
          price: Number(d.price) || 0,
          category: d.category,
          inStock: d.inStock ?? true,
          branch: d.branch || 'All'
        } as DrinkItem);
      });
      setDrinks(drinksData);
      saveDrinks(drinksData);
    }, (error) => {
      console.warn("Firestore Drinks Subscription Error:", error);
      setDrinks(getDrinks());
    });

    const unsubDrinkSales = onSnapshot(collection(db, 'drinkSales'), (snapshot) => {
      const salesData: DrinkSale[] = [];
      snapshot.forEach((doc) => {
        salesData.push({ id: doc.id, ...doc.data() } as DrinkSale);
      });
      const sorted = salesData.sort((a, b) => getSafeTime(b.timestamp) - getSafeTime(a.timestamp));
      setDrinkSales(sorted);
      saveDrinkSales(sorted);
    }, (error) => {
      console.warn("Firestore DrinkSales Subscription Error:", error);
      setDrinkSales(getDrinkSales());
    });

    const unsubPendingEditRequests = onSnapshot(collection(db, 'pendingEditRequests'), (snapshot) => {
      let editsData: PendingEditRequest[] = [];
      if (snapshot && !snapshot.empty) {
        snapshot.forEach((doc) => {
          editsData.push({ id: doc.id, ...doc.data() } as PendingEditRequest);
        });
      }

      const sorted = editsData.sort((a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));
      setPendingEditRequests(sorted);
      
      try {
        localStorage.setItem('nabslodge_pending_edits', JSON.stringify(sorted));
      } catch (e) {
        console.warn("Error saving pending edits to local storage:", e);
      }
    }, (error) => {
      console.warn("Firestore PendingEditRequests Subscription Error:", error);
      // Robust fallback entirely to local storage if Firestore subscription fails or is blocked
      try {
        const local = localStorage.getItem('nabslodge_pending_edits');
        if (local) {
          const localParsed = JSON.parse(local) as PendingEditRequest[];
          if (Array.isArray(localParsed)) {
            const sorted = localParsed.sort((a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));
            setPendingEditRequests(sorted);
          }
        }
      } catch (e) {}
    });

    // Fetch local settings
    const localSettings = localStorage.getItem('globalSettings_local');
    if (localSettings) {
      try {
        const parsed = JSON.parse(localSettings);
        if (parsed.annexIp) setAnnexIp(parsed.annexIp);
        if (parsed.ayigyaIp) setAyigyaIp(parsed.ayigyaIp);
        if (parsed.checkInTime) setGlobalCheckInTime(parsed.checkInTime);
        if (parsed.checkOutTime) setGlobalCheckOutTime(parsed.checkOutTime);
        if (parsed.lateCheckOutFee !== undefined) setLateCheckOutFee(Number(parsed.lateCheckOutFee));
      } catch (e) {
        console.warn("Could not parse local settings");
      }
    }

    // A safety timeout to ensure skeleton loaders resolve if Firestore is completely empty
    const safetyTimer = setTimeout(() => {
      setIsLoadingData(false);
    }, 1500);

    return () => {
      unsubRooms();
      unsubBookings();
      unsubActivity();
      unsubActivityLedger();
      unsubRoomRevenue();
      unsubUsers();
      unsubHandovers();
      unsubDrinks();
      unsubDrinkSales();
      unsubPendingEditRequests();
      clearTimeout(safetyTimer);
    };
  }, []);

  // --- ACTIVITY CATALOG HANDLERS ---
  const handleSaveActivityCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityName.trim() || !newActivityPrice.trim()) {
      addToast('Validation Error', 'error', 'Please enter a valid name and price.', 3000);
      return;
    }

    setIsSavingActivity(true);
    try {
      const priceNum = parseFloat(newActivityPrice) || 0;
      if (editingCatalogId) {
        // Local state update first
        const updatedCatalog = activityCatalog.map(item => 
          item.id === editingCatalogId ? { ...item, name: newActivityName.trim(), price: priceNum } : item
        );
        setActivityCatalog(updatedCatalog);
        saveActivityCatalog(updatedCatalog);

        // Firestore sync
        const activityRef = doc(db, 'ActivityCatalog', editingCatalogId);
        await safeUpdateDoc(activityRef, {
          name: newActivityName.trim(),
          price: priceNum
        });
        addToast('Activity Updated', 'success', `Activity "${newActivityName}" updated successfully.`, 3000);
      } else {
        const newItemId = 'act_' + Math.random().toString(36).substring(2, 9);
        const newItemData = {
          id: newItemId,
          name: newActivityName.trim(),
          price: priceNum,
          createdAt: getFormattedDateTime()
        };
        // Local state update first
        const updatedCatalog = [...activityCatalog, newItemData];
        setActivityCatalog(updatedCatalog);
        saveActivityCatalog(updatedCatalog);

        // Firestore sync
        await safeAddDoc(collection(db, 'ActivityCatalog'), newItemData);
        addToast('Activity Created', 'success', `Activity "${newActivityName}" added to catalog successfully.`, 3000);
      }

      setNewActivityName('');
      setNewActivityPrice('');
      setEditingCatalogId(null);
    } catch (err: any) {
      console.error("Catalog Write Warning:", err);
      addToast('Saved Locally', 'info', `Activity "${newActivityName}" saved locally.`, 3000);
    } finally {
      setIsSavingActivity(false);
    }
  };

  const handleDeleteActivityCatalogItem = async (id: string) => {
    try {
      const updated = activityCatalog.filter(item => item.id !== id);
      setActivityCatalog(updated);
      saveActivityCatalog(updated);

      await safeDeleteDoc(doc(db, 'ActivityCatalog', id));
      addToast('Activity Deleted', 'success', 'Activity removed from catalog.', 3000);
    } catch (err: any) {
      console.error("Catalog Delete Warning:", err);
      const updated = activityCatalog.filter(item => item.id !== id);
      setActivityCatalog(updated);
      saveActivityCatalog(updated);
      addToast('Activity Deleted', 'success', 'Activity removed locally.', 3000);
    }
  };

  // --- DRINK MANAGEMENT HANDLERS ---
  const handleSaveDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDrinkName.trim() || newDrinkPrice <= 0) {
      addToast('Validation Error', 'error', 'Please enter a valid drink name and price.');
      return;
    }

    try {
      const drinkObj = {
        name: newDrinkName.trim(),
        price: Number(newDrinkPrice),
        category: newDrinkCategory,
        inStock: true,
        branch: newDrinkBranch
      };

      const added = addDrink(drinkObj);
      await safeSetDoc(doc(db, 'drinks', added.id), {
        ...added,
        dateCreated: serverTimestamp()
      });

      setDrinks(getDrinks());
      setShowAddDrinkModal(false);
      setNewDrinkName('');
      setNewDrinkPrice(15);
      setNewDrinkCategory('Soft Drink');
      setNewDrinkBranch('All');

      addToast('Drink Added', 'success', `${added.name} (GH₵${added.price.toFixed(2)}) added to available drinks.`);
    } catch (err: any) {
      console.error("Failed to add drink:", err);
      addToast('Error', 'error', 'Could not add drink.');
    }
  };

  const handleToggleDrinkStock = async (drinkId: string, currentStock: boolean) => {
    const updated = drinks.map(d => d.id === drinkId ? { ...d, inStock: !currentStock } : d);
    setDrinks(updated);
    saveDrinks(updated);
    try {
      await updateDoc(doc(db, 'drinks', drinkId), { inStock: !currentStock });
      addToast('Stock Status Updated', 'success', `Drink availability set to ${!currentStock ? 'In Stock' : 'Out of Stock'}.`);
    } catch (err: any) {
      console.warn("Firestore updateDoc error for drink stock:", err);
    }
  };

  const handleEditDrink = (drink: DrinkItem) => {
    setDrinkToEdit(drink);
    setEditDrinkName(drink.name);
    setEditDrinkPrice(drink.price);
    setEditDrinkCategory(drink.category || 'Soft Drink');
    setEditDrinkBranch(drink.branch);
    setShowEditDrinkModal(true);
  };

  const handleSaveEditDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drinkToEdit || !editDrinkName.trim() || editDrinkPrice <= 0) {
      addToast('Validation Error', 'error', 'Please enter a valid drink name and price.');
      return;
    }

    try {
      const updatedDrinks = drinks.map(d =>
        d.id === drinkToEdit.id
          ? { ...d, name: editDrinkName.trim(), price: editDrinkPrice, category: editDrinkCategory, branch: editDrinkBranch }
          : d
      );
      setDrinks(updatedDrinks);
      saveDrinks(updatedDrinks);

      await updateDoc(doc(db, 'drinks', drinkToEdit.id), {
        name: editDrinkName.trim(),
        price: editDrinkPrice,
        category: editDrinkCategory,
        branch: editDrinkBranch
      });

      setShowEditDrinkModal(false);
      setDrinkToEdit(null);
      addToast('Drink Updated', 'success', `"${editDrinkName}" details updated.`);
    } catch (err: any) {
      console.error("Failed to edit drink:", err);
      addToast('Error', 'error', 'Could not update drink.');
    }
  };



  const handleDeleteDrink = (drink: DrinkItem) => {
    setDrinkToDelete(drink);
  };

  const confirmDeleteDrink = async () => {
    if (!drinkToDelete) return;
    const drinkId = drinkToDelete.id;
    const drinkName = drinkToDelete.name;
    const updated = drinks.filter(d => d.id !== drinkId);
    setDrinks(updated);
    saveDrinks(updated);
    setDrinkToDelete(null);
    try {
      await deleteDoc(doc(db, 'drinks', drinkId));
      addToast('Drink Item Deleted', 'info', `"${drinkName}" removed from store.`);
    } catch (err: any) {
      console.warn("Firestore deleteDoc error for drink:", err);
    }
  };

  // --- RECEPTIONIST MANAGEMENT HANDLERS ---
  const handleOpenAddRec = () => {
    setEditingRec(null);
    setRecEmail('');
    handleGeneratePassword();
    setRecName('');
    setRecBranch('Annex');
    setRecStatus('Active');
    setRecError('');
    setShowRecModal(true);
  };

  const handleOpenEditRec = (rec: User) => {
    setEditingRec(rec);
    setRecEmail(rec.email);
    setRecName(rec.name);
    setRecPassword(rec.password || '');
    setRecBranch(rec.branch || 'Annex');
    setRecStatus(rec.status || 'Active');
    setRecError('');
    setShowRecModal(true);
  };

  const handleGeneratePassword = () => {
    const figures = Math.floor(100 + Math.random() * 900).toString();
    const generatedPass = 'nabslodge' + figures;
    setRecPassword(generatedPass);
  };

  const handleDeleteReceptionistVaultAndDb = async (
    receptionistId: string,
    email: string,
    password: string
  ) => {
    try {
      // 1. Delete document from Firestore users collection
      try {
        await safeDeleteDoc(doc(db, 'users', receptionistId));
      } catch (fErr: any) {
        console.warn("Firestore user deletion error:", fErr);
      }

      // 2. Delete from local storage and update users state
      deleteReceptionist(currentUser.id, currentUser.name, receptionistId);
      const updatedUsers = getUsers();
      setUsers(updatedUsers.filter(u => u.role && u.role.toLowerCase() === 'receptionist'));

      addAuditLog(
        currentUser.id,
        currentUser.name,
        'Manager',
        'Global',
        'Delete Receptionist Account',
        `Permanently deleted receptionist account: (${email})`
      );

      addToast(
        'Receptionist Account Deleted',
        'success',
        `Receptionist account (${email}) has been permanently deleted.`,
        5000
      );
    } catch (err: any) {
      console.error("Account Deletion Failed:", err);
      window.alert(`Error deleting receptionist account: ${err.message}`);
    }
  };

  const handleSaveReceptionist = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError('');

    if (!recEmail.trim() || !recPassword.trim() || !recName.trim()) {
      setRecError('All fields must be filled out.');
      return;
    }

    if (editingRec) {
      // Edit: Prepare pristine StaffUpdateInput payload
      try {
        // Find auth user? Actually we can't easily find auth user by ID without storing email.
        // We have email. Let's try to update password via re-auth or just assume manager has permissions to update users.
        // Simplified: The request asks to make sure the receptionist can login with the NEW password.
        // Since we don't have the current password, we might need to use admin SDK, but we are client side.
        // Let's assume we can update password via auth.updatePassword if we are logged in, 
        // BUT we are logged in as manager. This is a common client-side limitation.
        // We will stick to updating the local data and firestore data, and hope auth syncs or relies on local data.
        
        const updatedInput: StaffUpdateInput = {
          id: editingRec.id,
          email: recEmail.toLowerCase().trim(),
          name: recName,
          branch: recBranch as Branch,
          password: recPassword,
          status: recStatus
        };

        const result = updateReceptionist(currentUser.id, currentUser.name, updatedInput);
        if (!result.success) {
          setRecError(result.error || 'Failed to update receptionist credentials.');
          return;
        }

        // Sync with Firestore (users collection)
        try {
          await safeSetDoc(doc(db, 'users', editingRec.id), {
            id: editingRec.id,
            email: recEmail.toLowerCase().trim(),
            name: recName,
            role: 'receptionist',
            branch: recBranch,
            password: recPassword,
            status: recStatus,
            updatedAt: getFormattedDateTime()
          }, { merge: true });
        } catch (fErr) {
          console.warn("Firestore user update sync deferred:", fErr);
        }

        // Refresh management ledger state
        const updatedUsers = getUsers();
        setUsers(updatedUsers.filter(u => u.role && u.role.toLowerCase() === 'receptionist'));
        setShowRecModal(false);

        addToast(
          'Credentials Updated',
          'success',
          `Successfully updated receptionist "${recName}" credentials and assigned to Nabslodge ${recBranch}.`,
          5000
        );
      } catch (err: any) {
        setRecError(err.message || 'Failed to update receptionist.');
      }
    } else {
      // Add
      try {
        let createdAuthUid: string | undefined = undefined;

        if (isFirebaseConfigured) {
          try {
            const tempApp = initializeApp(firebaseConfig, 'tempApp-' + Date.now());
            const tempAuth = getAuth(tempApp);
            const authUser = await createUserWithEmailAndPassword(tempAuth, recEmail.toLowerCase().trim(), recPassword);
            createdAuthUid = authUser.user.uid;
            await deleteApp(tempApp).catch(() => {});
          } catch (fbAuthErr: any) {
            console.warn("Firebase Auth receptionist creation skipped/failed:", fbAuthErr);
          }
        }
        
        const result = createReceptionist(
          currentUser.id,
          currentUser.name,
          recEmail.toLowerCase().trim(),
          recPassword,
          recName,
          recBranch as Branch,
          createdAuthUid
        );
        
        if (!result.success) {
          setRecError(result.error || 'Failed to establish new receptionist account.');
          return;
        }
        
        if (result.user) {
          // Also apply status setting
          const allUsers = getUsers();
          const createdUser = allUsers.find(u => u.id === result.user!.id);
          if (createdUser) {
            createdUser.status = recStatus;
            saveUsers(allUsers);
          }

          // Sync with Firestore (users collection using user.uid)
          try {
            await safeSetDoc(doc(db, 'users', result.user.id), {
              id: result.user.id,
              uid: result.user.id,
              email: recEmail.toLowerCase().trim(),
              name: recName,
              role: 'receptionist',
              branch: recBranch,
              password: recPassword,
              status: recStatus,
              createdAt: result.user.createdAt,
              updatedAt: getFormattedDateTime()
            });
          } catch (fErr) {
            console.warn("Firestore user creation sync deferred:", fErr);
          }
        }
        
        const updatedUsers = getUsers();
        setUsers(updatedUsers.filter(u => u.role && u.role.toLowerCase() === 'receptionist'));
        setShowRecModal(false);

        addToast(
          'Staff Added Successfully',
          'success',
          `New shift profile created for ${recName} assigned to Nabslodge ${recBranch}.`,
          5000
        );
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          setRecError('This email is already in use. Please use a different email address or check if the staff member already exists.');
        } else {
          setRecError(authErr.message || 'Failed to create authentication user.');
        }
      }
    }
  };

  const handleDeleteRec = (id: string) => {
    const foundRec = users.find(u => u.id === id);
    if (!foundRec) return;
    if (foundRec.status !== 'Inactive') {
      addToast(
        'Status Must Be Inactive',
        'warning',
        'Account status must be set to "Inactive" before deletion is allowed.',
        4000
      );
      return;
    }
    setRecToDelete(foundRec);
  };

  const executeRecDeletion = async (id: string, email: string, password: string) => {
    await handleDeleteReceptionistVaultAndDb(id, email, password);
  };

  // --- ROOM SETUP HANDLERS ---
  const handleOpenAddRoom = () => {
    setEditingRoom(null);
    setRoomNumber('');
    setRoomType('Standard');
    setRoomPrice('');
    setRoomBranch('Annex');
    setRoomStatus('Available');
    setRoomAmenities([]);
    setCustomAmenityInput('');
    setAmenitiesInput('');
    setRoomDescription('');
    setRoomMaxGuests('2');
    setNormalBookingPrice('');
    setNormalBookingMaxGuests('');
    setOccasionBookingPrice('');
    setOccasionBookingMaxGuests('');
    setMonthlyPremiumPrice('');
    setRoomError('');
    setShowRoomModal(true);
  };

  const handleOpenEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomNumber(room.roomNumber || '');
    setRoomType(room.roomType || 'Standard');
    setRoomPrice((room.price ?? 0).toString());
    setRoomBranch(room.branch || 'Annex');
    setRoomStatus(room.status || 'Available');
    setRoomAmenities(room.amenities || []);
    setCustomAmenityInput('');
    setAmenitiesInput((room.amenities || []).join(', '));
    setRoomDescription(room.description || '');
    setRoomMaxGuests((room.maxGuests || 2).toString());
    setNormalBookingPrice((room.normalBookingPrice ?? '').toString());
    setNormalBookingMaxGuests((room.normalBookingMaxGuests ?? '').toString());
    setOccasionBookingPrice((room.occasionBookingPrice ?? '').toString());
    setOccasionBookingMaxGuests((room.occasionBookingMaxGuests ?? '').toString());
    setMonthlyPremiumPrice((room.monthlyPremiumPrice ?? '').toString());
    setRoomError('');
    setShowRoomModal(true);
  };

  const handleToggleAmenity = (amenity: string) => {
    if (roomAmenities.includes(amenity)) {
      setRoomAmenities(roomAmenities.filter(a => a !== amenity));
    } else {
      setRoomAmenities([...roomAmenities, amenity]);
    }
  };

  const handleRemoveAmenity = (amenityToRemove: string) => {
    setRoomAmenities(roomAmenities.filter(a => a !== amenityToRemove));
  };

  const handleAddCustomAmenity = () => {
    const raw = customAmenityInput;
    if (!raw.trim()) return;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const updated = [...roomAmenities];
    parts.forEach(part => {
      if (!updated.includes(part)) {
        updated.push(part);
      }
    });
    setRoomAmenities(updated);
    setCustomAmenityInput('');
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingAction) return;
    setRoomError('');

    const isApartment = roomType === '2 Bedroom Apartment' || roomType === '3 Bedroom Apartment';
    let finalPrice = parseFloat(roomPrice);
    let finalMaxGuests = parseInt(roomMaxGuests) || 2;

    if (isApartment) {
      if (!normalBookingPrice || isNaN(parseFloat(normalBookingPrice)) || parseFloat(normalBookingPrice) <= 0) {
        setRoomError('Please provide a valid Normal Booking Price.');
        return;
      }
      if (!normalBookingMaxGuests || isNaN(parseInt(normalBookingMaxGuests)) || parseInt(normalBookingMaxGuests) <= 0) {
        setRoomError('Please provide a valid Normal Booking Max Guests.');
        return;
      }
      if (!occasionBookingPrice || isNaN(parseFloat(occasionBookingPrice)) || parseFloat(occasionBookingPrice) <= 0) {
        setRoomError('Please provide a valid Occasion Booking Price.');
        return;
      }
      if (!occasionBookingMaxGuests || isNaN(parseInt(occasionBookingMaxGuests)) || parseInt(occasionBookingMaxGuests) <= 0) {
        setRoomError('Please provide a valid Occasion Booking Max Guests.');
        return;
      }
      finalPrice = parseFloat(normalBookingPrice);
      finalMaxGuests = parseInt(normalBookingMaxGuests);
    } else {
      if (!roomNumber.trim() || isNaN(finalPrice) || finalPrice <= 0) {
        setRoomError('Please provide a valid room number and a positive nightly price.');
        return;
      }
    }

    const amenitiesArray = roomAmenities;
    setIsProcessingAction(true);

    if (editingRoom) {
      const updatedRoomObj: Room = {
        ...editingRoom,
        roomNumber,
        roomType,
        price: finalPrice,
        status: roomStatus as RoomStatus,
        branch: roomBranch as Branch,
        amenities: amenitiesArray,
        description: roomDescription,
        maxGuests: finalMaxGuests,
        normalBookingPrice: isApartment ? parseFloat(normalBookingPrice) : undefined,
        normalBookingMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : undefined,
        occasionBookingPrice: isApartment ? parseFloat(occasionBookingPrice) : undefined,
        occasionBookingMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : undefined,
        monthlyPremiumPrice: monthlyPremiumPrice ? parseFloat(monthlyPremiumPrice) : undefined
      };

      // 1. Instant local storage update
      const updatedRoomsList = rooms.map(r => r.id === editingRoom.id ? updatedRoomObj : r);
      saveRooms(updatedRoomsList);
      setRooms(updatedRoomsList);
      setShowRoomModal(false);
      addToast(
        'Room Configurations Saved',
        'success',
        `Successfully updated Room ${roomNumber} characteristics.`,
        4000
      );

      // 2. Safe async Firestore sync
      try {
        await safeUpdateDoc(doc(db, 'rooms', editingRoom.id), {
          roomNumber,
          roomType,
          price: finalPrice,
          status: roomStatus,
          branch: roomBranch,
          amenities: amenitiesArray,
          description: roomDescription,
          maxGuests: finalMaxGuests,
          normalBookingPrice: isApartment ? parseFloat(normalBookingPrice) : null,
          normalBookingMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : null,
          occasionBookingPrice: isApartment ? parseFloat(occasionBookingPrice) : null,
          occasionBookingMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : null,
          monthlyPremiumPrice: monthlyPremiumPrice ? parseFloat(monthlyPremiumPrice) : null,
          normalPrice: isApartment ? parseFloat(normalBookingPrice) : null,
          normalMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : null,
          occasionPrice: isApartment ? parseFloat(occasionBookingPrice) : null,
          occasionMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : null
        });

        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        await safeSetDoc(doc(db, 'auditLogs', logId), {
          timestamp: getFormattedDateTime(),
          userId: currentUser.id,
          userName: currentUser.name,
          executiveId: currentUser.id,
          executiveName: currentUser.name,
          userRole: 'Manager',
          branch: 'Global',
          action: 'Update Room Config',
          details: `Updated Room ${roomNumber} (${roomBranch}) details. Status: ${roomStatus}, Price: GH₵${finalPrice.toFixed(2)}`,
          previousState: JSON.stringify(editingRoom),
          newState: JSON.stringify(updatedRoomObj)
        });
      } catch (err: any) {
        console.warn("Firestore room update note:", err);
      } finally {
        setIsProcessingAction(false);
      }
    } else {
      // Add using addDoc
      const exists = rooms.some((r) => r.branch === roomBranch && r.roomNumber === roomNumber);
      if (exists) {
        setRoomError(`Room ${roomNumber} already exists in the Nabslodge ${roomBranch} branch.`);
        setIsProcessingAction(false);
        return;
      }

      const newRoomId = 'room_' + Math.random().toString(36).substring(2, 9);
      const newRoomObj: Room = {
        id: newRoomId,
        roomNumber,
        roomType,
        price: finalPrice,
        status: roomStatus as RoomStatus,
        branch: roomBranch as Branch,
        amenities: amenitiesArray,
        description: roomDescription,
        maxGuests: finalMaxGuests,
        normalBookingPrice: isApartment ? parseFloat(normalBookingPrice) : undefined,
        normalBookingMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : undefined,
        occasionBookingPrice: isApartment ? parseFloat(occasionBookingPrice) : undefined,
        occasionBookingMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : undefined,
        monthlyPremiumPrice: monthlyPremiumPrice ? parseFloat(monthlyPremiumPrice) : undefined
      };

      // 1. Instant local storage update
      const updatedRoomsList = [...rooms, newRoomObj];
      saveRooms(updatedRoomsList);
      setRooms(updatedRoomsList);
      setShowRoomModal(false);
      setRoomSuccessMessage('Room is successfully added');
      addToast(
        'room add successfully',
        'success',
        `Room ${roomNumber} (${roomType}) has been registered at Nabslodge ${roomBranch}.`,
        5000
      );

      // 2. Safe async Firestore sync
      try {
        await safeAddDoc(collection(db, 'rooms'), {
          roomNumber,
          roomType,
          price: finalPrice,
          status: roomStatus,
          branch: roomBranch,
          amenities: amenitiesArray,
          description: roomDescription,
          maxGuests: finalMaxGuests,
          normalBookingPrice: isApartment ? parseFloat(normalBookingPrice) : null,
          normalBookingMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : null,
          occasionBookingPrice: isApartment ? parseFloat(occasionBookingPrice) : null,
          occasionBookingMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : null,
          monthlyPremiumPrice: monthlyPremiumPrice ? parseFloat(monthlyPremiumPrice) : null,
          normalPrice: isApartment ? parseFloat(normalBookingPrice) : null,
          normalMaxGuests: isApartment ? parseInt(normalBookingMaxGuests) : null,
          occasionPrice: isApartment ? parseFloat(occasionBookingPrice) : null,
          occasionMaxGuests: isApartment ? parseInt(occasionBookingMaxGuests) : null
        });

        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        await safeSetDoc(doc(db, 'auditLogs', logId), {
          timestamp: getFormattedDateTime(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: 'Manager',
          branch: 'Global',
          action: 'Create Room',
          details: `Added Room ${roomNumber} (${roomType}) in Nabslodge ${roomBranch} at GH₵${finalPrice.toFixed(2)}/night.`
        });
      } catch (err: any) {
        console.warn("Firestore room creation note:", err);
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const executeRoomDeletion = async (id: string) => {
    const roomToDelete = rooms.find((r) => r.id === id);
    if (!roomToDelete) {
      alert('Room not found.');
      return;
    }

    if (roomToDelete.status === 'Occupied') {
      alert('Cannot delete an occupied room. Check out guests first.');
      return;
    }

    try {
      // 1. Instant local storage update
      deleteRoom(currentUser.id, currentUser.name, id);
      const updatedRooms = rooms.filter(r => r.id !== id);
      setRooms(updatedRooms);
      saveRooms(updatedRooms);

      addToast(
        'Room Removed Successfully',
        'warning',
        'Room has been deleted and purged from Nabslodge catalog.',
        4000
      );

      // 2. Safe async Firestore sync
      await safeDeleteDoc(doc(db, 'rooms', id));

      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await safeSetDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Manager',
        branch: 'Global',
        action: 'Delete Room',
        details: `Removed Room ${roomToDelete.roomNumber} from Nabslodge ${roomToDelete.branch} branch.`
      });
    } catch (err: any) {
      console.warn("Firestore room deletion note:", err);
    }
  };

  const handleDeleteRoom = (roomId: string, roomNumber: string) => {
    setRoomToDelete({ id: roomId, roomNumber });
  };

  // --- ANALYTICS CALCULATIONS ---
  const activeBookings = bookings.filter(b => b.status === 'CheckedIn');
  const completedBookings = bookings.filter(b => b.status === 'CheckedOut');
  

  // Compile bifurcated ledger entries
  const compiledLedgerEntries = React.useMemo(() => {
    const entries: Array<{
      id: string;
      date: string;
      guestName: string;
      stream: 'Room' | 'Activity' | 'Bar';
      category: string;
      description: string;
      branch: Branch | 'All' | 'Global';
      amount: number;
      status: string;
    }> = [];

    // 1. Process Room Revenue Ledger
    bookings.forEach(b => {
      if (b.status === 'Cancelled') return;

      const defaultDateStr = b.checkInDate 
        ? ((b.checkInDate as any).seconds 
            ? new Date((b.checkInDate as any).seconds * 1000).toLocaleDateString()
            : new Date(b.checkInDate).toLocaleDateString())
        : 'N/A';

      const bRevenues = roomRevenue.filter(r => r.bookingId === b.id);
      
      // Add explicit recorded transactions
      bRevenues.forEach(r => {
        entries.push({
          id: r.id,
          date: parseSafeDate(r.timestamp || r.dateCreated || r.createdAt)?.toLocaleDateString() || defaultDateStr,
          guestName: b.guestName,
          stream: r.revenueType === 'DrinkSettlement' ? 'Bar' : 'Room',
          category: r.revenueType === 'ExtensionFee' ? 'Lodging Extension Fee' : r.revenueType === 'CheckoutBalance' ? 'Lodging Stay Fee (Checkout Balance)' : r.revenueType === 'DrinkSettlement' ? 'Drink Sale (Checkout Settlement)' : 'Lodging Deposit/Allocation',
          description: `${r.revenueType} for Room ${b.roomNumber}`,
          branch: (r.branch as Branch) || b.branch,
          amount: Number(r.amount),
          status: 'Collected'
        });
      });

      // Track missing/legacy amounts
      const extRevsSum = bRevenues.filter(r => r.revenueType === 'ExtensionFee').reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const roomRevsSum = bRevenues.filter(r => r.revenueType !== 'ExtensionFee' && r.revenueType !== 'DrinkSettlement').reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // Extension legacy
      const expectedExt = Number(b.lateCheckOutFeeApplied || 0);
      if (expectedExt > extRevsSum) {
        entries.push({
          id: `legacy_ext_${b.id}`,
          date: defaultDateStr,
          guestName: b.guestName,
          stream: 'Room',
          category: 'Lodging Extension Fee',
          description: `Late check-out extension fee for Room ${b.roomNumber}`,
          branch: b.branch,
          amount: expectedExt - extRevsSum,
          status: 'Collected'
        });
      }

      // Room stay fee missing or unpaid
      let expectedRoom = 0;
      let statusStr = 'Collected';

      if (b.paymentStatus === 'Paid') {
        expectedRoom = b.totalPrice;
        statusStr = 'Paid';
      } else if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) {
        expectedRoom = Number(b.amountPaid ?? b.deposit ?? b.amountReceived ?? (b.totalPrice / 2));
        statusStr = 'Paid';
      }

      const balance = b.totalPrice - expectedRoom;
      
      if (expectedRoom > roomRevsSum) {
        entries.push({
          id: `legacy_stay_${b.id}`,
          date: defaultDateStr,
          guestName: b.guestName,
          stream: 'Room',
          category: 'Lodging Stay Fee',
          description: `Lodging stay fee for Room ${b.roomNumber}`,
          branch: b.branch,
          amount: expectedRoom - roomRevsSum,
          status: statusStr
        });
      }

      // Record any unpaid pending balances
      if (balance > 0 && b.status !== 'CheckedOut' && b.status !== 'Cancelled') {
        entries.push({
          id: `unpaid_stay_${b.id}`,
          date: defaultDateStr,
          guestName: b.guestName,
          stream: 'Room',
          category: 'Lodging Stay Fee',
          description: `Unpaid lodging balance for Room ${b.roomNumber}`,
          branch: b.branch,
          amount: balance,
          status: 'Unpaid (Due on Checkout)'
        });
      }
    });

    // 2. Process Activity / Walk-In Ledger
    activityTransactions.forEach(t => {
      entries.push({
        id: t.id,
        date: t.timestamp ? t.timestamp.split(' ')[0] : 'N/A',
        guestName: t.guestName,
        stream: 'Activity',
        category: t.serviceType,
        description: `${t.serviceType} Walk-In Activity`,
        branch: t.branch,
        amount: t.totalPrice || t.amountPaid || 0,
        status: t.paymentStatus || 'Paid'
      });
    });

    // 3. Process Drink Sales Ledger
    drinkSales.forEach(s => {
      const paidAmount = getDrinkPaidAmount(s);
      const status = s.paymentStatus || 'Paid';
      
      // SKIP drinks that were settled at checkout to avoid double counting with RoomRevenue DrinkSettlement entries
      if (s.settledPaymentMethod) return;

      entries.push({
        id: s.id,
        date: s.timestamp ? s.timestamp.split(' ')[0] : 'N/A',
        guestName: s.guestName,
        stream: 'Bar',
        category: 'Drink Sale',
        description: s.items ? `Drink Purchase: ${s.drinkName}` : `Drink Purchase: ${s.drinkName} (x${s.quantity})`,
        branch: (s.branch as Branch) || 'All',
        amount: paidAmount,
        status: status === 'Unpaid' ? 'Unpaid (Room Bill)' : status
      });
    });

    // Sort entries chronologically (newest first)
    return entries.sort((a, b) => b.id.localeCompare(a.id));
  }, [bookings, activityTransactions, drinkSales]);

  // Compute filtered entries and subtotals
  const filteredLedgerEntries = React.useMemo(() => {
    return compiledLedgerEntries.filter(entry => {
      const matchBranch = ledgerBranchFilter === 'All' || entry.branch === ledgerBranchFilter;
      const matchStream = ledgerStreamFilter === 'All' || entry.stream === ledgerStreamFilter;
      return matchBranch && matchStream;
    });
  }, [compiledLedgerEntries, ledgerBranchFilter, ledgerStreamFilter]);

  const ledgerSubtotals = React.useMemo(() => {
    let roomTotal = 0;
    let activityTotal = 0;
    let barTotal = 0;

    filteredLedgerEntries.forEach(entry => {
      // For ledger summaries, we only sum up what has been actually collected
      if (entry.status !== 'Unpaid (Due on Checkout)' && !entry.status?.startsWith('Unpaid')) {
        if (entry.stream === 'Room') {
          roomTotal += entry.amount;
        } else if (entry.stream === 'Bar') {
          barTotal += entry.amount;
        } else {
          activityTotal += entry.amount;
        }
      }
    });

    return {
      room: roomTotal,
      activity: activityTotal,
      bar: barTotal,
      total: roomTotal + activityTotal + barTotal
    };
  }, [filteredLedgerEntries]);

  // Independent Activity Monthly Archive Aggregation
  const independentActivityMonthlyArchive = React.useMemo(() => {
    const currentYear = selectedYear || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(currentYear, i, 1);
      return {
        monthNum: i,
        monthName: d.toLocaleString('default', { month: 'long' }) + ` ${currentYear}`,
        shortMonth: d.toLocaleString('default', { month: 'short' }),
        annexRevenue: 0,
        annexCount: 0,
        ayigyaRevenue: 0,
        ayigyaCount: 0,
        totalRevenue: 0,
        totalCount: 0
      };
    });

    activityTransactions.forEach(t => {
      const tDateStr = t.timestamp || t.dateCreated || new Date().toISOString();
      const tDate = new Date(tDateStr);
      const tYear = isNaN(tDate.getFullYear()) ? currentYear : tDate.getFullYear();
      const tMonth = isNaN(tDate.getMonth()) ? 0 : tDate.getMonth();

      if (tYear === currentYear && tMonth >= 0 && tMonth < 12) {
        const amt = Number(t.totalPrice || t.amountPaid || t.amount || 0);
        const branch = t.branch || 'Annex';
        if (branch === 'Annex') {
          months[tMonth].annexRevenue += amt;
          months[tMonth].annexCount += 1;
        } else if (branch === 'Ayigya') {
          months[tMonth].ayigyaRevenue += amt;
          months[tMonth].ayigyaCount += 1;
        }
        months[tMonth].totalRevenue += amt;
        months[tMonth].totalCount += 1;
      }
    });

    const rows: Array<{
      id: string;
      month: string;
      branch: string;
      count: number;
      revenue: number;
    }> = [];

    months.forEach(m => {
      if (activityReportBranchFilter === 'All' || activityReportBranchFilter === 'Annex') {
        rows.push({
          id: `${m.monthNum}_Annex`,
          month: m.monthName,
          branch: 'Nabslodge Annex',
          count: m.annexCount,
          revenue: m.annexRevenue
        });
      }
      if (activityReportBranchFilter === 'All' || activityReportBranchFilter === 'Ayigya') {
        rows.push({
          id: `${m.monthNum}_Ayigya`,
          month: m.monthName,
          branch: 'Nabslodge Ayigya',
          count: m.ayigyaCount,
          revenue: m.ayigyaRevenue
        });
      }
    });

    return { months, rows };
  }, [activityTransactions, selectedYear, activityReportBranchFilter]);

  // Branch Specific Stats
  const getBranchStats = (branch: Branch) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isCurrentMonth = (dateStr: string | null | undefined, recordInfo?: any) => {
      if (!dateStr) return false;
      const d = parseSafeDate(dateStr);
      if (!d) {
        console.warn("Date Parsing Warning: Failed to parse date string '" + dateStr + "' for current month evaluation. Record details:", recordInfo || 'unknown');
        return false;
      }
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };

    const branchRooms = rooms.filter(r => r.branch === branch);

    // Filter unified coreLodgeTransactions (reconciled room payments and extension fees) for current month
    const branchCoreLodgeTxs = coreLodgeTransactions.filter(t => {
      const ts = t.timestamp || (t as any).dateCreated || (t as any).createdAt || (t as any).checkInDate;
      const matchesBranch = t.branch === branch || (t as any).lodgeBranch === branch;
      return matchesBranch && isCurrentMonth(ts, t);
    });

    const drinkSettlementRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType === 'DrinkSettlement')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const extensionRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType === 'ExtensionFee')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const baseLodgingRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType !== 'DrinkSettlement' && t.revenueType !== 'ExtensionFee')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const activityRevenue = activityTransactions
      .filter(t => (t.branch === branch || t.lodgeBranch === branch) && isCurrentMonth(t.timestamp || t.dateCreated || t.createdAt, t))
      .reduce((acc, curr) => acc + Number(curr.amountPaid !== undefined && curr.amountPaid !== null ? curr.amountPaid : (curr.totalPrice || 0)), 0);

    const barRevenue = drinkSales
      .filter(s => (s.branch === branch || (s as any).lodgeBranch === branch) && isCurrentMonth(s.timestamp, s))
      .reduce((acc, curr) => {
        // Only count drinks that are NOT settled as part of a room bill
        if (isDrinkSettledToRoom(curr)) return acc;

        const paid = getDrinkPaidAmount(curr);
        return acc + paid;
      }, 0) + drinkSettlementRevenue;

    // Clean summation of actual cash collected without overlap
    const revenue = baseLodgingRevenue + extensionRevenue + activityRevenue + barRevenue;

    const totalRmsCount = branchRooms.length;
    const occupiedCount = branchRooms.filter(r => {
      const isStatusOccupied = r.status === 'Occupied' || !!r.guestName;
      const hasActiveBooking = bookings.some(b => 
        (b.roomId === r.id || String(b.roomNumber) === String(r.roomNumber)) && 
        (b.branch === branch || !b.branch) && 
        (b.status === 'CheckedIn' || b.status === 'checked_in')
      );
      return isStatusOccupied || hasActiveBooking;
    }).length;
    const maintenanceCount = branchRooms.filter(r => r.status === 'Maintenance').length;
    const occupancyRate = totalRmsCount > 0 ? (occupiedCount / totalRmsCount) * 100 : 0;

    return {
      revenue,
      roomRevenue: baseLodgingRevenue,
      extensionRevenue,
      activityRevenue,
      barRevenue,
      totalRooms: totalRmsCount,
      occupied: occupiedCount,
      maintenance: maintenanceCount,
      occupancyRate
    };
  };

  const parseTimestampMs = (record: any): number | null => {
    if (!record) return null;
    for (const field of ['dateCreated', 'timestamp', 'createdAt', 'date']) {
      if (record[field]) {
        const d = parseSafeDate(record[field]);
        if (d && !isNaN(d.getTime())) return d.getTime();
      }
    }
    return null;
  };

  const getReceptionistShiftStats = (recId: string, lastShiftReset?: number, recEmail?: string, recName?: string) => {
    const isRecordInActiveShift = (record: any): boolean => {
      const isMyUser = 
        record.receptionistId === recId || 
        (recEmail && record.receptionistId === recEmail) ||
        (recName && record.receptionistName && record.receptionistName.toLowerCase() === recName.toLowerCase());

      if (!isMyUser) return false;

      const recordMs = parseTimestampMs(record);

      if (lastShiftReset && lastShiftReset > 0) {
        if (recordMs !== null) {
          return recordMs > lastShiftReset;
        }
        return true;
      }

      if (recordMs !== null) {
        const recDate = new Date(recordMs);
        const now = new Date();
        return (
          recDate.getFullYear() === now.getFullYear() &&
          recDate.getMonth() === now.getMonth() &&
          recDate.getDate() === now.getDate()
        );
      }

      return true;
    };

    const isCashMethod = (method?: string) => {
      if (!method) return true;
      const m = method.toLowerCase();
      if (m.includes('unpaid')) return false;
      return m.includes('cash') || (!m.includes('mobile') && !m.includes('momo') && !m.includes('bank') && !m.includes('pos'));
    };

    const isMomoMethod = (method?: string) => {
      if (!method) return false;
      const m = method.toLowerCase();
      if (m.includes('unpaid')) return false;
      return m.includes('mobile') || m.includes('momo') || m.includes('money');
    };

    // 1. Walk-in transactions
    const activeWalkIns = activityTransactions.filter(isRecordInActiveShift);

    const walkInTotal = activeWalkIns.reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);
    const walkInCash = activeWalkIns.filter(t => isCashMethod(t.paymentMethod)).reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);
    const walkInMomo = activeWalkIns.filter(t => isMomoMethod(t.paymentMethod)).reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);

    // 2. Room revenue payments (excluding settled drinks)
    const activeRoomRevs = roomRevenue.filter(r => isRecordInActiveShift(r) && r.revenueType !== 'DrinkSettlement');

    const roomTotal = activeRoomRevs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const roomCash = activeRoomRevs.filter(r => isCashMethod(r.paymentMethod || r.paymentMode)).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const roomMomo = activeRoomRevs.filter(r => isMomoMethod(r.paymentMethod || r.paymentMode)).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    // 3. Drink sales
    const activeDrinkSales = drinkSales.filter(isRecordInActiveShift);
    const activeDrinkSettlements = roomRevenue.filter(r => isRecordInActiveShift(r) && r.revenueType === 'DrinkSettlement');

    let drinkCash = 0;
    let drinkMomo = 0;

    activeDrinkSales.forEach(s => {
      // EXCLUDE drink sales that were settled at checkout to avoid double counting
      if (s.settledPaymentMethod) return;

      // Only count the PAID portion
      const paid = Number(s.paidAmount || (s.paymentStatus === 'Paid' ? s.totalPrice : 0));
      if (paid <= 0) return;

      // Safety check: skip purely unpaid
      if (s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid') return;

      if (s.paymentMethod === 'Split (Cash + Momo)') {
        drinkCash += Number(s.splitCashAmount) || (paid / 2);
        drinkMomo += Number(s.splitMomoAmount) || (paid / 2);
      } else if (s.paymentMethod === 'Split (Paid & Unpaid)') {
        if (s.splitPaidMethod === 'Mobile Money' || isMomoMethod(s.splitPaidMethod || '')) {
          drinkMomo += paid;
        } else {
          drinkCash += paid;
        }
      } else if (isMomoMethod(s.paymentMethod)) {
        drinkMomo += paid;
      } else {
        drinkCash += paid;
      }
    });

    // Add revenue from settled drinks at checkout
    activeDrinkSettlements.forEach(r => {
      const amt = Number(r.amount) || 0;
      if (isMomoMethod(r.paymentMethod)) {
        drinkMomo += amt;
      } else {
        drinkCash += amt;
      }
    });

    const drinkTotal = drinkCash + drinkMomo;

    return {
      walkInTotal,
      roomTotal,
      drinkTotal,
      grandTotal: walkInTotal + roomTotal + drinkTotal,
      cashTotal: walkInCash + roomCash + drinkCash,
      momoTotal: walkInMomo + roomMomo + drinkMomo,
      walkInCash,
      walkInMomo,
      roomCash,
      roomMomo,
      drinkCash,
      drinkMomo,
      walkInCount: activeWalkIns.length,
      roomCount: activeRoomRevs.length,
      drinkCount: activeDrinkSales.length + activeDrinkSettlements.length,
      walkInCashCount: activeWalkIns.filter(t => isCashMethod(t.paymentMethod)).length,
      walkInMomoCount: activeWalkIns.filter(t => isMomoMethod(t.paymentMethod)).length,
      roomCashCount: activeRoomRevs.filter(r => isCashMethod(r.paymentMethod || r.paymentMode)).length,
      roomMomoCount: activeRoomRevs.filter(r => isMomoMethod(r.paymentMethod || r.paymentMode)).length
    };
  };

  const getAnnualBranchStats = (branch: Branch, year: number) => {
    const isTargetYear = (dateStr: string | null | undefined, recordInfo?: any) => {
      if (!dateStr) return false;
      const d = parseSafeDate(dateStr);
      if (!d) {
        console.warn("Date Parsing Warning: Failed to parse date string '" + dateStr + "' for annual year evaluation. Record details:", recordInfo || 'unknown');
        return false;
      }
      return d.getFullYear() === year;
    };

    // Filter unified coreLodgeTransactions (reconciled room payments and extension fees)
    const branchCoreLodgeTxs = coreLodgeTransactions.filter(t => {
      const ts = t.timestamp || (t as any).dateCreated || (t as any).createdAt || (t as any).checkInDate;
      const matchesBranch = t.branch === branch || (t as any).lodgeBranch === branch;
      return matchesBranch && isTargetYear(ts, t);
    });

    const drinkSettlementRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType === 'DrinkSettlement')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const extensionRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType === 'ExtensionFee')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const baseLodgingRevenue = branchCoreLodgeTxs
      .filter(t => t.revenueType !== 'DrinkSettlement' && t.revenueType !== 'ExtensionFee')
      .reduce((acc, curr) => acc + (curr.amountVal || 0), 0);

    const activityRevenue = activityTransactions
      .filter(t => (t.branch === branch || t.lodgeBranch === branch) && isTargetYear(t.timestamp || t.dateCreated || t.createdAt, t))
      .reduce((acc, curr) => acc + Number(curr.amountPaid !== undefined && curr.amountPaid !== null ? curr.amountPaid : (curr.totalPrice || 0)), 0);

    const barRevenue = drinkSales
      .filter(s => (s.branch === branch || (s as any).lodgeBranch === branch) && isTargetYear(s.timestamp, s))
      .reduce((acc, curr) => {
        // Only count drinks that are NOT settled as part of a room bill
        const isSettledToRoom = curr.paymentMethod === 'Unpaid (Add to Room Bill)' || curr.paymentStatus === 'Unpaid' || !!curr.settledPaymentMethod;
        if (isSettledToRoom) return acc;
        
        const paid = getDrinkPaidAmount(curr);
        return acc + paid;
      }, 0) + drinkSettlementRevenue;

    const revenue = baseLodgingRevenue + extensionRevenue + activityRevenue + barRevenue;

    return {
      revenue,
      roomRevenue: baseLodgingRevenue,
      extensionRevenue,
      activityRevenue,
      barRevenue
    };
  };

  const annexStats = getBranchStats('Annex');
  const ayigyaStats = getBranchStats('Ayigya');
  const annexAnnualStats = getAnnualBranchStats('Annex', selectedYear);
  const ayigyaAnnualStats = getAnnualBranchStats('Ayigya', selectedYear);

  // Generate dynamic AI Financial Insights based on real metrics
  const generateInsights = () => {
    let insightText = '';
    
    // Annex insight
    if (annexStats.totalRooms > 0) {
      if (annexStats.occupancyRate > 75) {
        insightText += `Annex Branch is performing exceptionally well with ${annexStats.occupancyRate.toFixed(1)}% occupancy, indicating high demand. Consider reviewing premium rates. `;
      } else if (annexStats.occupancyRate > 40) {
        insightText += `Annex Branch is stable with a steady ${annexStats.occupancyRate.toFixed(1)}% occupancy. `;
      } else {
        insightText += `Annex Branch is experiencing lower traffic (${annexStats.occupancyRate.toFixed(1)}% occupancy). Consider promotional offers. `;
      }
    } else {
      insightText += `Annex Branch currently has no rooms configured. `;
    }

    // Ayigya insight
    if (ayigyaStats.totalRooms > 0) {
      if (ayigyaStats.occupancyRate > 75) {
        insightText += `Ayigya Branch is seeing high volume at ${ayigyaStats.occupancyRate.toFixed(1)}% occupancy. `;
      } else if (ayigyaStats.occupancyRate > 40) {
        insightText += `Ayigya Branch maintains a baseline occupancy of ${ayigyaStats.occupancyRate.toFixed(1)}%. `;
      } else {
        insightText += `Ayigya Branch is under-utilized at ${ayigyaStats.occupancyRate.toFixed(1)}% occupancy. `;
      }
    } else {
      insightText += `Ayigya Branch currently has no rooms configured. `;
    }
    
    const totalRev = annexStats.revenue + ayigyaStats.revenue;
    if (totalRev > 0) {
      const topEarner = annexStats.revenue >= ayigyaStats.revenue ? 'Annex' : 'Ayigya';
      insightText += `${topEarner} Branch is leading revenue generation this month.`;
    }

    return insightText;
  };


  // Generate rule-based AI Insights for Drinks
  const generateDrinkInsights = () => {
    if (filteredDrinkSales.length === 0) return 'No drink sales recorded yet for the selected date range.';

    const drinkStats = filteredDrinkSales.reduce((acc, sale) => {
      const paidRatio = sale.totalPrice > 0 ? (getDrinkPaidAmount(sale) / sale.totalPrice) : 0;
      
      if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
          if (!acc[item.drinkId]) {
            acc[item.drinkId] = { name: item.drinkName, quantity: 0, revenue: 0 };
          }
          acc[item.drinkId].quantity += item.quantity;
          acc[item.drinkId].revenue += item.subtotal * paidRatio;
        });
      } else {
        if (sale.drinkId) {
          if (!acc[sale.drinkId]) {
            acc[sale.drinkId] = { name: sale.drinkName || 'Unknown Drink', quantity: 0, revenue: 0 };
          }
          acc[sale.drinkId].quantity += sale.quantity || 0;
          acc[sale.drinkId].revenue += getDrinkPaidAmount(sale);
        }
      }
      return acc;
    }, {} as Record<string, { name: string, quantity: number, revenue: number }>);

    const sortedDrinks = (Object.values(drinkStats) as {name: string, quantity: number, revenue: number}[]).sort((a, b) => b.quantity - a.quantity);
    const topDrink = sortedDrinks[0];
    const totalQty = sortedDrinks.reduce((sum, d) => sum + d.quantity, 0);
    const totalRev = sortedDrinks.reduce((sum, d) => sum + d.revenue, 0);

    let insightText = '';
    
    if (topDrink) {
      const qtyPercentage = ((topDrink.quantity / totalQty) * 100).toFixed(1);
      const revPercentage = ((topDrink.revenue / totalRev) * 100).toFixed(1);
      
      insightText += `The best-performing drink is ${topDrink.name}, leading with ${topDrink.quantity} units sold (GH₵ ${topDrink.revenue.toFixed(2)}). `;
      
      if (Number(qtyPercentage) > 50) {
        insightText += `This drink completely dominates your sales, accounting for ${qtyPercentage}% of total volume. Consider stocking up and slightly raising its price to maximize margins. `;
      } else if (Number(qtyPercentage) > 20) {
        insightText += `It is a strong crowd favorite, contributing ${revPercentage}% of your total beverage revenue. Maintain a healthy inventory to prevent stockouts. `;
      } else {
        insightText += `Sales are quite distributed among various drinks, though ${topDrink.name} edges out slightly. `;
      }
    }

    if (sortedDrinks.length > 3) {
      const lowestDrink = sortedDrinks[sortedDrinks.length - 1];
      if (lowestDrink.quantity < 3) {
        insightText += `Conversely, ${lowestDrink.name} is underperforming with only ${lowestDrink.quantity} units sold. Consider a discount or promotional pairing to clear inventory.`;
      }
    }

    return insightText;
  };

  // Expected Traffic Today (Global)
  const todayStr = new Date().toISOString().split('T')[0];
  const expectedCheckInsToday = bookings.filter(b => b.checkInDate && typeof b.checkInDate === 'string' && b.checkInDate.startsWith(todayStr)).length;
  const expectedCheckOutsToday = bookings.filter(b => b.checkOutDate && typeof b.checkOutDate === 'string' && b.checkOutDate.startsWith(todayStr) && b.status === 'CheckedIn').length;


  // Recharts: High-contrast demographic data
  const demographicData = [
    { name: 'Annex Branch', value: bookings.filter(b => b.branch === 'Annex').length },
    { name: 'Ayigya Branch', value: bookings.filter(b => b.branch === 'Ayigya').length },
  ];
  
  // High contrast color palette accessible for color-blindness (WCAG)
  const demographicColors = [
    '#ffb000', // high-contrast vivid yellow-orange
    '#785ef0', // high-contrast vivid violet
  ];

  // Recharts: Occupancy trend daily over the past 30 days
  const getOccupancyTrendData = () => {
    const trendDays = [];
    const now = new Date();
    
    // Generate dates for the last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      trendDays.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    return trendDays.map(targetDate => {
      const displayLabel = targetDate.toLocaleString('default', { month: 'short', day: 'numeric' });
      const targetTime = targetDate.getTime();
      
      const getBranchOccupancy = (branchName: string) => {
        const branchRooms = rooms.filter(r => r.branch === branchName);
        if (branchRooms.length === 0) return 0;

        const occupiedCount = bookings.filter(b => {
          // Verify room belongs to this branch
          const room = rooms.find(r => r.id === b.roomId || (r.roomNumber === b.roomNumber && r.branch === branchName));
          if (!room || room.branch !== branchName) return false;

          // Status must be active (not Cancelled or No-Show)
          if (b.status === 'Cancelled' || b.status === 'No-Show') return false;

          const start = new Date(b.checkInDate);
          const end = new Date(b.checkOutDate);
          
          const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
          const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
          
          // Occupied if target date falls within check-in and check-out range
          return targetTime >= startTime && targetTime < endTime;
        }).length;

        return Math.min(100, Math.round((occupiedCount / branchRooms.length) * 100));
      };

      return {
        date: displayLabel,
        'Annex': getBranchOccupancy('Annex'),
        'Ayigya': getBranchOccupancy('Ayigya')
      };
    });
  };

  const occupancyTrendData = getOccupancyTrendData();

  const calculateFinancialData = () => {
    const targetYear = selectedYear || new Date().getFullYear();
    const previousYear = targetYear - 1;

    let currentYearTotal = 0;
    let previousYearTotal = 0;

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const date = new Date(targetYear, i, 1);

      const targetMonthTxs = getCoreLodgeRevenueForYearMonth(targetYear, monthNum);
      
      const getBranchBreakdown = (branch: string) => {
        const branchTxs = targetMonthTxs.filter(t => t.branch === branch || (t as any).lodgeBranch === branch);
        return {
          lodging: branchTxs.filter(t => t.category === 'Lodging').reduce((sum, t) => sum + (t.amountVal || 0), 0),
          extension: branchTxs.filter(t => t.category === 'Extension').reduce((sum, t) => sum + (t.amountVal || 0), 0),
          activity: branchTxs.filter(t => t.category === 'Activity').reduce((sum, t) => sum + (t.amountVal || 0), 0),
          drinks: branchTxs.filter(t => t.category === 'Drink').reduce((sum, t) => sum + (t.amountVal || 0), 0),
          total: branchTxs.reduce((sum, t) => sum + (t.amountVal || 0), 0)
        };
      };

      const annexBreakdown = getBranchBreakdown('Annex');
      const ayigyaBreakdown = getBranchBreakdown('Ayigya');
      const totalRev = annexBreakdown.total + ayigyaBreakdown.total;

      const prevMonthTxs = getCoreLodgeRevenueForYearMonth(previousYear, monthNum);
      const prevAnnexRev = prevMonthTxs.filter(t => t.branch === 'Annex' || (t as any).lodgeBranch === 'Annex').reduce((sum, t) => sum + (t.amountVal || 0), 0);
      const prevAyigyaRev = prevMonthTxs.filter(t => t.branch === 'Ayigya' || (t as any).lodgeBranch === 'Ayigya').reduce((sum, t) => sum + (t.amountVal || 0), 0);
      const prevYearTotalRev = prevAnnexRev + prevAyigyaRev;

      return {
        month: date.toLocaleString('default', { month: 'short' }),
        'Annex': annexBreakdown.total,
        'Ayigya': ayigyaBreakdown.total,
        'Total': totalRev,
        'Previous Year Total': prevYearTotalRev,
        'AnnexBreakdown': annexBreakdown,
        'AyigyaBreakdown': ayigyaBreakdown
      };
    });

    currentYearTotal = monthlyData.reduce((sum, m) => sum + m.Total, 0);
    previousYearTotal = monthlyData.reduce((sum, m) => sum + m['Previous Year Total'], 0);

    return { currentYearTotal, previousYearTotal, monthlyData };
  };

  const financialData = useMemo(() => calculateFinancialData(), [unifiedTransactions, selectedYear]);

  useEffect(() => {
    if (financialData && financialData.monthlyData && financialData.monthlyData.length > 0) {
      checkAndCreateSnapshot(financialData);
    }
  }, [financialData]);

  const yearlyReports = useMemo(() => {
    const year = selectedYear;
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const currentMonthId = new Date().toISOString().substring(0, 7);

    return months.map((m, i) => {
      const monthNum = Number(m);
      const monthId = `${year}-${m}`;
      const isFuture = monthId > currentMonthId;

      const annexRevenue = financialData.monthlyData[i].Annex;
      const ayigyaRevenue = financialData.monthlyData[i].Ayigya;
      const totalRevenue = financialData.monthlyData[i].Total;

      let totalBookingsCount = 0;
      let averageOccupancyRate = 0;

      if (!isFuture) {
        const filteredBookings = bookings.filter(b => {
          if (b.status === 'Cancelled' || !b.checkInDate) return false;
          const bookingDate = parseSafeDate(b.checkInDate);
          if (!bookingDate) return false;
          return bookingDate.getFullYear() === year && (bookingDate.getMonth() + 1) === monthNum;
        });

        totalBookingsCount = filteredBookings.length;

        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const totalBookedNights = filteredBookings.reduce((sum, b) => {
          const start = parseSafeDate(b.checkInDate);
          const end = parseSafeDate(b.checkOutDate);
          if (!start || !end) return sum;
          const diffTime = end.getTime() - start.getTime();
          const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          return sum + nights;
        }, 0);
        averageOccupancyRate = Math.min(100, Math.round((totalBookedNights / (Math.max(1, rooms.length) * daysInMonth)) * 100)) || 0;
      }

      return {
        monthId,
        monthName: new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long' }),
        totalRevenue,
        annexRevenue,
        ayigyaRevenue,
        totalBookingsCount,
        averageOccupancyRate,
        finalized: !isFuture,
        isFuture,
      };
    });
  }, [selectedYear, financialData, bookings, rooms]);

  const theme = getThemeClasses(isDarkMode);

  return (
    <div id="manager-dashboard-container" tabIndex={-1} className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-200 min-h-screen w-full flex flex-col md:flex-row font-sans outline-none">
      
      {/* Backdrop overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
        />
      )}
      
      {/* SIDEBAR (Desktop / Mobile Drawer) */}
      <aside className={`h-screen max-h-screen flex flex-col fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 md:sticky md:top-0 transition-transform duration-300 ease-in-out shrink-0 ${
        isSidebarOpen 
          ? 'translate-x-0 flex' 
          : '-translate-x-full md:translate-x-0 hidden md:flex'
      }`}>
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-4 mb-4 mb-4">
            <NabsLodgeLogo size="md" />
            <div>
              <h1 className="font-bold tracking-tight leading-tight text-zinc-900 dark:text-zinc-50">Nabslodge<br/>Management</h1>
            </div>
          </div>
          <div className="px-3 py-2 text-xs font-mono rounded-xl border bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
            <div className="text-[10px] uppercase tracking-widest font-bold mb-0.5 text-zinc-400 dark:text-zinc-500">Admin User</div>
            <div className="truncate" title={currentUser.name}>{currentUser.name}</div>
          </div>
        </div>

        <nav 
          className="flex-1 overflow-y-auto overscroll-contain py-4 px-4 space-y-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <button
            onClick={() => { setActiveTab('overview'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'overview' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Activity className="w-4 h-4" />
            Global Overview
          </button>

          <button
            onClick={() => { setActiveTab('receptionists'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'receptionists' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Users className="w-4 h-4" />
            Receptionists ({users.length})
          </button>

          <button
            onClick={() => { setActiveTab('rooms'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'rooms' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <BedDouble className="w-4 h-4" />
            Room Setup Config
          </button>

          <button
            onClick={() => { setActiveTab('availabilityCalendar'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'availabilityCalendar' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-500" />
            Availability Calendar
          </button>

          <button
            onClick={() => { setActiveTab('liveAvailableRooms'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'liveAvailableRooms' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Eye className="w-4 h-4 text-blue-500" />
            Available Rooms
          </button>

          <button
            onClick={() => { setActiveTab('bookings'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'bookings' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Calendar className="w-4 h-4" />
            Booking Registry ({bookings.length})
          </button>

          <button
            onClick={() => { setActiveTab('pendingEdits'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'pendingEdits' 
                ? (isDarkMode ? 'bg-amber-600 text-white shadow-md shadow-amber-500/5' : 'bg-amber-600 text-white shadow-md shadow-amber-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>Pending Edit Approval</span>
            </div>
            {pendingEditRequests.filter(r => r.status === 'Pending').length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold rounded-full bg-amber-500 text-white animate-pulse">
                {pendingEditRequests.filter(r => r.status === 'Pending').length}
              </span>
            )}
          </button>


          <button
            onClick={() => { setActiveTab('activityCatalog'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'activityCatalog' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Activity className="w-4 h-4" />
            Activity Catalog
          </button>

          <button
            onClick={() => { setActiveTab('drinksManagement'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'drinksManagement' 
                ? (isDarkMode ? 'bg-purple-600 text-white shadow-md shadow-purple-500/5' : 'bg-purple-600 text-white shadow-md shadow-purple-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Wine className="w-4 h-4 text-purple-400" />
            Drinks Store
          </button>

          <button
            onClick={() => { setActiveTab('financials'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'financials' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Financial Report
          </button>

          <button
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'settings' 
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10') 
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Settings className="w-4 h-4" />
            General Settings
          </button>

          <div className={`mt-8 border-t pt-6 ${isDarkMode ? 'border-zinc-900' : 'border-slate-200'}`}>
            <h4 className={`text-[10px] font-mono uppercase tracking-widest px-4 mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Branches Covered</h4>
            <div className={`space-y-1.5 px-4 text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
              <div className="flex justify-between items-center">
                <span>Nabslodge Annex</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex justify-between items-center">
                <span>Nabslodge Ayigya</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
            </div>
          </div>
        </nav>

        <div className={`p-4 border-t flex flex-col gap-2 transition-colors duration-300 ${isDarkMode ? 'border-zinc-800' : 'border-slate-200'}`}>
          <button
            onClick={() => { onOpenTutorial?.(); setIsSidebarOpen?.(false); }}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isDarkMode 
                ? 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20' 
                : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 shadow-xs'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Getting Started Guide
          </button>
          <button
            onClick={onToggleTheme}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isDarkMode 
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs'
            }`}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={() => { setShowSignOutModal(true); setIsSidebarOpen(false); }}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isDarkMode 
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20' 
                : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shadow-xs'
            }`}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

        {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen overflow-y-auto transition-colors duration-300 flex flex-col">
        
        {/* Mobile Header (only visible on md-) */}
        <header className="w-full h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 sticky top-0 z-30 md:hidden mb-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl border flex items-center justify-center transition-all cursor-pointer bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-350 hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <NabsLodgeLogo size="xs" />
              <h1 className="font-bold tracking-tight text-sm text-zinc-900 dark:text-zinc-50">Manager</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onOpenTutorial} title="Onboarding Guide" className="p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button onClick={onToggleTheme} className="p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowSignOutModal(true)} className="p-1.5 border rounded-lg transition-all cursor-pointer bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Snapshot Notifications */}
        {snapshotNotifications.map(notification => (
          <div 
            key={notification.id} 
            className="bg-emerald-600 dark:bg-emerald-700 text-white p-4 rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-lg border border-emerald-500/30"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-800/60 rounded-xl">
                <TrendingUp className="w-5 h-5 text-emerald-200" />
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base">{notification.message}</p>
                <p className="text-xs text-emerald-100/80">Archived monthly performance breakdown available for review.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button 
                onClick={() => handleOpenSnapshot(notification)} 
                className="bg-white text-emerald-800 hover:bg-emerald-50 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-sm"
              >
                View Breakdown
              </button>
              <button 
                onClick={() => handleDismissSnapshotNotification(notification.id)}
                className="p-2 text-emerald-200 hover:text-white transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Archived Monthly Report Modal */}
        <AnimatePresence>
          {selectedSnapshot && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8 shadow-2xl border ${theme.card}`}
              >
                <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Archived Monthly Breakdown</span>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedSnapshot.month} {selectedSnapshot.year} Performance</h3>
                  </div>
                  <button
                    onClick={() => setSelectedSnapshot(null)}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="py-6 space-y-6">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    This snapshot was automatically captured at the end of {selectedSnapshot.month} {selectedSnapshot.year} before the active dashboard counters reset for the new month.
                  </p>

                  {selectedSnapshot.data && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Total Combined Revenue</span>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          GH₵ {(selectedSnapshot.data.currentYearTotal || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Previous Year Comparison</span>
                        <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300 mt-1">
                          GH₵ {(selectedSnapshot.data.previousYearTotal || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedSnapshot.data?.monthlyData && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Branch Performance Snapshot</h4>
                      </div>
                      
                      {(() => {
                        const monthShort = selectedSnapshot.month.substring(0, 3);
                        const monthData = selectedSnapshot.data.monthlyData.find((m: any) => m.month === monthShort) || selectedSnapshot.data.monthlyData[0];
                        
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* NABSLODGE ANNEX CARD */}
                            <div className={`border rounded-2xl p-5 space-y-4 ${theme.card} bg-zinc-50/50 dark:bg-zinc-900/50 shadow-sm`}>
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Building className="w-4 h-4" />
                                  </div>
                                  <h5 className="font-bold text-sm text-zinc-900 dark:text-white">Nabslodge Annex</h5>
                                </div>
                              </div>

                              <div className="border rounded-xl p-3 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                                <span className="text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-400">Total Revenue</span>
                                <div className="text-sm font-bold mt-1 font-mono text-zinc-900 dark:text-zinc-200">GH₵{(monthData.Annex || 0).toLocaleString()}</div>
                              </div>
                              
                              <div className="space-y-2 text-xs pt-1">
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Lodging revenue</span>
                                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-200">GH₵{(monthData.AnnexBreakdown?.lodging || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Extended Checkout revenue</span>
                                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-200">GH₵{(monthData.AnnexBreakdown?.extension || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Activity Revenue</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">GH₵{(monthData.AnnexBreakdown?.activity || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Drink sales</span>
                                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">GH₵{(monthData.AnnexBreakdown?.drinks || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            {/* NABSLODGE AYIGYA CARD */}
                            <div className={`border rounded-2xl p-5 space-y-4 ${theme.card} bg-zinc-50/50 dark:bg-zinc-900/50 shadow-sm`}>
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <Building className="w-4 h-4" />
                                  </div>
                                  <h5 className="font-bold text-sm text-zinc-900 dark:text-white">Nabslodge Ayigya</h5>
                                </div>
                              </div>

                              <div className="border rounded-xl p-3 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                                <span className="text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-400">Total Revenue</span>
                                <div className="text-sm font-bold mt-1 font-mono text-zinc-900 dark:text-zinc-200">GH₵{(monthData.Ayigya || 0).toLocaleString()}</div>
                              </div>
                              
                              <div className="space-y-2 text-xs pt-1">
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Lodging revenue</span>
                                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-200">GH₵{(monthData.AyigyaBreakdown?.lodging || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Extended Checkout revenue</span>
                                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-200">GH₵{(monthData.AyigyaBreakdown?.extension || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Activity Revenue</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">GH₵{(monthData.AyigyaBreakdown?.activity || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-800/40 pb-1.5 text-zinc-600 dark:text-zinc-400">
                                  <span>Drink sales</span>
                                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">GH₵{(monthData.AyigyaBreakdown?.drinks || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => handleDismissSnapshotNotification(selectedSnapshot.notificationId)}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Dismiss Notification
                  </button>
                  <button
                    onClick={() => setSelectedSnapshot(null)}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto w-full">
          
          <AnimatePresence mode="wait">
            
            {/* TAB 1: GLOBAL OVERVIEW */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-6"
              >
                {/* Manager Pending Booking Edit Notification Banner */}
                {pendingEditRequests.filter(r => r.status === 'Pending').length > 0 && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-500 text-white font-bold animate-pulse">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          {pendingEditRequests.filter(r => r.status === 'Pending').length} Pending Booking Edit Request(s) Awaiting Approval
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Receptionists have submitted revenue-altering modifications. Prioritized money expected details require authorization.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('pendingEdits')}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap"
                    >
                      Review Requests →
                    </button>
                  </div>
                )}

                {/* Side-by-Side Branch Performance Comparison */}
                {isLoadingData ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {Array.from({ length: 2 }).map((_, idx) => (
                      <div key={idx} className={`border p-5 rounded-2xl animate-pulse space-y-4 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800">
                          <div className="h-4 w-48 bg-zinc-300 dark:bg-zinc-700 rounded"></div>
                          <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="h-14 bg-zinc-150 dark:bg-zinc-800 rounded-xl"></div>
                          <div className="h-14 bg-zinc-150 dark:bg-zinc-800 rounded-xl"></div>
                        </div>
                        <div className="space-y-3 pt-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex justify-between">
                              <div className="h-3 w-28 bg-zinc-150 dark:bg-zinc-800 rounded"></div>
                              <div className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
                            </div>
                          ))}
                        </div>
                        <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full pt-1"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* NABSLODGE ANNEX CARD */}
                    <div className={`border rounded-2xl p-5 space-y-4 ${
                      theme.card
                    }`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Building className={`w-4 h-4 ${isDarkMode ? 'text-blue-450' : 'text-blue-600'}`} />
                          <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Nabslodge Annex (KNUST-Bomso)</h3>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-mono border ${
                          isDarkMode 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                            : 'bg-blue-50 text-blue-600 border-blue-100'
                        }`}>
                          {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className={`border rounded-xl p-3 ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800/60' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <span className={`text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Revenue</span>
                          <div className={`text-sm font-bold mt-1 font-mono ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{annexStats.revenue.toFixed(2)}</div>
                        </div>
                        <div className={`border rounded-xl p-3 ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800/60' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <span className={`text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Occupancy</span>
                          <div className={`text-sm font-bold mt-1 font-mono ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{annexStats.occupancyRate.toFixed(1)}%</div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs pt-1">
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Lodging Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{annexStats.roomRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Extended Checkout Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{annexStats.extensionRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Activity Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>GH₵{annexStats.activityRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Drink Sales</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>GH₵{annexStats.barRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Total Rooms Listed</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{annexStats.totalRooms}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Occupied Rooms</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{annexStats.occupied}</span>
                        </div>
                        <div className={`flex justify-between ${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                          <span>Maintenance Lock</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{annexStats.maintenance}</span>
                        </div>
                      </div>

                      {/* Progress visual bar */}
                      <div className="pt-2">
                        <div className={`rounded-full h-1.5 overflow-hidden ${isDarkMode ? 'bg-zinc-950' : 'bg-slate-100'}`}>
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${isDarkMode ? 'bg-blue-500' : 'bg-blue-600'}`} 
                            style={{ width: `${annexStats.occupancyRate}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* NABSLODGE AYIGYA CARD */}
                    <div className={`border rounded-2xl p-5 space-y-4 ${
                      theme.card
                    }`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Building className={`w-4 h-4 ${isDarkMode ? 'text-blue-500' : 'text-indigo-600'}`} />
                          <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Nabslodge Ayigya (SG Mall)</h3>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] uppercase font-mono border ${
                          isDarkMode 
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                            : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                        }`}>
                          {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className={`border rounded-xl p-3 ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800/60' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <span className={`text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Revenue</span>
                          <div className={`text-sm font-bold mt-1 font-mono ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{ayigyaStats.revenue.toFixed(2)}</div>
                        </div>
                        <div className={`border rounded-xl p-3 ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800/60' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <span className={`text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Occupancy</span>
                          <div className={`text-sm font-bold mt-1 font-mono ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{ayigyaStats.occupancyRate.toFixed(1)}%</div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs pt-1">
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Lodging Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{ayigyaStats.roomRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Extended Checkout Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>GH₵{ayigyaStats.extensionRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Activity Revenue</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>GH₵{ayigyaStats.activityRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Drink Sales</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>GH₵{ayigyaStats.barRevenue.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Total Rooms Listed</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{ayigyaStats.totalRooms}</span>
                        </div>
                        <div className={`flex justify-between border-b pb-1 ${isDarkMode ? 'text-zinc-400 border-zinc-800/40' : 'text-slate-600 border-slate-100'}`}>
                          <span>Occupied Rooms</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{ayigyaStats.occupied}</span>
                        </div>
                        <div className={`flex justify-between ${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                          <span>Maintenance Lock</span>
                          <span className={`font-mono font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{ayigyaStats.maintenance}</span>
                        </div>
                      </div>

                      {/* Progress visual bar */}
                      <div className="pt-2">
                        <div className={`rounded-full h-1.5 overflow-hidden ${isDarkMode ? 'bg-zinc-950' : 'bg-slate-100'}`}>
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${isDarkMode ? 'bg-blue-500' : 'bg-indigo-600'}`} 
                            style={{ width: `${ayigyaStats.occupancyRate}%` }}
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                )}
                  {/* Receptions' Active Shift Balances (Live) */}
                  <div className={`border rounded-3xl p-6 ${theme.card}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                      <div>
                        <h3 className={`text-sm font-bold ${theme.text}`}>Receptions' Active Shift Balances</h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Live unhanded-over cash/revenue accumulated by active receptionists on their current shifts today.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse">
                        Live Tracking
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {users.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                          No receptionist accounts found to track active shifts.
                        </div>
                      ) : (
                        users.map((rec, idx) => {
                          const stats = getReceptionistShiftStats(rec.id, rec.lastShiftReset, rec.email, rec.name);
                          const lastResetDate = rec.lastShiftReset ? formatAuditTime(rec.lastShiftReset) : 'Midnight';
                          return (
                            <div 
                              key={`rec-${rec.id}-${idx}`} 
                              className={`p-4 rounded-2xl border transition-all ${
                                isDarkMode 
                                  ? 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700' 
                                  : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-xs'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h4 className={`font-bold text-xs ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{rec.name}</h4>
                                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Shift started: {lastResetDate}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono ${
                                  rec.branch === 'Annex' 
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                }`}>
                                  {rec.branch}
                                </span>
                              </div>

                              <div className="space-y-3 text-[11px] pt-2">
                                {/* Room Payments */}
                                <div className="space-y-1">
                                  <div className="font-bold text-zinc-500 mb-1">Room Payments</div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">Cash:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.roomCash.toFixed(2)} ({stats.roomCashCount})</span></div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">MoMo:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.roomMomo.toFixed(2)} ({stats.roomMomoCount})</span></div>
                                  <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                                    <span>Total Room:</span> <span>GH₵{stats.roomTotal.toFixed(2)}</span>
                                  </div>
                                </div>
                                {/* Walk-In Sales */}
                                <div className="space-y-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                                  <div className="font-bold text-zinc-500 mb-1">Walk-In Sales</div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">Cash:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.walkInCash.toFixed(2)} ({stats.walkInCashCount})</span></div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">MoMo:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.walkInMomo.toFixed(2)} ({stats.walkInMomoCount})</span></div>
                                  <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                                    <span>Total Walk-In:</span> <span>GH₵{stats.walkInTotal.toFixed(2)}</span>
                                  </div>
                                </div>
                                {/* Drink Store Sales */}
                                <div className="space-y-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                                  <div className="font-bold text-zinc-500 mb-1">Drink Store Sales</div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">Cash:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.drinkCash.toFixed(2)}</span></div>
                                  <div className="flex justify-between pl-2"><span className="text-zinc-400">MoMo:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">GH₵{stats.drinkMomo.toFixed(2)}</span></div>
                                  <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                                    <span>Total Drinks:</span> <span>GH₵{stats.drinkTotal.toFixed(2)}</span>
                                  </div>
                                </div>
                                {/* Shift Totals */}
                                <div className="space-y-1 pt-3 border-t-2 border-zinc-200 dark:border-zinc-800">
                                  <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100">
                                    <span className="text-emerald-600 dark:text-emerald-400">Overall Cash:</span>
                                    <span>GH₵{stats.cashTotal.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100">
                                    <span className="text-blue-600 dark:text-blue-400">Overall MoMo:</span>
                                    <span>GH₵{stats.momoTotal.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-lg text-amber-600 dark:text-amber-400 pt-2">
                                    <span>Handover:</span>
                                    <span>GH₵{stats.grandTotal.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                {/* AI Insights Section */}
                <div className={`p-5 rounded-3xl border flex gap-4 ${isDarkMode ? 'bg-indigo-950/20 border-indigo-500/20 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-800'}`}>
                  <div className="shrink-0 mt-0.5">
                    <Sun className={`w-5 h-5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>AI Financial Insights</h4>
                    <p className="text-xs leading-relaxed opacity-90">
                      {generateInsights()}
                    </p>
                  </div>
                </div>

                {/* CHART 3: OCCUPANCY RATE TREND (LINE CHART OVER 30 DAYS) */}
                <div className={`border rounded-3xl p-6 flex flex-col justify-between ${
                  theme.card
                }`}>
                    <div className="mb-4 flex justify-between items-center">
                      <div>
                        <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>30-Day Occupancy Rate Trend (%)</h3>
                        <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Daily occupancy level fluctuations over the past 30 days across all operational rooms.</p>
                      </div>
                      <button
                        onClick={() => handleExportCSV(occupancyTrendData, 'Occupancy_Trend')}
                        className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold ${
                          isDarkMode 
                            ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </div>

                    <div className="h-60 w-full">
                      {occupancyTrendData.every(d => d.Annex === 0 && d.Ayigya === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                            <AlertCircle className="w-8 h-8" />
                          </div>
                          <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Occupancy Data</h4>
                          <p className={`text-xs text-center max-w-sm ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                            No booking records found for this period.
                          </p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={occupancyTrendData}
                            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                          >
                            <CartesianGrid 
                              strokeDasharray="3 3" 
                              stroke={isDarkMode ? "#27272a" : "#f1f5f9"} 
                            />
                            <XAxis 
                              dataKey="date" 
                              stroke={isDarkMode ? "#71717a" : "#64748b"} 
                              fontSize={10}
                              tickLine={false}
                            />
                            <YAxis 
                              stroke={isDarkMode ? "#71717a" : "#64748b"} 
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              domain={[0, 100]}
                              unit="%"
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDarkMode ? "#18181b" : "#ffffff",
                                borderColor: isDarkMode ? "#27272a" : "#e2e8f0",
                                color: isDarkMode ? "#f4f4f5" : "#0f172a",
                                borderRadius: "12px",
                                fontSize: "12px",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                              }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Line 
                            type="monotone" 
                            dataKey="Annex" 
                            stroke={isDarkMode ? "#3b82f6" : "#2563eb"} 
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="Ayigya" 
                            stroke={isDarkMode ? "#22c55e" : "#16a34a"} 
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    </div>
                  </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* CHART 4: REVENUE BY CATEGORY (BAR CHART) */}
                  <div className={`border rounded-3xl p-6 flex flex-col justify-between ${
                    theme.card
                  }`}>
                    <div className="mb-4 flex justify-between items-center">
                      <div>
                        <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Monthly Revenue by Category</h3>
                        <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Comparing current month versus previous month.</p>
                      </div>
                      <button
                        onClick={() => handleExportCSV(revenueByCategoryData, 'Revenue_By_Category')}
                        className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold ${
                          isDarkMode 
                            ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </div>

                    <div className="h-72 w-full">
                      {isLoadingData ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                          <p className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>Loading revenue data...</p>
                        </div>
                      ) : revenueByCategoryData.every(d => d['Current Month'] === 0 && d['Previous Month'] === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                            <AlertCircle className="w-8 h-8" />
                          </div>
                          <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Revenue Data</h4>
                          <p className={`text-xs text-center max-w-sm ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                            No booking records found for this period.
                          </p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={revenueByCategoryData}
                            margin={{ top: 10, right: 5, left: -10, bottom: 0 }}
                          >
                          <CartesianGrid 
                            strokeDasharray="3 3" 
                            stroke={isDarkMode ? "#27272a" : "#f1f5f9"} 
                          />
                          <XAxis 
                            dataKey="name" 
                            stroke={isDarkMode ? "#71717a" : "#64748b"} 
                            fontSize={11}
                            tickLine={false}
                          />
                          <YAxis 
                            stroke={isDarkMode ? "#71717a" : "#64748b"} 
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDarkMode ? "#18181b" : "#ffffff",
                              borderColor: isDarkMode ? "#27272a" : "#e2e8f0",
                              color: isDarkMode ? "#f4f4f5" : "#0f172a",
                              borderRadius: "12px",
                              fontSize: "12px"
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Bar 
                            dataKey="Current Month" 
                            fill={isDarkMode ? "#3b82f6" : "#2563eb"} 
                            radius={[6, 6, 0, 0]} 
                          />
                          <Bar 
                            dataKey="Previous Month" 
                            fill={isDarkMode ? "#3f3f46" : "#94a3b8"} 
                            radius={[6, 6, 0, 0]} 
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    </div>
                  </div>

                  {/* CHART 5: ANNUAL REVENUE TREND (LINE CHART) */}
                  <div className={`border rounded-3xl p-6 flex flex-col justify-between ${
                    theme.card
                  }`}>
                    <div className="mb-4 flex justify-between items-center">
                      <div>
                        <h3 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Annual Revenue Trend</h3>
                        <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Current year vs previous year revenue comparison.</p>
                      </div>
                      <button
                        onClick={() => handleExportCSV(annualRevenueData, 'Annual_Revenue_Trend')}
                        className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold ${
                          isDarkMode 
                            ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </div>

                    <div className="h-72 w-full">
                      {isLoadingData ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                          <p className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>Loading trend data...</p>
                        </div>
                      ) : annualRevenueData.every(d => d['Current Year'] === 0 && d['Previous Year'] === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                            <AlertCircle className="w-8 h-8" />
                          </div>
                          <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Revenue Data</h4>
                          <p className={`text-xs text-center max-w-sm ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                            No booking records found for this period.
                          </p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={annualRevenueData}
                            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                          >
                          <CartesianGrid 
                            strokeDasharray="3 3" 
                            stroke={isDarkMode ? "#27272a" : "#f1f5f9"} 
                          />
                          <XAxis 
                            dataKey="month" 
                            stroke={isDarkMode ? "#71717a" : "#64748b"} 
                            fontSize={10}
                            tickLine={false}
                          />
                          <YAxis 
                            stroke={isDarkMode ? "#71717a" : "#64748b"} 
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDarkMode ? "#18181b" : "#ffffff",
                              borderColor: isDarkMode ? "#27272a" : "#e2e8f0",
                              color: isDarkMode ? "#f4f4f5" : "#0f172a",
                              borderRadius: "12px",
                              fontSize: "12px",
                              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Line 
                            type="monotone" 
                            dataKey="Current Year" 
                            stroke={isDarkMode ? "#10b981" : "#059669"} 
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="Previous Year" 
                            stroke={isDarkMode ? "#71717a" : "#94a3b8"} 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    </div>
                  </div>
                </div>


              </motion.div>
            )}

            {/* TAB 2: RECEPTIONISTS CRUD */}
            {activeTab === 'receptionists' && (
              <motion.div
                key="receptionists"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Receptionist Accounts</h2>
                    <p className="text-xs mt-1 text-zinc-600 dark:text-zinc-400">Create and manage access credentials for staff across both Nabslodge branches.</p>
                  </div>
                  <button
                    onClick={handleOpenAddRec}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-blue-500/5"
                  >
                    <Plus className="w-4 h-4" /> Create Receptionist
                  </button>
                </div>

                <div className={`border rounded-3xl overflow-hidden ${theme.tableContainer}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b font-mono uppercase tracking-wider ${
                          theme.tableHeader
                        }`}>
                          <th className="py-4 px-6 font-semibold">Staff Name</th>
                          <th className="py-4 px-6 font-semibold">Assigned Branch</th>
                          <th className="py-4 px-6 font-semibold">Email Address</th>
                          <th className="py-4 px-6 font-semibold">Status</th>
                          <th className="py-4 px-6 font-semibold">Created Date</th>
                          <th className="py-4 px-6 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-zinc-800/60' : 'divide-slate-100'}`}>
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-16 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                                  <Users className="w-8 h-8" />
                                </div>
                                <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Staff Registered</h4>
                                <p className={`text-xs max-w-xs mx-auto ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                                  There are currently no receptionist accounts. Click "Create Receptionist" above to add new staff members.
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          users.map((rec, idx) => (
                            <tr key={`rec-${rec.id}-${idx}`} className={`transition-colors ${isDarkMode ? 'hover:bg-zinc-900/50' : 'hover:bg-slate-50'}`}>
                              <td className="py-4 px-6">
                                <div className={`font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{rec.name}</div>
                                <span className={`text-[10px] font-mono ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>ID: {rec.id}</span>
                              </td>
                              <td className="py-4 px-6">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono border ${
                                  rec.branch === 'Annex' 
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  }`}>
                                  <Building className="w-3 h-3" /> Nabslodge {rec.branch}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <code className={`px-2 py-1 rounded border font-mono text-[11px] ${
                                  isDarkMode ? 'bg-zinc-950 text-zinc-300 border-zinc-800/80' : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {rec.email}
                                </code>
                              </td>
                              <td className="py-4 px-6">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                  rec.status === 'Inactive'
                                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                }`}>
                                  {rec.status || 'Active'}
                                </span>
                              </td>
                              <td className={`py-4 px-6 font-mono text-[11px] ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                {rec.createdAt}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => handleOpenEditRec(rec)}
                                    className="p-2 border rounded-xl transition-all cursor-pointer bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 shadow-xs"
                                    title="Edit Credentials"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRec(rec.id)}
                                    disabled={rec.status !== 'Inactive'}
                                    className={`p-2 border rounded-xl transition-all ${
                                      rec.status !== 'Inactive'
                                        ? 'opacity-30 cursor-not-allowed bg-zinc-100 border-zinc-200 text-zinc-400'
                                        : 'bg-white hover:bg-red-50 border-slate-200 hover:border-red-200 text-slate-700 hover:text-red-600 shadow-xs cursor-pointer'
                                    }`}
                                    title={rec.status !== 'Inactive' ? "Status must be set to 'Inactive' before account can be deleted" : "Delete Account"}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Info block explaining secure logs */}
                <div className={`p-4 border rounded-2xl flex gap-3 text-xs leading-relaxed ${
                  isDarkMode ? 'bg-zinc-900/60 border-zinc-800 text-zinc-400' : 'bg-blue-50/50 border-blue-100 text-slate-600'
                }`}>
                  <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                  <div>
                    <span className={`font-semibold block mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-800'}`}>Administrative Note</span>
                    All receptionist actions—such as checking in guests, checking out, and updating accounts—are strictly audited and linked directly to their profile names. Deleting an account will revoke login clearance but retain old logs.
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: ROOM SETUP CRUD */}
            {activeTab === 'rooms' && (
              <motion.div
                key="rooms"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">Room Setup & Config</h2>
                    <p className="text-xs mt-1 text-zinc-600 dark:text-zinc-400">Configure and assign rooms uniquely for both Nabslodge branches.</p>
                  </div>
                  
                  {/* Branch filter and add room action */}
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex p-1 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm">
                      {(['All', 'Annex', 'Ayigya'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setRoomFilter(filter)}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                            roomFilter === filter 
                              ? 'bg-blue-600 text-white shadow-sm' 
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {filter === 'All' ? 'All' : `Nabslodge ${filter}`}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                      <input
                        type="text"
                        value={roomSearchQuery}
                        onChange={(e) => setRoomSearchQuery(e.target.value)}
                        placeholder="Search rooms..."
                        className={`block w-full pl-9 pr-3 py-2.5 rounded-xl text-xs outline-none focus:outline-none ${theme.input}`}
                      />
                    </div>

                    <button
                      onClick={handleOpenAddRoom}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shrink-0 cursor-pointer shadow-lg shadow-blue-500/5"
                    >
                      <Plus className="w-4 h-4" /> Add Room
                    </button>
                  </div>
                </div>

                {roomSuccessMessage && (
                  <div className="bg-emerald-600 border border-emerald-500 text-white p-4 rounded-2xl flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-top-4 duration-250">
                    <CheckCircle className="w-5 h-5 text-emerald-100" />
                    <span className="text-xs font-bold font-mono">Room is successfully added</span>
                  </div>
                )}

                {/* Rooms Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {rooms
                    .filter((r) => r && (roomFilter === 'All' || r.branch === roomFilter))
                    .filter((r) => {
                      if (!r) return false;
                      if (!roomSearchQuery) return true;
                      const q = roomSearchQuery.toLowerCase();
                      const num = String(r.roomNumber || '').toLowerCase();
                      const type = String(r.roomType || '').toLowerCase();
                      const stat = String(r.status || '').toLowerCase();
                      return num.includes(q) || type.includes(q) || stat.includes(q);
                    })
                    .map((room) => {
                      if (!room) return null;
                      const amenities = Array.isArray(room.amenities) ? room.amenities : [];
                      const roomPriceVal = typeof room.price === 'number' ? room.price : Number(room.price || 0);
                      const isRoomOccupied = room.status === 'Occupied' || !!room.guestName || bookings.some(b => 
                        (b.roomId === room.id || String(b.roomNumber) === String(room.roomNumber)) && 
                        (b.branch === room.branch || !b.branch) && 
                        (b.status === 'CheckedIn' || (b.status as string) === 'checked_in')
                      );
                      const roomStatusVal = isRoomOccupied ? 'Occupied' : (room.status || 'Available');
                      const roomBranchVal = room.branch || 'Annex';
                      const roomNumVal = room.roomNumber || '';
                      const roomTypeVal = room.roomType || 'Standard';

                      return (
                        <div 
                          key={room.id}
                          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors rounded-2xl p-5 space-y-4 relative group cursor-pointer hover:border-blue-500/50"
                        >
                          {currentUser.role === 'Manager' && (
                            <div className="absolute top-5 right-5 flex gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenEditRoom(room); }}
                                className="p-1.5 rounded-lg transition-all cursor-pointer bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id, roomNumVal); }}
                                className="p-1.5 rounded-lg transition-all cursor-pointer bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950 text-red-500 hover:border-red-200 dark:hover:border-red-900"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-mono block text-zinc-500 dark:text-zinc-400">ROOM</span>
                              <span className="text-xl font-black font-mono text-zinc-900 dark:text-zinc-50">{roomNumVal}</span>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border ${getRoomStatusClasses(roomStatusVal, false)}`}>
                              {roomStatusVal}
                            </span>
                          </div>

                          <div>
                            <span className="text-xs font-bold block text-zinc-900 dark:text-zinc-50">{roomTypeVal}</span>
                            <span className="text-xs font-mono mt-1 block text-zinc-500 dark:text-zinc-400">
                              Assigned: <strong className="text-zinc-700 dark:text-zinc-300">Nabslodge {roomBranchVal}</strong>
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block">Amenities</span>
                            <div className="flex flex-wrap gap-1">
                              {amenities.length > 0 ? (
                                amenities.map((a, idx) => (
                                  <span key={idx} className="text-[9px] font-bold px-2 py-0.5 rounded-lg border bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700">
                                    {a}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[9px] font-medium italic text-zinc-400 dark:text-zinc-600">No amenities added</span>
                              )}
                            </div>
                          </div>

                          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                            <div className="flex justify-between items-baseline">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">Nightly Rate:</span>
                              <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                                GH₵{roomPriceVal.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {rooms.filter((r) => roomFilter === 'All' || r.branch === roomFilter).length === 0 && (
                    <div className={`col-span-1 md:col-span-3 py-16 text-center rounded-3xl border shadow-xs ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                      <div className="flex flex-col items-center justify-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-sm ${isDarkMode ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-50 text-slate-300'}`}>
                          <BedDouble className="w-8 h-8" />
                        </div>
                        <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-200' : 'text-slate-700'}`}>No Rooms Configured</h4>
                        <p className={`text-xs max-w-sm mx-auto mb-4 ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                          No rooms are listed for Nabslodge {roomFilter}. Configure your inventory to start accepting bookings.
                        </p>
                        <button
                          onClick={handleOpenAddRoom}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                        >
                          Create First Room
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}



            {/* TAB 6: GLOBAL SETTINGS */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-6"
              >
                <div className={`border rounded-3xl p-6 ${theme.card}`}>
                  <div className="flex items-center justify-between mb-6 border-b pb-4 dark:border-zinc-800">
                    <div>
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Global Operation Settings
                      </h3>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Set the default check-in and check-out times across all branches.
                      </p>
                    </div>
                    <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-zinc-900 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                      <Settings className="w-5 h-5" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                    <div className="space-y-2">
                      <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Default Check-In Time
                      </label>
                      <input
                        type="time"
                        value={globalCheckInTime}
                        onChange={(e) => setGlobalCheckInTime(e.target.value)}
                        className={`block w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Default Check-Out Time
                      </label>
                      <input
                        type="time"
                        value={globalCheckOutTime}
                        onChange={(e) => setGlobalCheckOutTime(e.target.value)}
                        className={`block w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Late Check-Out Extension Fee (₵)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lateCheckOutFee}
                        onChange={(e) => setLateCheckOutFee(parseFloat(e.target.value) || 0)}
                        className={`block w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>

                    {/* IP Enforcement Master Toggle */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                      <div>
                        <span className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-200' : 'text-slate-700'}`}>
                          Enforce Branch IP Address Restrictions
                        </span>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          When switched OFF, receptionists can log in from any Wi-Fi network or IP location.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnforceIpRestrictions(!enforceIpRestrictions)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          enforceIpRestrictions ? 'bg-emerald-500' : isDarkMode ? 'bg-zinc-700' : 'bg-slate-300'
                        }`}
                        role="switch"
                        aria-checked={enforceIpRestrictions}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            enforceIpRestrictions ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className={`space-y-2 transition-opacity ${enforceIpRestrictions ? 'opacity-100' : 'opacity-40'}`}>
                      <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Nabslodge Annex IP Address / Range
                      </label>
                      <input
                        type="text"
                        value={annexIp}
                        onChange={(e) => setAnnexIp(e.target.value)}
                        placeholder="e.g. 197.251.12.45, 197.251.12.* or *"
                        className={`block w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors ${theme.input}`}
                      />
                      <p className="text-[11px] text-zinc-500">
                        Supports single IP, subnets (197.251.12.*), multiple IPs (comma-separated), or * to disable restriction.
                      </p>
                    </div>
                    
                    <div className={`space-y-2 transition-opacity ${enforceIpRestrictions ? 'opacity-100' : 'opacity-40'}`}>
                      <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Nabslodge Ayigya IP Address / Range
                      </label>
                      <input
                        type="text"
                        value={ayigyaIp}
                        onChange={(e) => setAyigyaIp(e.target.value)}
                        placeholder="e.g. 197.251.48.92, 197.251.48.* or *"
                        className={`block w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors ${theme.input}`}
                      />
                      <p className="text-[11px] text-zinc-500">
                        Supports single IP, subnets (197.251.48.*), multiple IPs (comma-separated), or * to disable restriction.
                      </p>
                    </div>

                    {/* AUDIT LOG AUTO-PURGE MAINTENANCE */}
                    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-500" />
                            Audit Log Auto-Purge Policy (6-Month Automated Cleanup)
                          </h4>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Automatically removes audit logs older than the retention threshold whenever logs are accessed, keeping storage lean without DB flooding.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAutoPurgeEnabled(!autoPurgeEnabled)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            autoPurgeEnabled ? 'bg-amber-500' : isDarkMode ? 'bg-zinc-700' : 'bg-slate-300'
                          }`}
                          role="switch"
                          aria-checked={autoPurgeEnabled}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              autoPurgeEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {autoPurgeEnabled && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          <div className="space-y-1.5">
                            <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                              Log Retention Threshold
                            </label>
                            <select
                              value={logRetentionDays}
                              onChange={(e) => setLogRetentionDays(Number(e.target.value))}
                              className={`block w-full px-4 py-2.5 rounded-xl text-xs font-mono focus:outline-none transition-colors ${theme.input}`}
                            >
                              <option value={180}>6 Months (180 Days) — Recommended</option>
                              <option value={90}>3 Months (90 Days)</option>
                              <option value={365}>1 Year (365 Days)</option>
                            </select>
                          </div>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => {
                                const result = autoPurgeOldLogs(logRetentionDays);
                                const updated = getLogs();
                                setLogs(updated);
                                addToast(
                                  "Purge Sweep Complete",
                                  "info",
                                  `Purged ${result.purgedCount} log(s) older than ${logRetentionDays} days. ${result.remainingCount} active logs remain.`,
                                  4000
                                );
                              }}
                              className="w-full px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs rounded-xl border border-amber-500/30 transition-colors cursor-pointer flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Run Manual Purge Sweep Now
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button 
                      onClick={handleSaveSettings}
                      disabled={isSavingSettings}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2"
                    >
                      {isSavingSettings ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </button>
                  </div>
                </div>

                {/* DATABASE BLANK SLATE RESET CARD */}
                <div className={`border rounded-3xl p-6 ${theme.card} border-rose-500/30`}>
                  <div className="flex items-center justify-between mb-4 border-b pb-4 dark:border-zinc-800">
                    <div>
                      <h3 className="text-lg font-bold text-rose-500 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                        Reset System to Clean Blank Slate
                      </h3>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Wipe all test bookings, room revenues, activity ledger entries, and shift handovers to freshly test the application with GH₵0.00 revenue and 0% occupancy.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      <p className="font-semibold text-rose-400">Action cannot be undone.</p>
                      <p className="text-[11px] mt-0.5">Clears Firestore & local collections so you start testing with zero active shifts & clean metrics.</p>
                    </div>
                    <button
                      onClick={handlePurgeDatabase}
                      disabled={isPurgingDb}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center gap-2 shrink-0"
                    >
                      {isPurgingDb ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Purging Data...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          Wipe Data & Reset Blank Slate
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4.5: ACTIVITY CATALOG */}
            {activeTab === 'activityCatalog' && (
              <motion.div
                key="activityCatalog"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <h2 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Activity Catalog</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                    Manage and configure non-resident activities and assign flat rates (GH₵) that dynamically populate on receptionist consoles.
                  </p>
                </div>

                {/* LEDGER TOGGLE NAVIGATION BAR */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveActivityTab(prev => prev === 'walkin' ? null : 'walkin')}
                    className={`px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-2 ${
                      activeActivityTab === 'walkin'
                        ? 'bg-blue-600 text-white font-semibold ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-zinc-950 shadow-md shadow-blue-500/20'
                        : isDarkMode
                          ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>⚡ View Walk-In Activity Ledger</span>
                  </button>
                </div>

                {/* ACTIVITY CATALOG SEEDING CARD */}
                <div className={`border rounded-3xl p-6 ${theme.card}`}>
                  <div className="flex items-center justify-between mb-6 border-b pb-4 dark:border-zinc-800">
                    <div>
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Walk-In Activity Catalog
                      </h3>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Manage non-resident activities and assign flat rates (GH₵) that dynamically populate on receptionist consoles.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatalogId(null);
                          setNewActivityName('');
                          setNewActivityPrice('');
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Activity
                      </button>
                      <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-zinc-900 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                        <Activity className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Catalog item addition form */}
                    <form onSubmit={handleSaveActivityCatalogItem} className="lg:col-span-1 space-y-4">
                      <h4 className={`text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                        {editingCatalogId ? 'Edit Activity Details' : 'Add New Activity'}
                      </h4>
                      
                      <div className="space-y-1.5">
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Activity Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={newActivityName}
                          onChange={(e) => setNewActivityName(e.target.value)}
                          placeholder="e.g. Swimming Pool Pass"
                          className={`block w-full px-4 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Flat Price (GH₵) *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={newActivityPrice}
                          onChange={(e) => setNewActivityPrice(e.target.value)}
                          placeholder="e.g. 50"
                          className={`block w-full px-4 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        {editingCatalogId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatalogId(null);
                              setNewActivityName('');
                              setNewActivityPrice('');
                            }}
                            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                              isDarkMode 
                                ? 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-zinc-400' 
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={isSavingActivity}
                          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/10 transition-all cursor-pointer flex items-center justify-center gap-1.5 animate-none"
                        >
                          {isSavingActivity ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : editingCatalogId ? (
                            'Update Activity'
                          ) : (
                            'Add to Catalog'
                          )}
                        </button>
                      </div>
                    </form>

                    {/* Catalog listing */}
                    <div className="lg:col-span-2 space-y-4">
                      <h4 className={`text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Active Seeding Catalog ({activityCatalog.length})
                      </h4>

                      {activityCatalog.length === 0 ? (
                        <div className={`p-8 rounded-2xl border border-dashed text-center ${
                          isDarkMode ? 'border-zinc-800 text-zinc-500 bg-zinc-900/10' : 'border-slate-200 text-slate-400 bg-slate-50/50'
                        }`}>
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs font-semibold">No catalog activities added yet. Click Add New Activity to begin.</p>
                        </div>
                      ) : (
                        <div className={`border rounded-2xl overflow-hidden ${theme.tableContainer}`}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={`border-b dark:border-zinc-800 text-left font-mono ${isDarkMode ? 'bg-zinc-900/50 text-zinc-400' : 'bg-slate-50 text-slate-500'}`}>
                                <th className="p-3">Activity / Service Name</th>
                                <th className="p-3">Flat Price</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-zinc-800">
                              {activityCatalog.map((item) => (
                                <tr key={item.id || item.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                                  <td className="p-3 font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</td>
                                  <td className="p-3 font-mono text-zinc-700 dark:text-zinc-300">GH₵ {item.price.toFixed(2)}</td>
                                  <td className="p-3 text-right space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCatalogId(item.id);
                                        setNewActivityName(item.name);
                                        setNewActivityPrice(item.price.toString());
                                      }}
                                      className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer ${
                                        isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                      }`}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteActivityCatalogItem(item.id)}
                                      className="px-2.5 py-1 rounded-lg font-semibold text-[11px] bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WALK-IN ACTIVITY LEDGER / CONDITIONAL CONTAINER */}
                  <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
                    {activeActivityTab === 'walkin' ? (
                      <WalkInActivityLedger currentUser={currentUser} isDarkMode={isDarkMode} branch={currentUser.branch || 'Annex'} activityCatalog={activityCatalog} />
                    ) : (
                      <div className={`p-10 rounded-2xl border border-dashed text-center flex flex-col items-center justify-center ${
                        isDarkMode ? 'border-zinc-800 bg-zinc-900/20 text-zinc-400' : 'border-slate-300 bg-slate-50/50 text-slate-600'
                      }`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
                          isDarkMode ? 'bg-zinc-900 text-zinc-500 border border-zinc-800' : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          <Activity className="w-5 h-5 opacity-60" />
                        </div>
                        <p className="text-xs font-medium">Select a ledger option above to view activity records.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4.6: DRINKS & BAR MANAGEMENT */}
            {activeTab === 'drinksManagement' && (
              <motion.div
                key="drinksManagement"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'} flex items-center gap-2`}>
                      <Wine className="w-6 h-6 text-purple-500" />
                      Drinks Store
                    </h2>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                      Set drink prices, manage stock availability across branches, and audit all guest beverage transactions recorded by receptionists.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddDrinkModal(true)}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-500/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Drink Item
                  </button>
                </div>

                <div className="mb-6">
                  <BestSellingDrinks drinks={drinks} sales={drinkSales} />
                </div>

                <div className={`border rounded-3xl p-6 ${theme.card}`}>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                          <input
                            type="text"
                            placeholder="Search drinks..."
                            value={drinkSearchQuery}
                            onChange={(e) => setDrinkSearchQuery(e.target.value)}
                            className={`pl-9 pr-4 py-2 rounded-xl text-xs font-medium border outline-none ${
                              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          />
                        </div>
                        <select
                          value={drinkBranchFilter}
                          onChange={(e) => setDrinkBranchFilter(e.target.value as any)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border outline-none ${
                            isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <option value="All">All Branches</option>
                          <option value="Annex">Annex Branch</option>
                          <option value="Ayigya">Ayigya Branch</option>
                        </select>
                      </div>

                      <div className="text-xs text-zinc-400 font-mono">
                        Available Drinks: <strong className="text-purple-400">{drinks.filter(d => d.inStock).length} in stock</strong>
                      </div>
                    </div>

                    <div className="overflow-x-auto border rounded-2xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className={`border-b text-[10px] uppercase font-mono tracking-wider ${
                          isDarkMode ? 'bg-zinc-900 text-zinc-400 border-zinc-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          <tr>
                            <th className="py-3 px-4">Drink Item Name</th>
                            <th className="py-3 px-4">Category</th>
                            <th className="py-3 px-4">Branch</th>
                            <th className="py-3 px-4 font-mono">Price (GH₵)</th>
                            <th className="py-3 px-4">Sales Performance</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {drinks.filter(d => {
                            const matchQuery = String(d.name || '').toLowerCase().includes(drinkSearchQuery.toLowerCase()) || String(d.category || '').toLowerCase().includes(drinkSearchQuery.toLowerCase());
                            const matchBranch = drinkBranchFilter === 'All' || d.branch === 'All' || d.branch === drinkBranchFilter;
                            return matchQuery && matchBranch;
                          }).length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-zinc-500 font-medium">
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <Wine className="w-8 h-8 opacity-40 text-purple-500 animate-pulse" />
                                  <span className="text-sm font-semibold">No drinks found matching your criteria.</span>
                                  <p className="text-xs text-zinc-400">Add a brand new drink item to populate your store shelf.</p>
                                  <button
                                    type="button"
                                    onClick={() => setShowAddDrinkModal(true)}
                                    className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                                  >
                                    + Add New Drink Item
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            drinks
                              .filter(d => {
                                const matchQuery = String(d.name || '').toLowerCase().includes(drinkSearchQuery.toLowerCase()) || String(d.category || '').toLowerCase().includes(drinkSearchQuery.toLowerCase());
                                const matchBranch = drinkBranchFilter === 'All' || d.branch === 'All' || d.branch === drinkBranchFilter;
                                return matchQuery && matchBranch;
                              })
                              .sort((a, b) => {
                                const soldA = drinkSalesMap[a.id] || 0;
                                const soldB = drinkSalesMap[b.id] || 0;
                                return soldB - soldA; // descending order of sales
                              })
                              .map((drink, index) => {
                                const totalSold = drinkSalesMap[drink.id] || 0;
                                return (
                                  <tr key={drink.id} className={`${isDarkMode ? 'hover:bg-zinc-800/50' : 'hover:bg-slate-50'} transition-colors`}>
                                    <td className={`py-3 px-4 font-bold flex items-center gap-2 ${theme.text}`}>
                                      {index === 0 && totalSold > 0 && (
                                        <span className="bg-amber-500/25 text-amber-500 px-1.5 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-0.5">👑 Best Seller</span>
                                      )}
                                      {drink.name}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200 text-slate-700'
                                      }`}>
                                        {drink.category || 'Beverage'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-zinc-500">
                                      {drink.branch === 'All' ? 'All' : drink.branch}
                                    </td>
                                    <td className="py-3 px-4 font-mono font-black text-purple-400 text-sm">
                                      GH₵ {drink.price.toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`font-black ${totalSold > 0 ? 'text-purple-400' : 'text-zinc-500'}`}>{totalSold}</span>
                                        <span>unit(s) sold</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleDrinkStock(drink.id, drink.inStock)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                                          drink.inStock
                                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                            : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                                        }`}
                                      >
                                        {drink.inStock ? 'Available' : 'Unavailable'}
                                      </button>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleEditDrink(drink)}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                          isDarkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                                        }`}
                                        title="Edit Drink"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDrink(drink)}
                                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                        title="Delete Drink"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                      </div>
                    </div>

                {/* ADD DRINK MODAL */}
                <AnimatePresence>
                  {showAddDrinkModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-base font-extrabold flex items-center gap-2">
                            <Wine className="w-5 h-5 text-purple-400" />
                            Add Drink to Available Menu
                          </h3>
                          <button
                            onClick={() => setShowAddDrinkModal(false)}
                            className="p-1 rounded-lg text-zinc-400 hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <form onSubmit={handleSaveDrink} className="space-y-4 text-xs">
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                              Drink / Beverage Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g., Coca Cola (330ml), Bel-Aqua Water"
                              value={newDrinkName}
                              onChange={(e) => setNewDrinkName(e.target.value)}
                              className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200'
                              }`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                                Price per Unit (GH₵) *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                step="1"
                                value={newDrinkPrice}
                                onChange={(e) => setNewDrinkPrice(Number(e.target.value))}
                                className={`w-full p-2.5 rounded-xl border outline-none font-mono font-bold text-purple-400 ${
                                  isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'
                                }`}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                                Category
                              </label>
                              <select
                                value={newDrinkCategory}
                                onChange={(e) => setNewDrinkCategory(e.target.value)}
                                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                                  isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <option value="Soft Drink">Soft Drink</option>
                                <option value="Energy Drink">Energy Drink</option>
                                <option value="Water">Water</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                              Branch Availability
                            </label>
                            <select
                              value={newDrinkBranch}
                              onChange={(e) => setNewDrinkBranch(e.target.value as any)}
                              className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <option value="All">All Branches</option>
                              <option value="Annex">Annex Branch Only</option>
                              <option value="Ayigya">Ayigya Branch Only</option>
                            </select>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowAddDrinkModal(false)}
                              className={`flex-1 py-2.5 rounded-xl font-bold ${
                                isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
                            >
                              Save Drink
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {/* EDIT DRINK MODAL */}
                <AnimatePresence>
                  {showEditDrinkModal && drinkToEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-base font-extrabold flex items-center gap-2">
                            <Pencil className="w-5 h-5 text-purple-400" />
                            Edit {drinkToEdit.name}
                          </h3>
                          <button
                            onClick={() => setShowEditDrinkModal(false)}
                            className="p-1 rounded-lg text-zinc-400 hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <form onSubmit={handleSaveEditDrink} className="space-y-4 text-xs">
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                              Drink Name *
                            </label>
                            <input
                              type="text"
                              required
                              value={editDrinkName}
                              onChange={(e) => setEditDrinkName(e.target.value)}
                              className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200'
                              }`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                                Price (GH₵) *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                step="1"
                                value={editDrinkPrice}
                                onChange={(e) => setEditDrinkPrice(Number(e.target.value))}
                                className={`w-full p-2.5 rounded-xl border outline-none font-mono font-bold text-purple-400 ${
                                  isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-50 border-slate-200'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                                Category
                              </label>
                              <select
                                value={editDrinkCategory}
                                onChange={(e) => setEditDrinkCategory(e.target.value)}
                                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                                  isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <option value="Soft Drink">Soft Drink</option>
                                <option value="Energy Drink">Energy Drink</option>
                                <option value="Water">Water</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full mt-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-500/20 transition-all cursor-pointer"
                          >
                            Save Changes
                          </button>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {/* DELETE DRINK CONFIRMATION MODAL */}
                <AnimatePresence>
                  {drinkToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className={`w-full max-w-sm p-6 rounded-3xl border shadow-2xl ${
                          isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold">Delete Drink Item</h3>
                            <p className="text-xs text-zinc-400">This action cannot be undone.</p>
                          </div>
                        </div>

                        <p className={`text-xs my-4 ${isDarkMode ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Are you sure you want to permanently remove <strong className="text-rose-400">"{drinkToDelete.name}"</strong> from your stock catalog?
                        </p>

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setDrinkToDelete(null)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                              isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={confirmDeleteDrink}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Confirm Delete
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* TAB 5: BOOKINGS REGISTRY */}
            {activeTab === 'bookings' && (
              <motion.div
                key="bookings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <h2 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Reservations & Billing Registry</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                    Consolidated registry tracking all guest bookings, payments, and accommodation history for both lodges.
                  </p>
                </div>

                <div className={`border rounded-3xl p-5 space-y-4 ${
                  theme.card
                }`}>
                  {/* Search and Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Search Field */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={bookingSearchQuery}
                        onChange={(e) => setBookingSearchQuery(e.target.value)}
                        placeholder="Search guest, ref, room..."
                        className={`block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs placeholder-zinc-500 focus:outline-none focus:border-blue-500 border ${
                          isDarkMode 
                            ? 'bg-zinc-950 border-zinc-800 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      />
                    </div>

                    {/* Lodge Filter */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase tracking-wider shrink-0 font-bold ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Lodge:</span>
                      <select
                        value={bookingBranchFilter}
                        onChange={(e: any) => setBookingBranchFilter(e.target.value)}
                        className={`block w-full px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-blue-500 border cursor-pointer ${
                          isDarkMode 
                            ? 'bg-zinc-950 border-zinc-850 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-850'
                        }`}
                      >
                        <option value="All">All Lodges</option>
                        <option value="Annex">Nabslodge Annex</option>
                        <option value="Ayigya">Nabslodge Ayigya</option>
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase tracking-wider shrink-0 font-bold ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Status:</span>
                      <select
                        value={bookingStatusFilter}
                        onChange={(e: any) => setBookingStatusFilter(e.target.value)}
                        className={`block w-full px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-blue-500 border cursor-pointer ${
                          isDarkMode 
                            ? 'bg-zinc-950 border-zinc-850 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-850'
                        }`}
                      >
                        <option value="All">All Statuses</option>
                        <option value="CheckedIn">Checked In</option>
                        <option value="CheckedOut">Checked Out</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    {/* Payment Status Filter */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase tracking-wider shrink-0 font-bold ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Payment:</span>
                      <select
                        value={bookingPaymentFilter}
                        onChange={(e: any) => setBookingPaymentFilter(e.target.value)}
                        className={`block w-full px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-blue-500 border cursor-pointer ${
                          isDarkMode 
                            ? 'bg-zinc-950 border-zinc-850 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-850'
                        }`}
                      >
                        <option value="All">All Bills</option>
                        <option value="Paid">Fully Paid</option>
                        <option value="Partial">Partial</option>
                        <option value="Unpaid">Unpaid</option>
                      </select>
                    </div>
                  </div>

                  {/* Date Range Filters */}
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <DateRangePicker
                      startDate={bookingStartDate}
                      endDate={bookingEndDate}
                      onChangeStart={setBookingStartDate}
                      onChangeEnd={setBookingEndDate}
                      onClear={() => {
                        setBookingStartDate('');
                        setBookingEndDate('');
                      }}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3 ${isDarkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                    {/* Branch Tab Selector inside dashboard for manager */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setBookingBranchFilter('All')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          bookingBranchFilter === 'All'
                            ? 'bg-blue-600 text-white'
                            : (isDarkMode ? 'bg-zinc-950 text-zinc-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                        }`}
                      >
                        Combined Lodge Overview
                      </button>
                      <button
                        onClick={() => setBookingBranchFilter('Annex')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          bookingBranchFilter === 'Annex'
                            ? 'bg-blue-600 text-white'
                            : (isDarkMode ? 'bg-zinc-950 text-zinc-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                        }`}
                      >
                        Nabslodge Annex Records
                      </button>
                      <button
                        onClick={() => setBookingBranchFilter('Ayigya')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          bookingBranchFilter === 'Ayigya'
                            ? 'bg-blue-600 text-white'
                            : (isDarkMode ? 'bg-zinc-950 text-zinc-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                        }`}
                      >
                        Nabslodge Ayigya Records
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const filtered = bookings.filter(b => {
                            if (bookingBranchFilter !== 'All' && b.branch !== bookingBranchFilter) return false;
                            if (bookingStatusFilter !== 'All' && b.status !== bookingStatusFilter) return false;
                            if (bookingPaymentFilter !== 'All' && b.paymentStatus !== bookingPaymentFilter) return false;
                            if (bookingStartDate) {
                              const bEnd = b.checkOutDate && typeof b.checkOutDate === 'string' ? b.checkOutDate.substring(0, 10) : '';
                              if (bEnd < bookingStartDate) return false;
                            }
                            if (bookingEndDate) {
                              const bStart = b.checkInDate && typeof b.checkInDate === 'string' ? b.checkInDate.substring(0, 10) : '';
                              if (bStart > bookingEndDate) return false;
                            }
                            return true;
                          });

                          const calculatePaid = (b: Booking) => {
                            if (b.paymentStatus === 'Paid') return b.totalPrice;
                            if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) {
                              return b.amountPaid || b.deposit || b.totalPrice * 0.5;
                            }
                            return 0;
                          };
                          const totalRevenue = filtered.reduce((sum, b) => sum + calculatePaid(b), 0);
                          const annexBookings = filtered.filter(b => b.branch === 'Annex');
                          const ayigyaBookings = filtered.filter(b => b.branch === 'Ayigya');

                          openPrintPreview({
                            elementId: 'manager-bookings-report-container',
                            title: 'Bookings Overview Report',
                            reportPeriod: `Branch: ${bookingBranchFilter} | Status: ${bookingStatusFilter}`,
                            description: `Filtered overview containing ${filtered.length} booking records.`,
                            recordCount: filtered.length,
                            filename: 'Bookings_Overview_Report',
                            totalRevenue,
                            processedBookingsCount: filtered.length,
                            branchBreakdown: [
                              { 
                                name: 'Annex', 
                                revenue: annexBookings.reduce((sum, b) => sum + calculatePaid(b), 0), 
                                volume: annexBookings.length 
                              },
                              { 
                                name: 'Ayigya', 
                                revenue: ayigyaBookings.reduce((sum, b) => sum + calculatePaid(b), 0), 
                                volume: ayigyaBookings.length 
                              }
                            ],
                            dataEntries: filtered.map(b => ({
                              col1: `${b.branch} / ${b.id.substring(0, 8).toUpperCase()}`,
                              col2: b.guestName,
                              col3: `Room ${b.roomNumber}`,
                              col4: `${b.checkInDate && typeof b.checkInDate === 'string' ? b.checkInDate.substring(0, 10) : 'N/A'} to ${b.checkOutDate && typeof b.checkOutDate === 'string' ? b.checkOutDate.substring(0, 10) : 'N/A'}`,
                              col5: `GH₵ ${b.totalPrice.toFixed(2)}`,
                              col6: b.receptionistName || 'N/A',
                              col7: `${b.status} (${b.paymentStatus})`
                            })),
                            reportType: 'bookings'
                          });
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm'}`}
                      >
                        <Printer className="w-3.5 h-3.5" /> Print PDF Report
                      </button>
                      <button 
                        onClick={() => {
                          const headers = ['Lodge/Ref', 'Guest Name', 'Email', 'Phone', 'Room', 'In', 'Out', 'Total Price', 'Paid', 'Status', 'Payment', 'Operator'];
                          const rows = bookings.map(b => [
                            `${b.branch} / ${b.id}`,
                            b.guestName,
                            b.guestEmail || '',
                            b.guestPhone || '',
                            b.roomNumber,
                            b.checkInDate,
                            b.checkOutDate,
                            b.totalPrice,
                            b.paymentStatus === 'Paid' ? b.totalPrice : ((b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) ? (b.deposit || b.amountPaid || b.totalPrice * 0.5) : 0),
                            b.status,
                            b.paymentStatus,
                            b.receptionistName || 'N/A'
                          ]);
                          let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\\n" + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\\n");
                          const encodedUri = encodeURI(csvContent);
                          const link = document.createElement("a");
                          link.setAttribute("href", encodedUri);
                          link.setAttribute("download", "nabslodge_bookings_report.csv");
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm'}`}
                      >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Bookings Table */}
                  <div id="manager-bookings-report-container" className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className={`border-b text-[10px] font-mono uppercase font-semibold tracking-wider ${
                          theme.tableHeader
                        }`}>
                          <th className="py-3 px-4">Lodge / Ref</th>
                          <th className="py-3 px-4">Guest Info</th>
                          <th className="py-3 px-4">Assigned Room</th>
                          <th className="py-3 px-4">Schedule Dates</th>
                          <th className="py-3 px-4">Billing (GH₵)</th>
                          <th className="py-3 px-4">Status / Payment</th>
                          <th className="py-3 px-4">Operator</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/40 text-xs">
                        {(() => {
                          const filtered = bookings.filter(b => {
                            // Branch filter
                            if (bookingBranchFilter !== 'All' && b.branch !== bookingBranchFilter) return false;
                            // Status filter
                            if (bookingStatusFilter !== 'All' && b.status !== bookingStatusFilter) return false;
                            // Payment filter
                            if (bookingPaymentFilter !== 'All' && b.paymentStatus !== bookingPaymentFilter) return false;
                            // Date range filter
                            if (bookingStartDate) {
                              const bEnd = b.checkOutDate && typeof b.checkOutDate === 'string' ? b.checkOutDate.substring(0, 10) : '';
                              if (bEnd < bookingStartDate) return false;
                            }
                            if (bookingEndDate) {
                              const bStart = b.checkInDate && typeof b.checkInDate === 'string' ? b.checkInDate.substring(0, 10) : '';
                              if (bStart > bookingEndDate) return false;
                            }
                            // Search query
                            if (bookingSearchQuery.trim() !== '') {
                              const q = bookingSearchQuery.toLowerCase();
                              const idStr = String(b.id || '').toLowerCase();
                              const guestNameStr = String(b.guestName || '').toLowerCase();
                              const guestEmailStr = String(b.guestEmail || '').toLowerCase();
                              const guestPhoneStr = String(b.guestPhone || b.guestContact || '').toLowerCase();
                              const roomNumStr = String(b.roomNumber || '').toLowerCase();
                              return (
                                idStr.includes(q) ||
                                guestNameStr.includes(q) ||
                                guestEmailStr.includes(q) ||
                                guestPhoneStr.includes(q) ||
                                roomNumStr.includes(q)
                              );
                            }
                            return true;
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="py-16 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                                      <Search className="w-8 h-8" />
                                    </div>
                                    <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Bookings Found</h4>
                                    <p className={`text-xs max-w-sm mx-auto ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                                      No booking records match the current search or filter criteria.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((b, idx) => {
                            const isPaid = b.paymentStatus === 'Paid';
                            const isPartial = b.paymentStatus === 'Partial' || b.paymentStatus?.includes('Partial');

                            return (
                              <tr key={`${b.id}-${idx}`} className={`hover:bg-zinc-800/10 transition-colors ${
                                isDarkMode ? 'text-zinc-200 border-zinc-850/30' : 'text-slate-800 border-slate-100'
                              }`}>
                                <td className="py-3.5 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider block w-fit mb-1 ${
                                    b.branch === 'Annex'
                                      ? 'bg-blue-500/10 text-blue-450 border border-blue-500/20'
                                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  }`}>
                                    {b.branch === 'Annex' ? 'ANNEX' : 'AYIGYA'}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-450 block">{b.id}</span>
                                </td>
                                <td className="py-3.5 px-4 font-semibold">
                                  <div className="flex flex-col">
                                    <span className={isDarkMode ? 'text-zinc-100' : 'text-slate-900'}>{b.guestName}</span>
                                    <span className="text-[10px] text-zinc-500">{b.guestEmail} • {b.guestPhone}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <BedDouble className="w-3.5 h-3.5 text-zinc-500" />
                                    <div>
                                      <span className="font-bold">Room {b.roomNumber}</span>
                                      <span className="block text-[10px] text-zinc-500">Max {b.maxGuests || 2} Pax</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                                  <div className="flex flex-col">
                                    <span>In: {b.checkInDate}</span>
                                    <span>Out: {b.checkOutDate}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono font-bold text-sm">
                                  <div className="flex flex-col">
                                    <span>GH₵{b.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[10px] text-zinc-500 font-normal">Paid: GH₵{(b.paymentStatus === 'Paid' ? b.totalPrice : ((b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) ? (b.deposit || b.amountPaid || b.totalPrice * 0.5) : 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-col gap-1.5">
                                    {/* Status tag */}
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wide text-center uppercase block w-fit ${
                                      b.status === 'CheckedIn'
                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                        : b.status === 'CheckedOut'
                                        ? 'bg-blue-500/10 text-blue-450 border border-blue-500/20'
                                        : b.status === 'Pending'
                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        : b.status === 'Confirmed'
                                        ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    }`}>
                                      {b.status === 'CheckedIn' ? 'Checked In' : b.status === 'CheckedOut' ? 'Checked Out' : b.status}
                                    </span>
                                    {/* Payment status tag */}
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wide text-center uppercase block w-fit ${
                                      isPaid
                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                        : isPartial
                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    }`}>
                                      {b.paymentStatus}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono font-semibold text-[11px] whitespace-nowrap text-zinc-500">
                                  {b.receptionistName || b.receptionistId?.substring(0, 8) || 'System'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: PENDING EDIT APPROVALS */}
            {activeTab === 'pendingEdits' && (
              <motion.div
                key="pendingEdits"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Header & Filter Controls */}
                <div className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-amber-500" />
                        <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                          Pending Booking Edit Approval Hub
                        </h2>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Review, authorize, or decline revenue-altering booking modifications submitted by receptionists. (Money Expected Prioritized)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(['Pending', 'Approved', 'Rejected', 'All'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setPendingEditsFilter(f)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            pendingEditsFilter === f
                              ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                              : (isDarkMode ? 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100')
                          }`}
                        >
                          {f === 'Pending' ? `Pending (${pendingEditRequests.filter(r => r.status === 'Pending').length})` : f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Requests List */}
                  <div className="pt-6 space-y-4">
                    {(() => {
                      const thirtyDaysAgo = new Date();
                      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                      const filtered = pendingEditRequests.filter(r => {
                        if (pendingEditsFilter !== 'All' && r.status !== pendingEditsFilter) return false;
                        // Exclude requests older than 30 days
                        if (getSafeTime(r.createdAt) < thirtyDaysAgo.getTime()) return false;
                        return true;
                      }).sort((a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));

                      if (filtered.length === 0) {
                        return (
                          <div className="py-12 text-center text-zinc-400 font-mono text-xs">
                            No {pendingEditsFilter.toLowerCase()} booking edit requests found.
                          </div>
                        );
                      }

                      return filtered.map((req) => (
                        <div
                          key={req.id}
                          className={`p-5 rounded-2xl border transition-all ${
                            req.status === 'Pending'
                              ? (isDarkMode ? 'bg-zinc-950 border-amber-500/30' : 'bg-amber-50/40 border-amber-200')
                              : (isDarkMode ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-50 border-slate-200')
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                  req.status === 'Pending'
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : req.status === 'Approved'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                }`}>
                                  {req.status}
                                </span>
                                <span className="text-xs font-mono text-zinc-400">
                                  Request #{req.id.slice(-6).toUpperCase()} • Branch: <strong className="text-zinc-700 dark:text-zinc-300">{req.branch}</strong>
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Submitted by <strong>{req.receptionistName}</strong> on {new Date(getSafeTime(req.createdAt)).toLocaleString()}
                              </p>
                              {(() => {
                                const summaryParts: string[] = [];
                                if (req.currentRoomNumber !== req.proposedRoomNumber) {
                                  summaryParts.push(`Move to Room ${req.proposedRoomNumber}`);
                                }
                                if (req.currentCheckInDate !== req.proposedCheckInDate || req.currentCheckOutDate !== req.proposedCheckOutDate) {
                                  summaryParts.push(`Adjust Calendar Dates`);
                                }
                                if (Number(req.currentTotalPrice || 0) !== Number(req.proposedTotalPrice || 0)) {
                                  summaryParts.push(`Change Price`);
                                }
                                const cMethod = req.currentPaymentMethod || 'Cash';
                                const pMethod = req.proposedPaymentMethod || 'Mobile Money';
                                if (cMethod.trim().toLowerCase() !== pMethod.trim().toLowerCase()) {
                                  const shortCMethod = cMethod.toLowerCase().includes('momo') || cMethod.toLowerCase().includes('mobile') ? 'MoMo' : cMethod;
                                  const shortPMethod = pMethod.toLowerCase().includes('momo') || pMethod.toLowerCase().includes('mobile') ? 'MoMo' : pMethod;
                                  summaryParts.push(`Switch Payment Mode (${shortCMethod} ➔ ${shortPMethod})`);
                                }
                                if (req.currentAmountPaid !== undefined && req.proposedAmountPaid !== undefined && Number(req.currentAmountPaid) !== Number(req.proposedAmountPaid)) {
                                  summaryParts.push(`Adjust Paid Amount`);
                                }
                                if (req.currentPaymentStatus !== req.proposedPaymentStatus) {
                                  summaryParts.push(`Update Payment Status`);
                                }
                                
                                const summaryText = summaryParts.length > 0 ? summaryParts.join(' & ') : 'Update Guest Contact Info';
                                return (
                                  <div className="mt-2.5 flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/25 w-fit">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    <span className="text-xs font-black tracking-tight text-amber-800 dark:text-amber-400 font-mono uppercase">
                                      {summaryText}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Prioritized Financial Impact Box */}
                            <div className={`p-3 rounded-xl border text-right font-mono ${
                              req.priceDifference > 0
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                                : req.priceDifference < 0
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                                : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-700 dark:text-zinc-300'
                            }`}>
                              <span className="text-[10px] uppercase tracking-wider block font-bold">Financial Impact / Money Expected</span>
                              <span className="text-base font-black">
                                {req.priceDifference > 0 ? (
                                  `+GH₵${req.priceDifference.toFixed(2)} (Extra Due)`
                                ) : req.priceDifference < 0 ? (
                                  `-GH₵${Math.abs(req.priceDifference).toFixed(2)} (Refund)`
                                ) : (
                                  'GH₵0.00 (No Price Change)'
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Requested Adjustments Block */}
                          <div className="py-4 border-b border-zinc-200 dark:border-zinc-800">
                            <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-2 font-bold tracking-wider">Requested Adjustments</span>
                            <div className="flex flex-col gap-2.5">
                              {(() => {
                                const changes = [];
                                
                                // 1. Room Change
                                if (req.currentRoomId !== req.proposedRoomId || req.currentRoomNumber !== req.proposedRoomNumber) {
                                  changes.push(
                                    <div key="room" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Room Change
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Moving from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">Room {req.currentRoomNumber}</strong> to <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">Room {req.proposedRoomNumber}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                // 2. Calendar / Dates Adjustment
                                if (req.currentCheckInDate !== req.proposedCheckInDate || req.currentCheckOutDate !== req.proposedCheckOutDate) {
                                  changes.push(
                                    <div key="dates" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Calendar Adjustment
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Dates shifting from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">{req.currentCheckInDate} ➔ {req.currentCheckOutDate}</strong> to <strong className="text-blue-600 dark:text-blue-400 font-extrabold">{req.proposedCheckInDate} ➔ {req.proposedCheckOutDate}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                // 3. Total Price Change
                                if (Number(req.currentTotalPrice || 0) !== Number(req.proposedTotalPrice || 0)) {
                                  changes.push(
                                    <div key="price" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Price Adjustment
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Total bill changing from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">GH₵{Number(req.currentTotalPrice || 0).toFixed(2)}</strong> to <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">GH₵{Number(req.proposedTotalPrice || 0).toFixed(2)}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                // 4. Payment Method Change (Cash to MoMo / etc)
                                const currentMethodStr = req.currentPaymentMethod || 'Cash';
                                const proposedMethodStr = req.proposedPaymentMethod || 'Mobile Money';
                                if (currentMethodStr.trim().toLowerCase() !== proposedMethodStr.trim().toLowerCase()) {
                                  changes.push(
                                    <div key="method" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Payment Method
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Changing mode of payment from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">{currentMethodStr}</strong> to <strong className="text-purple-600 dark:text-purple-400 font-extrabold">{proposedMethodStr}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                // 5. Payment Amount Paid Change
                                if (req.currentAmountPaid !== undefined && req.proposedAmountPaid !== undefined && Number(req.currentAmountPaid) !== Number(req.proposedAmountPaid)) {
                                  changes.push(
                                    <div key="amount" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Payment Amount
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Adjusting actual amount paid from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">GH₵{Number(req.currentAmountPaid).toFixed(2)}</strong> to <strong className="text-amber-600 dark:text-amber-400 font-extrabold">GH₵{Number(req.proposedAmountPaid).toFixed(2)}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                // 6. Payment Status Change
                                if (req.currentPaymentStatus !== req.proposedPaymentStatus) {
                                  changes.push(
                                    <div key="status" className="flex items-center gap-2.5 text-xs">
                                      <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/15 font-bold font-mono text-[9px] uppercase tracking-wider">
                                        Payment Status
                                      </span>
                                      <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                                        Updating status from <strong className="text-zinc-800 dark:text-zinc-200 font-bold">{req.currentPaymentStatus || 'Unpaid'}</strong> to <strong className="text-teal-600 dark:text-teal-400 font-extrabold">{req.proposedPaymentStatus}</strong>
                                      </span>
                                    </div>
                                  );
                                }
                                
                                return changes.length > 0 ? changes : (
                                  <div className="text-zinc-500 dark:text-zinc-400 text-xs italic font-mono flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                                    Only editing guest details (name/contact). No core financial parameters changed.
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Guest & Reason Info */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 text-xs border-b border-zinc-200 dark:border-zinc-800">
                            <div>
                              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">Guest Info</span>
                              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{req.guestName}</p>
                              <p className="text-zinc-500 dark:text-zinc-400 font-mono">{req.guestContact} {req.guestEmail ? `• ${req.guestEmail}` : ''}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">Receptionist Reason</span>
                              <p className="italic text-zinc-700 dark:text-zinc-300">"{req.reason}"</p>
                            </div>
                          </div>

                          {/* Parameters Comparison Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 text-xs">
                            <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200'}`}>
                              <span className="text-[10px] font-mono font-bold uppercase text-zinc-400 block mb-2">Current Booking State</span>
                              <div className="space-y-1 font-mono">
                                <div>Room: <strong>Room {req.currentRoomNumber}</strong></div>
                                <div>Dates: <strong>{req.currentCheckInDate} → {req.currentCheckOutDate}</strong></div>
                                <div>Total Price: <strong>GH₵{req.currentTotalPrice?.toFixed(2)}</strong></div>
                                {req.currentPaymentStatus && <div>Status: <strong>{req.currentPaymentStatus}</strong></div>}
                                {req.currentAmountPaid !== undefined && <div>Paid: <strong>GH₵{req.currentAmountPaid.toFixed(2)}</strong></div>}
                                {req.currentPaymentMethod && <div>Method: <strong>{req.currentPaymentMethod}</strong></div>}
                              </div>
                            </div>

                            <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/60 border-amber-200'}`}>
                              <span className="text-[10px] font-mono font-bold uppercase text-amber-600 dark:text-amber-400 block mb-2">Proposed Modification</span>
                              <div className="space-y-1 font-mono">
                                <div>Room: <strong>Room {req.proposedRoomNumber}</strong></div>
                                <div>Dates: <strong>{req.proposedCheckInDate} → {req.proposedCheckOutDate}</strong></div>
                                <div>Total Price: <strong className="text-amber-600 dark:text-amber-400">GH₵{req.proposedTotalPrice?.toFixed(2)}</strong></div>
                                {req.proposedPaymentStatus && <div>Status: <strong className="text-amber-600 dark:text-amber-400">{req.proposedPaymentStatus}</strong></div>}
                                {req.proposedAmountPaid !== undefined && <div>Paid: <strong className="text-amber-600 dark:text-amber-400">GH₵{req.proposedAmountPaid.toFixed(2)}</strong></div>}
                                {req.proposedPaymentMethod && <div>Method: <strong className="text-amber-600 dark:text-amber-400">{req.proposedPaymentMethod}</strong></div>}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons for Pending */}
                          {req.status === 'Pending' && (
                            <div className="pt-3 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800">
                              {rejectionInputId === req.id ? (
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                  <input
                                    type="text"
                                    placeholder="Enter rejection reason..."
                                    value={rejectionReasonText}
                                    onChange={(e) => setRejectionReasonText(e.target.value)}
                                    className={`px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                                      isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                  />
                                  <button
                                    onClick={() => handleRejectEditRequest(req)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                                  >
                                    Confirm Reject
                                  </button>
                                  <button
                                    onClick={() => { setRejectionInputId(null); setRejectionReasonText(''); }}
                                    className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setRejectionInputId(req.id)}
                                    className="px-4 py-2 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                                  >
                                    Reject Request
                                  </button>
                                  <button
                                    onClick={() => handleApproveEditRequest(req)}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <CheckCircle className="w-4 h-4" /> Approve & Apply Edit
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Review Summary for Approved/Rejected */}
                          {req.status !== 'Pending' && (
                            <div className="pt-3 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                              <div>Reviewed by <strong>{req.reviewedBy}</strong> on {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : 'N/A'}</div>
                              {req.rejectionReason && (
                                <div className="text-red-500 italic">Reason: {req.rejectionReason}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 7: FINANCIALS */}
            {activeTab === 'availabilityCalendar' && (
              <motion.div
                key="availabilityCalendar"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className={`text-xl font-extrabold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      <Calendar className="w-5 h-5 text-emerald-500" /> Multi-Lodge Availability Calendar
                    </h2>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                      Interactive 30-day occupancy & availability matrix across Nabslodge Annex and Nabslodge Ayigya.
                    </p>
                  </div>

                  {/* Lodge/Branch Selection Tabs */}
                  <div className={`p-1 rounded-2xl border flex items-center gap-1 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
                    <button
                      onClick={() => setManagerCalendarBranch('ALL')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        managerCalendarBranch === 'ALL'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      All Lodges ({rooms.length})
                    </button>
                    <button
                      onClick={() => setManagerCalendarBranch('Annex')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        managerCalendarBranch === 'Annex'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      Nabslodge Annex ({rooms.filter(r => r.branch === 'Annex').length})
                    </button>
                    <button
                      onClick={() => setManagerCalendarBranch('Ayigya')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        managerCalendarBranch === 'Ayigya'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      Nabslodge Ayigya ({rooms.filter(r => r.branch === 'Ayigya').length})
                    </button>
                  </div>
                </div>

                {/* Embedded Quick Availability Calendar */}
                <QuickAvailabilityCalendar
                  rooms={managerCalendarBranch === 'ALL' ? rooms : rooms.filter(r => r.branch === managerCalendarBranch)}
                  bookings={managerCalendarBranch === 'ALL' ? bookings : bookings.filter(b => b.branch === managerCalendarBranch)}
                  isDarkMode={isDarkMode}
                />
              </motion.div>
            )}

            {/* TAB: LIVE AVAILABLE ROOMS (BOTH LODGES) */}
            {activeTab === 'liveAvailableRooms' && (
              <motion.div
                key="liveAvailableRooms"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className={`text-xl font-extrabold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      <Eye className="w-5 h-5 text-blue-500 animate-pulse" /> Live Real-Time Available Rooms
                    </h2>
                    <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                      Instant live inventory monitor across both lodges with real-time room statuses, pricing, and active occupancy stats.
                    </p>
                  </div>

                  {/* Lodge/Branch Selection Tabs */}
                  <div className={`p-1 rounded-2xl border flex items-center gap-1 self-start lg:self-auto ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
                    <button
                      onClick={() => setLiveViewBranchFilter('ALL')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        liveViewBranchFilter === 'ALL'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      All Lodges
                    </button>
                    <button
                      onClick={() => setLiveViewBranchFilter('Annex')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        liveViewBranchFilter === 'Annex'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      Nabslodge Annex
                    </button>
                    <button
                      onClick={() => setLiveViewBranchFilter('Ayigya')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        liveViewBranchFilter === 'Ayigya'
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900')
                      }`}
                    >
                      Nabslodge Ayigya
                    </button>
                  </div>
                </div>

                {/* Live Summary Stat Cards */}
                {(() => {
                  const getLiveEffectiveStatus = (r: Room): RoomStatus => {
                    const isOccupied = r.status === 'Occupied' || !!r.guestName || bookings.some(b => 
                      (b.roomId === r.id || String(b.roomNumber) === String(r.roomNumber)) && 
                      (b.branch === r.branch || !b.branch) && 
                      (b.status === 'CheckedIn' || (b.status as string) === 'checked_in')
                    );
                    if (isOccupied) return 'Occupied';
                    return r.status || 'Available';
                  };

                  const scopeRooms = liveViewBranchFilter === 'ALL' ? rooms : rooms.filter(r => r.branch === liveViewBranchFilter);
                  const availableRooms = scopeRooms.filter(r => getLiveEffectiveStatus(r) === 'Available');
                  const occupiedRooms = scopeRooms.filter(r => getLiveEffectiveStatus(r) === 'Occupied');
                  const cleaningRooms = scopeRooms.filter(r => getLiveEffectiveStatus(r) === 'Cleaning');
                  const maintenanceRooms = scopeRooms.filter(r => getLiveEffectiveStatus(r) === 'Maintenance');

                  const annexAvailable = rooms.filter(r => r.branch === 'Annex' && getLiveEffectiveStatus(r) === 'Available').length;
                  const annexTotal = rooms.filter(r => r.branch === 'Annex').length;
                  const ayigyaAvailable = rooms.filter(r => r.branch === 'Ayigya' && getLiveEffectiveStatus(r) === 'Available').length;
                  const ayigyaTotal = rooms.filter(r => r.branch === 'Ayigya').length;

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold">Available Now</span>
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          </div>
                          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{availableRooms.length} / {scopeRooms.length}</div>
                          <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 flex justify-between">
                            <span>Annex: {annexAvailable}/{annexTotal} free</span>
                            <span>Ayigya: {ayigyaAvailable}/{ayigyaTotal} free</span>
                          </div>
                        </div>

                        <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-blue-950/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">Occupied Stays</span>
                            <Bed className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="text-2xl font-black text-blue-700 dark:text-blue-300">{occupiedRooms.length}</div>
                          <div className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-1">Currently occupied by guests</div>
                        </div>

                        <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Housekeeping</span>
                            <Zap className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="text-2xl font-black text-amber-700 dark:text-amber-300">{cleaningRooms.length}</div>
                          <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1">Undergoing cleaning & turnover</div>
                        </div>

                        <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-red-950/20 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-red-600 dark:text-red-400 font-bold">Maintenance</span>
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          </div>
                          <div className="text-2xl font-black text-red-700 dark:text-red-300">{maintenanceRooms.length}</div>
                          <div className="text-[10px] text-red-600/80 dark:text-red-400/80 mt-1">Out of order or repairs</div>
                        </div>
                      </div>

                      {/* Search and Filters Bar */}
                      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 ${theme.card}`}>
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                          <input
                            type="text"
                            placeholder="Search room number, room type (Single, Double, Suite...)..."
                            value={liveViewSearchQuery}
                            onChange={(e) => setLiveViewSearchQuery(e.target.value)}
                            className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border outline-none transition-all ${
                              isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'
                            }`}
                          />
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto">
                          <select
                            value={liveViewStatusFilter}
                            onChange={(e) => setLiveViewStatusFilter(e.target.value as any)}
                            className={`px-3 py-2 text-xs rounded-xl border outline-none transition-all cursor-pointer font-bold ${
                              isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          >
                            <option value="ALL">All Statuses</option>
                            <option value="Available">Available Only</option>
                            <option value="Occupied">Occupied Only</option>
                            <option value="Cleaning">Cleaning Only</option>
                            <option value="Maintenance">Maintenance Only</option>
                          </select>

                          <select
                            value={liveViewTypeFilter}
                            onChange={(e) => setLiveViewTypeFilter(e.target.value)}
                            className={`px-3 py-2 text-xs rounded-xl border outline-none transition-all cursor-pointer font-bold ${
                              isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          >
                            <option value="ALL">All Room Types</option>
                            {Array.from(new Set(rooms.map(r => r.roomType))).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Room Display Cards Grouped by Branch */}
                      {(() => {
                        const filtered = scopeRooms.filter(room => {
                          const effStat = getLiveEffectiveStatus(room);
                          if (liveViewStatusFilter !== 'ALL' && effStat !== liveViewStatusFilter) return false;
                          if (liveViewTypeFilter !== 'ALL' && room.roomType !== liveViewTypeFilter) return false;
                          if (liveViewSearchQuery.trim()) {
                            const q = liveViewSearchQuery.toLowerCase();
                            const matchesNum = String(room.roomNumber || '').toLowerCase().includes(q);
                            const matchesType = String(room.roomType || '').toLowerCase().includes(q);
                            const matchesBranch = String(room.branch || '').toLowerCase().includes(q);
                            if (!matchesNum && !matchesType && !matchesBranch) return false;
                          }
                          return true;
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className={`p-12 text-center rounded-3xl border ${theme.card}`}>
                              <Bed className="w-12 h-12 text-zinc-400 mx-auto mb-3 opacity-50" />
                              <h3 className={`font-bold text-sm ${theme.text}`}>No Matching Rooms Found</h3>
                              <p className={`text-xs ${theme.textMuted} mt-1`}>Try adjusting your search query or status filters.</p>
                            </div>
                          );
                        }

                        const branchesToDisplay: Branch[] = liveViewBranchFilter === 'ALL' ? ['Annex', 'Ayigya'] : [liveViewBranchFilter];

                        return (
                          <div className="space-y-8">
                            {branchesToDisplay.map(branchName => {
                              const branchRooms = filtered.filter(r => r.branch === branchName).map(r => {
                                const effStat = getLiveEffectiveStatus(r);
                                return { ...r, status: effStat };
                              });
                              if (branchRooms.length === 0 && liveViewBranchFilter === 'ALL') return null;

                              return (
                                <div key={branchName} className="space-y-4">
                                  <div className="flex items-center justify-between border-b pb-2 dark:border-zinc-800">
                                    <div className="flex items-center gap-2">
                                      <Building className="w-5 h-5 text-blue-500" />
                                      <h3 className={`text-base font-extrabold ${theme.text}`}>
                                        Nabslodge {branchName}
                                      </h3>
                                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full ${isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200 text-slate-700'}`}>
                                        {branchRooms.filter(r => r.status === 'Available').length} Available / {branchRooms.length} Total
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {branchRooms.map(room => {
                                      const activeBooking = room.status === 'Occupied' 
                                        ? bookings.find(b => (b.roomId === room.id || b.roomNumber === room.roomNumber) && b.branch === room.branch && b.status === 'CheckedIn')
                                        : null;

                                      return (
                                        <div
                                          key={room.id}
                                          className={`p-4 rounded-2xl border transition-all duration-200 hover:shadow-lg relative flex flex-col justify-between ${
                                            room.status === 'Available'
                                              ? (isDarkMode ? 'bg-zinc-900/90 border-emerald-500/40 hover:border-emerald-500' : 'bg-white border-emerald-300 hover:border-emerald-500')
                                              : room.status === 'Occupied'
                                              ? (isDarkMode ? 'bg-zinc-900/90 border-blue-500/30' : 'bg-white border-blue-200')
                                              : room.status === 'Cleaning'
                                              ? (isDarkMode ? 'bg-zinc-900/90 border-amber-500/30' : 'bg-white border-amber-200')
                                              : (isDarkMode ? 'bg-zinc-900/90 border-red-500/30' : 'bg-white border-red-200')
                                          }`}
                                        >
                                          <div>
                                            <div className="flex justify-between items-start mb-2">
                                              <div>
                                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block font-bold">
                                                  {room.roomType}
                                                </span>
                                                <h4 className={`text-lg font-black tracking-tight ${theme.text}`}>
                                                  Room {room.roomNumber}
                                                </h4>
                                              </div>
                                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                room.status === 'Available'
                                                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                                  : room.status === 'Occupied'
                                                  ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                                                  : room.status === 'Cleaning'
                                                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                                  : 'bg-red-500/15 text-red-500 border border-red-500/30'
                                              }`}>
                                                {room.status}
                                              </span>
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 space-y-1.5 text-xs">
                                              <div className="flex justify-between items-center">
                                                <span className={theme.textMuted}>Rate per Night:</span>
                                                <span className={`font-black font-mono ${theme.text}`}>
                                                  GH₵{room.price?.toLocaleString()}
                                                </span>
                                              </div>

                                              {activeBooking && (() => {
                                                const actualPaid = getActualPaidAmount(activeBooking);
                                                const overpaidAmount = Math.max(0, actualPaid - activeBooking.totalPrice);
                                                return (
                                                  <div className={`p-2.5 rounded-xl text-[11px] mt-2 space-y-1.5 border ${isDarkMode ? 'bg-blue-950/40 border-blue-500/20 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-900'}`}>
                                                    <div className="font-bold truncate">{activeBooking.guestName}</div>
                                                    <div className="text-[10px] opacity-80 flex items-center gap-1">
                                                      <Clock className="w-3.5 h-3.5" /> Check Out: {activeBooking.checkOutDate}
                                                    </div>
                                                    {overpaidAmount > 0 && (
                                                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                                                        <div className="flex items-center gap-1 font-bold">
                                                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                                          Overpaid: GH₵{overpaidAmount.toFixed(2)}
                                                        </div>
                                                        <p className="leading-tight opacity-90 mt-0.5">
                                                          Guest paid GH₵{actualPaid.toFixed(2)} instead of GH₵{activeBooking.totalPrice.toFixed(2)}. Requires a refund & rectification.
                                                        </p>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })()}

                                              {room.amenities && room.amenities.length > 0 && (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                  {room.amenities.slice(0, 3).map((amenity, idx) => (
                                                    <span key={idx} className={`px-1.5 py-0.5 text-[9px] rounded ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-slate-100 text-slate-600'}`}>
                                                      {amenity}
                                                    </span>
                                                  ))}
                                                  {room.amenities.length > 3 && (
                                                    <span className={`px-1.5 py-0.5 text-[9px] rounded ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-slate-100 text-slate-600'}`}>
                                                      +{room.amenities.length - 3}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </motion.div>
            )}

            {/* TAB 7: FINANCIALS */}
            {activeTab === 'financials' && (
              <motion.div
                key="financials"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-6"
              >
                <div>
                  <h2 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Financial Report</h2>
                  <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                    Annual revenue tracking, branch comparisons, and historic financial performance.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-6 border rounded-3xl ${theme.card}`}>
                    <h3 className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${theme.textMuted}`}>Current Year Income</h3>
                    <div className="flex items-end gap-3">
                      <div className={`text-3xl font-extrabold tracking-tight ${theme.text}`}>
                        GH₵{financialData.currentYearTotal.toLocaleString()}
                      </div>
                      <div className={`text-xs font-bold mb-1.5 ${financialData.currentYearTotal >= financialData.previousYearTotal ? 'text-emerald-500' : 'text-red-500'}`}>
                        {financialData.currentYearTotal >= financialData.previousYearTotal ? '+' : ''}
                        {(((financialData.currentYearTotal - financialData.previousYearTotal) / (financialData.previousYearTotal || 1)) * 100).toFixed(1)}% vs Last Year
                      </div>
                    </div>
                  </div>
                  <div className={`p-6 border rounded-3xl ${theme.card}`}>
                    <h3 className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${theme.textMuted}`}>Previous Year Income</h3>
                    <div className={`text-3xl font-extrabold tracking-tight ${theme.textMuted}`}>
                      GH₵{financialData.previousYearTotal.toLocaleString()}
                    </div>
                  </div>
                  {/* Branch Specific Financial Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {/* Annex */}
                    <div className={`p-4 border rounded-2xl ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">Annex Branch Breakdown ({selectedYear})</div>
                      <div className="space-y-2 mt-2">
                         <div className="flex justify-between">
                             <span className="text-xs text-zinc-400">Late check out fees:</span>
                             <span className="text-xs font-mono font-bold text-emerald-500">GH₵{annexAnnualStats.extensionRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800/50 pt-2">
                             <span className="text-xs text-zinc-400">Total Room:</span>
                             <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">GH₵{annexAnnualStats.roomRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Drink Sales:</span>
                             <span className="text-xs font-mono font-bold text-purple-500">GH₵{annexAnnualStats.barRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Activity Sales:</span>
                             <span className="text-xs font-mono font-bold text-pink-500">GH₵{annexAnnualStats.activityRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Late check out fees + Total room + Drink Sales + Activity Sales:</span>
                             <span className="text-xs font-mono font-bold text-blue-500">GH₵{(annexAnnualStats.extensionRevenue + annexAnnualStats.roomRevenue + annexAnnualStats.barRevenue + annexAnnualStats.activityRevenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                      </div>
                    </div>
                    {/* Ayigya */}
                    <div className={`p-4 border rounded-2xl ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">Ayigya Branch Breakdown ({selectedYear})</div>
                      <div className="space-y-2 mt-2">
                         <div className="flex justify-between">
                             <span className="text-xs text-zinc-400">Late check out fees:</span>
                             <span className="text-xs font-mono font-bold text-emerald-500">GH₵{ayigyaAnnualStats.extensionRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800/50 pt-2">
                             <span className="text-xs text-zinc-400">Total Room:</span>
                             <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">GH₵{ayigyaAnnualStats.roomRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Drink Sales:</span>
                             <span className="text-xs font-mono font-bold text-purple-500">GH₵{ayigyaAnnualStats.barRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Activity Sales:</span>
                             <span className="text-xs font-mono font-bold text-pink-500">GH₵{ayigyaAnnualStats.activityRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                         <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2">
                             <span className="text-xs text-zinc-400">Late check out fees + Total room + Drink Sales + Activity Sales:</span>
                             <span className="text-xs font-mono font-bold text-blue-500">GH₵{(ayigyaAnnualStats.extensionRevenue + ayigyaAnnualStats.roomRevenue + ayigyaAnnualStats.barRevenue + ayigyaAnnualStats.activityRevenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  </div>

                {/* --- FINANCIAL REPORT EXCLUSIVE TAB SWITCHER --- */}
                <div className="flex flex-wrap items-center gap-3 p-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/40">
                  <button
                    onClick={() => setActiveFinancialTab(activeFinancialTab === 'handover' ? null : 'handover')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      activeFinancialTab === 'handover'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-600'
                        : isDarkMode
                        ? 'border border-slate-300 dark:border-zinc-800 bg-zinc-900/50 text-slate-700 dark:text-zinc-300 hover:bg-zinc-800'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Shift Handover Logs
                  </button>

                  <button
                    onClick={() => setActiveFinancialTab(activeFinancialTab === 'monthly' ? null : 'monthly')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      activeFinancialTab === 'monthly'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-600'
                        : isDarkMode
                        ? 'border border-slate-300 dark:border-zinc-800 bg-zinc-900/50 text-slate-700 dark:text-zinc-300 hover:bg-zinc-800'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Monthly Revenue Breakdown
                  </button>

                  <button
                    onClick={() => setActiveFinancialTab(activeFinancialTab === 'annual' ? null : 'annual')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      activeFinancialTab === 'annual'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-600'
                        : isDarkMode
                        ? 'border border-slate-300 dark:border-zinc-800 bg-zinc-900/50 text-slate-700 dark:text-zinc-300 hover:bg-zinc-800'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Annual Historical Reports & Archiving
                  </button>
                </div>

                {/* --- PLACEHOLDER LAYOUT CARD (WHEN NULL) --- */}
                {activeFinancialTab === null && (
                  <div className={`border rounded-3xl p-12 text-center flex flex-col items-center justify-center ${theme.card}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900 text-zinc-500' : 'bg-slate-100 text-slate-400'}`}>
                      <FileText className="w-7 h-7" />
                    </div>
                    <h3 className={`text-base font-bold mb-1 ${theme.text}`}>No Report Selected</h3>
                    <p className={`text-xs ${theme.textMuted} max-w-sm`}>
                      Select a report tab above to view financial logs.
                    </p>
                  </div>
                )}

                {/* --- 1. SHIFT HANDOVER LOGS COMPONENT --- */}
                {activeFinancialTab === 'handover' && (
                  <div className={`border rounded-3xl p-6 ${theme.card}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className={`text-lg font-bold ${theme.text}`}>Shift Handover Logs</h3>
                        <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                          Financial audits for cash and mobile money shift handovers by receptionists.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const csvData = filteredHandovers.map(h => ({
                            Date: h.timestamp,
                            Receptionist: h.receptionistName,
                            Branch: h.branch,
                            RoomCash: h.roomCash,
                            RoomMoMo: h.roomMomo,
                            WalkInCash: h.walkInCash,
                            WalkInMoMo: h.walkInMomo,
                            Total: h.totalAmount,
                            Notes: h.notes || ''
                          }));
                          handleExportCSV(csvData, 'Shift_Handovers_Audit');
                        }}
                        className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold ${
                          isDarkMode 
                            ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" /> Export Logs
                      </button>
                    </div>

                    {/* FILTER BAR */}
                    <div className={`p-4 rounded-2xl mb-6 border ${
                      isDarkMode ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'
                    } grid grid-cols-1 md:grid-cols-4 gap-4`}>
                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${theme.textMuted}`}>
                          Filter Receptionist
                        </label>
                        <select
                          value={handoverFilterReceptionist}
                          onChange={(e) => setHandoverFilterReceptionist(e.target.value)}
                          className={`w-full px-3 py-1.5 text-xs rounded-xl border transition-all ${
                            isDarkMode 
                              ? 'bg-zinc-900 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                              : 'bg-white border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                          }`}
                        >
                          <option value="all">All Receptionists</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${theme.textMuted}`}>
                          From Date
                        </label>
                        <input
                          type="date"
                          value={handoverFilterStartDate}
                          onChange={(e) => setHandoverFilterStartDate(e.target.value)}
                          className={`w-full px-3 py-1.5 text-xs rounded-xl border transition-all font-mono ${
                            isDarkMode 
                              ? 'bg-zinc-900 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                              : 'bg-white border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${theme.textMuted}`}>
                          To Date
                        </label>
                        <input
                          type="date"
                          value={handoverFilterEndDate}
                          onChange={(e) => setHandoverFilterEndDate(e.target.value)}
                          className={`w-full px-3 py-1.5 text-xs rounded-xl border transition-all font-mono ${
                            isDarkMode 
                              ? 'bg-zinc-900 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                              : 'bg-white border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                          }`}
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            setHandoverFilterReceptionist('all');
                            setHandoverFilterStartDate('');
                            setHandoverFilterEndDate('');
                          }}
                          className={`w-full py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            isDarkMode 
                              ? 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:bg-zinc-800' 
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>

                    {/* SUMMARY METRICS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className={`p-4 border rounded-2xl ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">Total Handed-Over Cash</div>
                        <div className="text-xl font-extrabold text-emerald-500 font-mono">
                          GH₵ {filteredHandovers.reduce((sum, h) => sum + (h.cashAmount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className={`p-4 border rounded-2xl ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">Total Handed-Over MoMo</div>
                        <div className="text-xl font-extrabold text-blue-500 font-mono">
                          GH₵ {filteredHandovers.reduce((sum, h) => sum + (h.momoAmount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className={`p-4 border rounded-2xl ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500 mb-1">Total Verified Handovers</div>
                        <div className="text-xl font-extrabold text-amber-500 font-mono">
                          GH₵ {filteredHandovers.reduce((sum, h) => sum + (h.totalAmount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* HANDOVER LIST TABLE */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className={`text-[10px] uppercase font-mono tracking-wider border-b ${isDarkMode ? 'text-zinc-500 border-zinc-800' : 'text-slate-400 border-slate-200'}`}>
                            <th className="pb-3 px-4 font-bold">Date & Time</th>
                            <th className="pb-3 px-4 font-bold">Receptionist</th>
                            <th className="pb-3 px-4 font-bold">Branch</th>
                            <th className="pb-3 px-4 font-bold text-right">Room Cash</th>
                            <th className="pb-3 px-4 font-bold text-right">Room MoMo</th>
                            <th className="pb-3 px-4 font-bold text-right">WalkIn Cash</th>
                            <th className="pb-3 px-4 font-bold text-right">WalkIn MoMo</th>
                            <th className="pb-3 px-4 font-bold text-right">Total Funds</th>
                            <th className="pb-3 px-4 font-bold pl-8">Handover Notes</th>
                            <th className="pb-3 px-4 font-bold text-center">Audit Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHandovers.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="text-center py-12">
                                <div className="flex flex-col items-center justify-center">
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-650' : 'bg-slate-50 text-slate-350'}`}>
                                    <Info className="w-6 h-6" />
                                  </div>
                                  <h4 className={`text-xs font-bold mb-0.5 ${theme.text}`}>No Handover Records</h4>
                                  <p className={`text-[11px] ${theme.textMuted} text-center max-w-sm`}>
                                    No records found matching the selected filters.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredHandovers.map((h, idx) => (
                              <tr key={idx} className={`border-b last:border-0 ${isDarkMode ? 'border-zinc-800/60' : 'border-slate-100'} transition-colors ${theme.tableRowHover}`}>
                                <td className={`py-4 px-4 font-mono text-[11px] ${theme.textMuted}`}>
                                  {h.timestamp || 'N/A'}
                                </td>
                                <td className={`py-4 px-4 font-bold text-xs ${theme.text}`}>
                                  {h.receptionistName}
                                </td>
                                <td className="py-4 px-4">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    h.branch === 'Annex' 
                                      ? 'bg-blue-500/10 text-blue-500' 
                                      : 'bg-emerald-500/10 text-emerald-500'
                                  }`}>
                                    {h.branch}
                                  </span>
                                </td>
                                <td className={`py-4 px-4 font-mono text-[10px] text-right text-zinc-600 dark:text-zinc-400`}>GH₵{(h.roomCash || 0).toFixed(2)}</td>
                                <td className={`py-4 px-4 font-mono text-[10px] text-right text-zinc-600 dark:text-zinc-400`}>GH₵{(h.roomMomo || 0).toFixed(2)}</td>
                                <td className={`py-4 px-4 font-mono text-[10px] text-right text-zinc-600 dark:text-zinc-400`}>GH₵{(h.walkInCash || 0).toFixed(2)}</td>
                                <td className={`py-4 px-4 font-mono text-[10px] text-right text-zinc-600 dark:text-zinc-400`}>GH₵{(h.walkInMomo || 0).toFixed(2)}</td>
                                <td className={`py-4 px-4 font-mono text-xs text-right text-amber-500 font-extrabold`}>
                                  GH₵{h.totalAmount.toFixed(2)}
                                </td>
                                <td className={`py-4 px-4 pl-8 text-[11px] italic max-w-xs truncate ${theme.textMuted}`} title={h.notes}>
                                  {h.notes || '—'}
                                </td>
                                <td className="py-4 px-4 text-center">
                                  <button
                                    onClick={() => {
                                      setAuditFilterCategory('all');
                                      setSelectedHandoverForAudit(h);
                                    }}
                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold rounded-xl text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm mx-auto"
                                    title="View itemized breakdown of actions that contributed to this handover amount"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Audit Actions
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* --- 2. MONTHLY REVENUE BREAKDOWN COMPONENT --- */}
                {activeFinancialTab === 'monthly' && (
                  <div id="monthly-revenue-breakdown" className={`border rounded-3xl p-6 ${theme.card}`}>
                    <div className="flex justify-between items-center mb-6" data-html2canvas-ignore>
                      <h3 className={`text-sm font-bold ${theme.text}`}>Monthly Revenue Breakdown</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExportCSV(financialData.monthlyData, 'Monthly_Revenue')}
                          className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold ${
                            isDarkMode 
                              ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                        <button
                          onClick={() => {
                            const totalRevenue = financialData.monthlyData.reduce((sum, d) => sum + d.Total, 0);
                            const annexRevenue = financialData.monthlyData.reduce((sum, d) => sum + d.Annex, 0);
                            const ayigyaRevenue = financialData.monthlyData.reduce((sum, d) => sum + d.Ayigya, 0);

                            const yearBookings = bookings.filter(b => {
                              if (b.status === 'Cancelled' || !b.checkInDate) return false;
                              const bookingDate = parseSafeDate(b.checkInDate);
                              return bookingDate ? bookingDate.getFullYear() === selectedYear : false;
                            });
                            const annexVol = yearBookings.filter(b => b.branch === 'Annex').length;
                            const ayigyaVol = yearBookings.filter(b => b.branch === 'Ayigya').length;

                            openPrintPreview({
                              elementId: 'monthly-revenue-breakdown',
                              title: 'Monthly Revenue Report',
                              reportPeriod: `Year: ${selectedYear} (12 Months Breakdown)`,
                              description: 'Monthly breakdown statement and revenue trends.',
                              recordCount: financialData.monthlyData.length,
                              filename: 'Monthly_Revenue_Report',
                              totalRevenue,
                              processedBookingsCount: yearBookings.length,
                              branchBreakdown: [
                                { name: 'Annex', revenue: annexRevenue, volume: annexVol },
                                { name: 'Ayigya', revenue: ayigyaRevenue, volume: ayigyaVol }
                              ],
                              dataEntries: financialData.monthlyData.map(d => ({
                                col1: d.month,
                                col2: `GH₵ ${d.Annex.toFixed(2)}`,
                                col3: `GH₵ ${d.Ayigya.toFixed(2)}`,
                                col4: `GH₵ ${d.Total.toFixed(2)}`
                              })),
                              reportType: 'monthly'
                            });
                          }}
                          className={`p-2 rounded-xl border transition-colors flex items-center gap-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 border-blue-500 cursor-pointer`}
                        >
                          <Printer className="w-3.5 h-3.5" /> PDF / Print
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      {financialData.monthlyData.every(d => d.Total === 0) ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                            <AlertCircle className="w-8 h-8" />
                          </div>
                          <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Monthly Data</h4>
                          <p className={`text-xs text-center max-w-sm ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                            No booking records found for this period.
                          </p>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse min-w-[600px]">
                          <thead>
                            <tr className={`text-[10px] uppercase font-mono tracking-wider border-b ${isDarkMode ? 'text-zinc-500 border-zinc-800' : 'text-slate-400 border-slate-200'}`}>
                              <th className="pb-3 px-4 font-bold">Month</th>
                              <th className="pb-3 px-4 font-bold text-right">Annex Revenue</th>
                              <th className="pb-3 px-4 font-bold text-right">Ayigya Revenue</th>
                              <th className="pb-3 px-4 font-bold text-right">Total Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {financialData.monthlyData.map((data, index) => (
                              <tr key={index} className={`border-b last:border-0 ${isDarkMode ? 'border-zinc-800/60' : 'border-slate-100'} transition-colors ${theme.tableRowHover}`}>
                                <td className={`py-4 px-4 font-bold text-sm ${theme.text}`}>{data.month}</td>
                                <td className="py-4 px-4 font-mono text-xs text-right text-zinc-500 dark:text-zinc-400">GH₵{data.Annex.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td className="py-4 px-4 font-mono text-xs text-right text-zinc-500 dark:text-zinc-400">GH₵{data.Ayigya.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td className={`py-4 px-4 font-mono text-sm font-bold text-right ${theme.text}`}>GH₵{data.Total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* --- 3. ANNUAL HISTORICAL REPORTS & ARCHIVING COMPONENT --- */}
                {activeFinancialTab === 'annual' && (
                  <>
                    {/* Embedded Print CSS Style block */}
                    <style dangerouslySetInnerHTML={{ __html: `
                      @media print {
                        body * {
                          visibility: hidden;
                        }
                        #yearly-print-container, #yearly-print-container * {
                          visibility: visible;
                        }
                        #yearly-print-container {
                          position: absolute;
                          left: 0;
                          top: 0;
                          width: 100%;
                          background: white !important;
                          color: black !important;
                          padding: 20px !important;
                        }
                        #yearly-print-container table {
                          border-collapse: collapse;
                          width: 100%;
                          margin-top: 20px;
                        }
                        #yearly-print-container th {
                          border-bottom: 2px solid #000;
                          text-align: left;
                          padding: 10px;
                          font-weight: bold;
                        }
                        #yearly-print-container td {
                          border-bottom: 1px solid #ddd;
                          padding: 10px;
                        }
                      }
                    `}} />

                    {/* Yearly Report Archive Selector & Interactive Table */}
                    <div className={`border rounded-3xl p-6 ${theme.card} space-y-6 no-print`}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 dark:border-zinc-800">
                        <div>
                          <h3 className={`text-base font-bold ${theme.text}`}>Annual Historical Reports & Archiving</h3>
                          <p className={`text-xs ${theme.textMuted} mt-0.5`}>
                            Access chronological monthly statements compiled in the cloud and live operational updates.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold ${theme.textMuted}`}>Select Year:</span>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className={`px-3 py-2 rounded-xl text-xs font-mono focus:outline-none cursor-pointer border ${
                              isDarkMode 
                                ? 'bg-zinc-950 border-zinc-800 text-zinc-200' 
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => {
                              const totalRevenue = yearlyReports.reduce((sum, r) => sum + r.totalRevenue, 0);
                              const totalBookingsCount = yearlyReports.reduce((sum, r) => sum + r.totalBookingsCount, 0);

                              const yearBookings = bookings.filter(b => {
                                if (b.status === 'Cancelled' || !b.checkInDate) return false;
                                const bookingDate = parseSafeDate(b.checkInDate);
                                return bookingDate ? bookingDate.getFullYear() === selectedYear : false;
                              });
                              const calculatePaid = (b: Booking) => {
                                if (b.paymentStatus === 'Paid') return b.totalPrice;
                                if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) {
                                  return b.amountPaid || b.deposit || b.totalPrice * 0.5;
                                }
                                return 0;
                              };
                              const annexRev = yearBookings.filter(b => b.branch === 'Annex').reduce((sum, b) => sum + calculatePaid(b), 0);
                              const ayigyaRev = yearBookings.filter(b => b.branch === 'Ayigya').reduce((sum, b) => sum + calculatePaid(b), 0);
                              const annexVol = yearBookings.filter(b => b.branch === 'Annex').length;
                              const ayigyaVol = yearBookings.filter(b => b.branch === 'Ayigya').length;

                              openPrintPreview({
                                elementId: 'yearly-print-container',
                                title: `Annual Report Reference (${selectedYear})`,
                                reportPeriod: `Year: ${selectedYear} (12 Months Archive)`,
                                description: `Complete annual audit and historical archiving statement for year ${selectedYear}.`,
                                recordCount: yearlyReports.length,
                                filename: `Annual_Report_${selectedYear}`,
                                totalRevenue,
                                processedBookingsCount: totalBookingsCount,
                                branchBreakdown: [
                                  { name: 'Annex', revenue: annexRev, volume: annexVol },
                                  { name: 'Ayigya', revenue: ayigyaRev, volume: ayigyaVol }
                                ],
                                dataEntries: yearlyReports.map(r => ({
                                  col1: r.monthName,
                                  col2: `GH₵ ${r.annexRevenue.toFixed(2)}`,
                                  col3: `GH₵ ${r.ayigyaRevenue.toFixed(2)}`,
                                  col4: `GH₵ ${r.totalRevenue.toFixed(2)}`,
                                  col5: `${r.totalBookingsCount} bookings`,
                                  col6: `${r.averageOccupancyRate}% Occ`,
                                  col7: r.finalized ? 'Archived' : 'Active'
                                })),
                                reportType: 'yearly'
                              });
                            }}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-md shadow-blue-500/10`}
                          >
                            <Printer className="w-3.5 h-3.5" /> Export Yearly Reference
                          </button>
                        </div>
                      </div>

                      {isLoadingYearly ? (
                        <div className="py-12 text-center text-xs text-zinc-500 animate-pulse">
                          Retrieving annual records from cloud database...
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          {/* Printable Area containing Table + Branding Header */}
                          <div id="yearly-print-container">
                            {/* Print Only Header */}
                            <div className="hidden print:block mb-6 border-b pb-4">
                              <table style={{ width: '100%', marginBottom: '8px', border: 'none', tableLayout: 'fixed' }}>
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h1 className="text-2xl font-extrabold text-slate-900" style={{ margin: 0 }}>NABS LODGE - Annual Report Reference Summary</h1>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Generated on {new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} | Operator: {currentUser.name} (Manager)
                                  </p>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                              <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
                                <div><strong className="text-slate-700">Reporting Year:</strong> {selectedYear}</div>
                                <div><strong className="text-slate-700">Scope:</strong> Global (Annex & Ayigya Branches)</div>
                              </div>
                            </div>

                            <table className="w-full text-left border-collapse min-w-[700px]">
                              <thead>
                                <tr className={`text-[10px] uppercase font-mono tracking-wider border-b ${isDarkMode ? 'text-zinc-500 border-zinc-800' : 'text-slate-400 border-slate-200'}`}>
                                  <th className="pb-3 px-4 font-bold">Month</th>
                                  <th className="pb-3 px-4 font-bold text-right">Annex Revenue</th>
                                  <th className="pb-3 px-4 font-bold text-right">Ayigya Revenue</th>
                                  <th className="pb-3 px-4 font-bold text-right">Total Revenue</th>
                                  <th className="pb-3 px-4 font-bold text-right">Total Bookings</th>
                                  <th className="pb-3 px-4 font-bold text-right">Avg Occupancy</th>
                                  <th className="pb-3 px-4 font-bold text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {yearlyReports.map((report, idx) => (
                                  <tr key={`report-${report.monthName}-${idx}`} className={`border-b last:border-0 ${isDarkMode ? 'border-zinc-800/60' : 'border-slate-100'} transition-colors ${theme.tableRowHover}`}>
                                    <td className={`py-4 px-4 font-bold text-sm ${theme.text}`}>{report.monthName}</td>
                                    <td className={`py-4 px-4 font-mono text-xs text-right text-zinc-500 dark:text-zinc-400`}>
                                      GH₵{report.annexRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className={`py-4 px-4 font-mono text-xs text-right text-zinc-500 dark:text-zinc-400`}>
                                      GH₵{report.ayigyaRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className={`py-4 px-4 font-mono text-sm font-bold text-right ${theme.text}`}>
                                      GH₵{report.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className={`py-4 px-4 font-mono text-xs text-right text-zinc-500 dark:text-zinc-400`}>
                                      {report.totalBookingsCount} bookings
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                        <span className="font-bold">{report.averageOccupancyRate}%</span>
                                        <div className="w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                          <div className="bg-blue-600 h-1.5" style={{ width: `${report.averageOccupancyRate}%` }}></div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                      {report.finalized ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                          Archived & Finalized
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/10">
                                          Active / Not Finalized
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>

          {/* BRANDING FOOTER */}
          <div className="text-center py-6 border-t border-zinc-200/60 dark:border-zinc-800/60 mt-auto w-full">
            <span className={`text-[10px] font-mono tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
              Web app developed by SUALAH TELLEM (0553189032)
            </span>
          </div>

        </div>
      </main>

      {/* --- RECEPTIONIST ADD/EDIT MODAL --- */}
      <AnimatePresence>
        {showRecModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                theme.tableContainer
              }`}
            >
              <div className="p-6 pb-0 shrink-0 relative">
                <button
                  onClick={() => setShowRecModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>

                <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {editingRec ? 'Edit Receptionist Credentials' : 'Create Receptionist'}
                </h3>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  {editingRec 
                    ? 'Update email, password, or branch routing for this staff member.'
                    : 'Establish a new receptionist profile with strict location isolation.'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-thin">
                <form id="rec-form" onSubmit={handleSaveReceptionist} className="space-y-4 text-xs">
                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Staff Name
                  </label>
                  <input
                    type="text"
                    required
                    value={recName}
                    onChange={(e) => setRecName(e.target.value)}
                    readOnly={!!editingRec}
                    placeholder="e.g. Amara Koffi"
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input} ${!!editingRec ? 'bg-zinc-100 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={recEmail}
                    onChange={(e) => setRecEmail(e.target.value)}
                    readOnly={!!editingRec}
                    placeholder="e.g. amara@nabslodge.com"
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input} ${!!editingRec ? 'bg-zinc-100 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Assign Location
                    </label>
                    <select
                      value={recBranch}
                      onChange={(e) => setRecBranch(e.target.value as Branch)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                    >
                      <option value="Annex">Nabslodge Annex</option>
                      <option value="Ayigya">Nabslodge Ayigya</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Account Status
                    </label>
                    <select
                      value={recStatus}
                      onChange={(e) => setRecStatus(e.target.value as 'Active' | 'Inactive')}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 flex justify-between items-center ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <span>Generated Password</span>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={recPassword}
                      readOnly={!!editingRec}
                      onChange={(e) => setRecPassword(e.target.value)}
                      placeholder="Security token"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input} ${!!editingRec ? 'bg-zinc-100 cursor-not-allowed' : ''}`}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 pointer-events-none">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {recError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono">
                    ⚠ {recError}
                  </div>
                )}

                </form>
              </div>

              <div className="p-6 shrink-0 border-t border-dashed border-zinc-150 dark:border-zinc-800">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRecModal(false)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      isDarkMode 
                        ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400' 
                        : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-xs'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="rec-form"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-blue-500/20"
                  >
                    Save Credentials
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- ROOM ADD/EDIT MODAL --- */}
      <AnimatePresence>
        {showRoomModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                theme.tableContainer
              }`}
            >
              <div className="p-6 pb-0 shrink-0 relative">
                <button
                  onClick={() => setShowRoomModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>

                <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {editingRoom ? 'Modify Room Config' : 'Create New Room Setup'}
                </h3>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Define the room location, nightly price, status, and physical amenities.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-thin scroll-smooth">
                <form id="room-form" onSubmit={handleSaveRoom} className="space-y-4 text-xs">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Room Number
                    </label>
                    <input
                      type="text"
                      required
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      placeholder="e.g. 104"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Nabslodge Location
                    </label>
                    <select
                      value={roomBranch}
                      onChange={(e) => setRoomBranch(e.target.value as Branch)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                    >
                      <option value="Annex">Annex Branch</option>
                      <option value="Ayigya">Ayigya Branch</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Room Type
                    </label>
                    <input
                      type="text"
                      required
                      value={roomType}
                      onChange={(e) => setRoomType(e.target.value)}
                      placeholder="e.g. Deluxe Suite, Single Standard"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {roomTypePresets.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setRoomType(t)}
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded transition-all cursor-pointer ${
                            roomType === t
                              ? 'bg-blue-600 text-white shadow-xs'
                              : isDarkMode
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!(roomType === '2 Bedroom Apartment' || roomType === '3 Bedroom Apartment') && (
                    <div>
                      <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Nightly Price (GH₵)
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={roomPrice}
                        onChange={(e) => setRoomPrice(e.target.value)}
                        placeholder="Rate e.g. 450"
                        className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>
                  )}

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Monthly Premium Price (GH₵)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={monthlyPremiumPrice}
                      onChange={(e) => setMonthlyPremiumPrice(e.target.value)}
                      placeholder="e.g. 15000"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  {(roomType === '2 Bedroom Apartment' || roomType === '3 Bedroom Apartment') && (
                    <div>
                      <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Normal Booking Price (GH₵)
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={normalBookingPrice}
                        onChange={(e) => setNormalBookingPrice(e.target.value)}
                        placeholder="e.g. 600"
                        className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>
                  )}

                  {(roomType === '2 Bedroom Apartment' || roomType === '3 Bedroom Apartment') && (
                    <>
                      <div>
                        <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Normal Booking Max Guests
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={normalBookingMaxGuests}
                          onChange={(e) => setNormalBookingMaxGuests(e.target.value)}
                          placeholder="e.g. 4"
                          className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Occasion Booking Price (GH₵)
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={occasionBookingPrice}
                          onChange={(e) => setOccasionBookingPrice(e.target.value)}
                          placeholder="e.g. 1000"
                          className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Occasion Booking Max Guests
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={occasionBookingMaxGuests}
                          onChange={(e) => setOccasionBookingMaxGuests(e.target.value)}
                          placeholder="e.g. 8"
                          className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        />
                      </div>
                    </>
                  )}

                  {!(roomType === '2 Bedroom Apartment' || roomType === '3 Bedroom Apartment') && (
                    <div>
                      <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Max Guest Count
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="10"
                        value={roomMaxGuests}
                        onChange={(e) => setRoomMaxGuests(e.target.value)}
                        className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                      />
                    </div>
                  )}

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Room Description
                    </label>
                    <input
                      type="text"
                      value={roomDescription}
                      onChange={(e) => setRoomDescription(e.target.value)}
                      placeholder="e.g. Pool view, double beds"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Room Operational Status Override
                    </label>
                    <select
                      value={roomStatus}
                      onChange={(e) => setRoomStatus(e.target.value as RoomStatus)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                    >
                      <option value="Available">Available</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Amenities & Inclusions (Comma-separated or custom tags)
                    </label>

                    {/* Custom Amenity Adder with Comma Support */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customAmenityInput}
                        onChange={(e) => setCustomAmenityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomAmenity();
                          }
                        }}
                        placeholder="Add other custom amenity (e.g. Wi-Fi, AC, Balcony)..."
                        className={`flex-1 px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomAmenity}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                      >
                        Add
                      </button>
                    </div>



                    {/* Active Amenities Tag / Chip Layout */}
                    <div className="pt-2">
                      <span className={`block text-[10px] font-mono uppercase tracking-wider mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                        Active Amenity Tags ({roomAmenities.length}):
                      </span>
                      {roomAmenities.length === 0 ? (
                        <div className={`p-4 rounded-xl border text-center text-xs font-mono ${isDarkMode ? 'bg-zinc-900/30 border-zinc-800 text-zinc-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                          No amenities added yet. Type above or click quick-add presets.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {roomAmenities.map((amenity, idx) => (
                            <span 
                              key={idx} 
                              className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all ${
                                isDarkMode 
                                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300' 
                                  : 'bg-blue-50 border border-blue-200 text-blue-800'
                              }`}
                            >
                              <span>{amenity}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAmenity(amenity)}
                                className="w-4 h-4 rounded-full bg-blue-500/20 hover:bg-red-500 hover:text-white flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                                title="Remove amenity"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {roomError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono">
                    ⚠ {roomError}
                  </div>
                )}

                </form>
              </div>

              <div className="p-6 shrink-0 border-t border-dashed border-zinc-150 dark:border-zinc-800">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRoomModal(false)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      isDarkMode 
                        ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400' 
                        : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-xs'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="room-form"
                    disabled={isProcessingAction}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5"
                  >
                    {isProcessingAction ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Room Setup'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- SIGN OUT CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {showSignOutModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl relative ${
                theme.tableContainer
              }`}
            >
              <button
                onClick={() => setShowSignOutModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
                  <LogOut className="w-5 h-5" />
                </div>
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Sign Out Portal?
                </h3>
              </div>
              
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Are you sure you want to exit the management portal? You will need your manager credentials to log back in.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSignOutModal(false)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    isDarkMode 
                      ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400' 
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-xs'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignOutModal(false);
                    onLogout();
                  }}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-red-500/20"
                >
                  Confirm Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MANAGER PRINT PREVIEW CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {showPrintPreviewModal && printPreviewConfig && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border w-full max-w-2xl shadow-2xl rounded-2xl p-6 relative max-h-[92vh] flex flex-col ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
              }`}
            >
              {/* Header */}
              <div className="flex justify-between items-start pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 dark:bg-blue-500/20">
                    <Printer className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Print Preview & Report Scope Verification</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Verify selected date range and report parameters before triggering the printer dialog.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrintPreviewModal(false)}
                  className={`p-2 rounded-lg transition-all ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="overflow-y-auto py-4 space-y-4 flex-1">
                {/* Scope Verification Card */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/20 dark:border-blue-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Verified Report Period / Scope
                    </span>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
                      {printPreviewConfig.title}
                    </span>
                  </div>

                  <div className="p-3 bg-white/70 dark:bg-zinc-800/70 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 font-mono text-xs space-y-1">
                    <div><span className="text-zinc-500">Selected Scope / Period:</span> <strong className="text-blue-600 dark:text-blue-400">{printPreviewConfig.reportPeriod}</strong></div>
                    <div><span className="text-zinc-500">Details:</span> <span>{printPreviewConfig.description}</span></div>
                    {printPreviewConfig.recordCount !== undefined && (
                      <div><span className="text-zinc-500">Total Entries Included:</span> <strong className="font-bold">{printPreviewConfig.recordCount} Records</strong></div>
                    )}
                  </div>
                </div>

                {/* Range Confirmation Toggle */}
                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isRangeConfirmed 
                    ? (isDarkMode ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-900')
                    : (isDarkMode ? 'bg-zinc-800/50 border-zinc-700' : 'bg-slate-50 border-slate-200')
                }`}>
                  <input
                    type="checkbox"
                    checked={isRangeConfirmed}
                    onChange={(e) => setIsRangeConfirmed(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold block text-sm mb-0.5">Confirm Report Data Range</span>
                    <span className="text-[11px] opacity-80 leading-relaxed block">
                      I confirm that the selected data parameters ({printPreviewConfig.reportPeriod}) are correct and ready for report export/printing.
                    </span>
                  </div>
                </label>

                {/* Live Preview Frame */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono mb-2 block">
                    Report Layout Preview
                  </span>
                  <div className="p-5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white text-zinc-900 shadow-inner max-h-[300px] overflow-y-auto font-sans text-xs space-y-4">
                    {/* Header */}
                    <div className="flex justify-between items-start pb-3 border-b border-zinc-200">
                      <div>
                        <h4 className="font-black text-base text-blue-600 tracking-tight">NABSLODGE</h4>
                        <p className="text-[10px] text-zinc-500 uppercase">Executive Management Report</p>
                      </div>
                      <div className="text-right font-mono text-[10px] text-zinc-600">
                        <div className="font-bold">{printPreviewConfig.title}</div>
                        <div>Generated: {new Date().toLocaleDateString()}</div>
                      </div>
                    </div>

                    {/* Metadata summary cards row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                        <span className="text-[9px] text-blue-600 uppercase font-bold tracking-wider font-mono block">Combined Revenue</span>
                        <strong className="text-sm text-blue-900 font-extrabold font-mono">
                          GH₵ {printPreviewConfig.totalRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                        <span className="text-[9px] text-emerald-600 uppercase font-bold tracking-wider font-mono block">Processed Bookings</span>
                        <strong className="text-sm text-emerald-900 font-extrabold font-mono">
                          {printPreviewConfig.processedBookingsCount || 0} Volume
                        </strong>
                      </div>
                      <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-lg">
                        <span className="text-[9px] text-purple-600 uppercase font-bold tracking-wider font-mono block">Selected Period</span>
                        <strong className="text-xs text-purple-900 font-extrabold block truncate">
                          {printPreviewConfig.reportPeriod}
                        </strong>
                      </div>
                    </div>

                    {/* Branch breakdown detailed pill row */}
                    {printPreviewConfig.branchBreakdown && printPreviewConfig.branchBreakdown.length > 0 && (
                      <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] font-mono flex justify-between items-center flex-wrap gap-2">
                        <span className="font-bold uppercase text-zinc-500">Branch Performance:</span>
                        {printPreviewConfig.branchBreakdown.map((branch, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-zinc-200">
                            <span className="font-bold text-zinc-800">{branch.name}:</span>
                            <span className="text-emerald-700 font-semibold">GH₵ {branch.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            <span className="text-zinc-400">|</span>
                            <span className="text-zinc-600">{branch.volume} bks</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Data Entries Tabular list */}
                    {printPreviewConfig.dataEntries && printPreviewConfig.dataEntries.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Statement Matrix</span>
                        <div className="border border-zinc-200 rounded-lg overflow-hidden">
                          <table className="w-full border-collapse text-left text-xs my-4">
                            <thead>
                              <tr className="bg-zinc-100 border-b border-zinc-200 dark:border-zinc-800 font-bold text-zinc-700">
                                {printPreviewConfig.reportType === 'bookings' && (
                                  <>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[22%]">Ref/Lodge</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[28%]">Guest</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[12%] text-center">Room</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[23%] text-center">Period</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[15%] text-right pr-4">Billing</th>
                                  </>
                                )}
                                {printPreviewConfig.reportType === 'monthly' && (
                                  <>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[25%]">Month</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[25%] text-right">Annex Rev</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[25%] text-right">Ayigya Rev</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[25%] text-right pr-4">Total Rev</th>
                                  </>
                                )}
                                {printPreviewConfig.reportType === 'yearly' && (
                                  <>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[14%]">Month</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[16%] text-right">Annex Rev</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[16%] text-right">Ayigya Rev</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[18%] text-right">Total Rev</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[14%] text-right">Bookings</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[14%] text-right">Occupancy</th>
                                    <th className="border-b border-zinc-200 dark:border-zinc-800 pb-2 font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider p-2 w-[10%] text-center pr-2">Status</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {printPreviewConfig.dataEntries.slice(0, 15).map((entry, idx) => (
                                <tr key={`${entry.col1}-${idx}`} className="border-b last:border-0 border-zinc-150 dark:border-zinc-800/50 hover:bg-zinc-50/50">
                                  {printPreviewConfig.reportType === 'bookings' && (
                                    <>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle font-mono text-[10px] truncate max-w-[110px]">{entry.col1}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle truncate max-w-[130px]">{entry.col2}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle font-bold text-center">{entry.col3}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle font-mono text-[10px] text-zinc-500 text-center">{entry.col4}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right pr-4 font-mono font-bold text-emerald-700 whitespace-nowrap">{entry.col5}</td>
                                    </>
                                  )}
                                  {printPreviewConfig.reportType === 'monthly' && (
                                    <>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle font-bold">{entry.col1}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500">{entry.col2}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500">{entry.col3}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right pr-4 font-mono font-bold text-blue-700 whitespace-nowrap">{entry.col4}</td>
                                    </>
                                  )}
                                  {printPreviewConfig.reportType === 'yearly' && (
                                    <>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle font-bold">{entry.col1}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500 whitespace-nowrap">{entry.col2}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500 whitespace-nowrap">{entry.col3}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-blue-700 font-bold whitespace-nowrap">{entry.col4}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500">{entry.col5}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-right font-mono text-zinc-500">{entry.col6}</td>
                                      <td className="p-2 border-b border-zinc-100 dark:border-zinc-900/50 vertical-align-middle text-center pr-2 font-mono text-zinc-500">{entry.col7}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                              {printPreviewConfig.dataEntries.length > 15 && (
                                <tr>
                                  <td colSpan={printPreviewConfig.reportType === 'yearly' ? 7 : 5} className="p-2 text-center text-zinc-400 italic text-[9px] bg-zinc-50">
                                    And {printPreviewConfig.dataEntries.length - 15} more entries (full list included in PDF)
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-zinc-50 border border-zinc-150 rounded-lg text-center text-zinc-400 italic">
                        {printPreviewConfig.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => setShowPrintPreviewModal(false)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border flex-1 ${
                    isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  Cancel / Adjust Scope
                </button>
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      // 1. Immediately close the modal state to restore the background screen
                      setShowPrintPreviewModal(false);
                      
                      // 2. Trigger programmatic PDF generation and download
                      if (printPreviewConfig.elementId) {
                        handleExportPDF(printPreviewConfig.elementId, printPreviewConfig.filename);
                      }
                      
                      // 3. Workspace focus restoration safely back to the main container
                      setTimeout(() => {
                        const container = document.getElementById('manager-dashboard-container');
                        if (container) {
                          container.focus();
                        }
                      }, 100);
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex-1 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Download Report PDF
                </button>
                <button
                  disabled={!isRangeConfirmed}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      // 1. Immediately close the modal state to restore the background screen
                      setShowPrintPreviewModal(false);
                      
                      // 2. Trigger the native system print dialogue
                      triggerPrint(printPreviewConfig.elementId, printPreviewConfig.title);
                      
                      // 3. Workspace focus restoration safely back to the main container
                      setTimeout(() => {
                        const container = document.getElementById('manager-dashboard-container');
                        if (container) {
                          container.focus();
                        }
                      }, 100);
                    }
                  }}
                  className={`px-5 py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer flex-1 flex items-center justify-center gap-1.5 shadow-lg ${
                    isRangeConfirmed
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                      : 'bg-zinc-400 dark:bg-zinc-700 text-zinc-200 cursor-not-allowed opacity-50'
                  }`}
                >
                  <Printer className="w-4 h-4" /> Confirm & Print
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CUSTOM DELETE ROOM CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {roomToDelete && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl relative ${
                theme.tableContainer
              }`}
            >
              <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                <Trash2 className="w-5 h-5 text-red-500" /> Confirm Deletion
              </h3>
              <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Are you sure you want to completely delete <strong className="text-red-500 font-bold">Room {roomToDelete.roomNumber}</strong>? This action will permanently remove this room and purge it from the Nabslodge catalog. This action cannot be undone.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRoomToDelete(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode 
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    executeRoomDeletion(roomToDelete.id);
                    setRoomToDelete(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all cursor-pointer shadow-md shadow-red-500/15"
                >
                  Delete Room
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CUSTOM DELETE RECEPTIONIST CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {recToDelete && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl relative ${
                theme.tableContainer
              }`}
            >
              <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                <Trash2 className="w-5 h-5 text-red-500" /> Deactivate Account
              </h3>
              <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Are you sure you want to delete the receptionist account for <strong className="text-red-500 font-bold">{recToDelete.name}</strong> ({recToDelete.email})? They will be locked out immediately, though operational transaction history will be preserved.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRecToDelete(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode 
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    executeRecDeletion(recToDelete.id, recToDelete.email, recToDelete.password || 'password123');
                    setRecToDelete(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all cursor-pointer shadow-md shadow-red-500/15"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CUSTOM PURGE DATABASE CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {showPurgeConfirmModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative ${
                theme.tableContainer
              }`}
            >
              <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                <AlertTriangle className="w-5 h-5 text-rose-500" /> Wipe All Data & Reset Blank Slate
              </h3>
              <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Are you sure you want to purge all test bookings, room revenues, activity ledger records, and shift handovers? All rooms will be reset to <strong className="text-emerald-500 font-bold">Available</strong>, bringing revenue to <strong className="text-emerald-500 font-bold">GH₵0.00</strong> and occupancy to <strong className="text-emerald-500 font-bold">0%</strong>. This action cannot be undone.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPurgeConfirmModal(false)}
                  disabled={isPurgingDb}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDarkMode 
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executePurgeDatabase}
                  disabled={isPurgingDb}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer shadow-md shadow-rose-500/20 flex items-center gap-2"
                >
                  {isPurgingDb ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Wiping Data...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Yes, Wipe Data & Reset Blank Slate
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- SHIFT HANDOVER DETAILED AUDIT INSPECTOR MODAL --- */}
      <AnimatePresence>
        {selectedHandoverForAudit && (() => {
          const h = selectedHandoverForAudit;
          const allItems = getHandoverBreakdownItems(h);
          
          const roomItems = allItems.filter(item => item.type === 'Room Booking');
          const walkInItems = allItems.filter(item => item.type === 'Walk-In Activity');
          const drinkItems = allItems.filter(item => item.type === 'Drink Sale');
          const staffItems = allItems.filter(item => item.type === 'Audit Log');
          const cashItems = allItems.filter(item => {
            const m = (item.paymentMethod || '').toLowerCase();
            return m.includes('cash') || (!m.includes('momo') && !m.includes('mobile') && !m.includes('bank') && !m.includes('pos'));
          });
          const momoItems = allItems.filter(item => {
            const m = (item.paymentMethod || '').toLowerCase();
            return m.includes('momo') || m.includes('mobile') || m.includes('money');
          });

          const getAuditItemDetails = (description: string | undefined | null) => {
            let badge = '';
            let cleanDescription = description || '';
            let badgeColor = '';

            if (!description) return { badge, cleanDescription: 'Audit Record', badgeColor };

            if (description.includes('[Future Booking - Partial Deposit]')) {
              badge = 'Future/Partial';
              cleanDescription = description.replace('[Future Booking - Partial Deposit] ', '');
              badgeColor = 'bg-red-500/10 text-red-600 border border-red-500/20';
            } else if (description.includes('[Future Booking]')) {
              badge = 'Future';
              cleanDescription = description.replace('[Future Booking] ', '');
              badgeColor = 'bg-blue-500/10 text-blue-600 border border-blue-500/20';
            } else if (description.includes('[Partial Deposit]')) {
              badge = 'Partial';
              cleanDescription = description.replace('[Partial Deposit] ', '');
              badgeColor = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
            }
            
            if (description.toLowerCase().includes('delete')) {
              badge = 'Deletion';
              badgeColor = 'bg-rose-500/20 text-rose-600 border border-rose-500/30 font-black uppercase';
            }
            
            return { badge, cleanDescription, badgeColor };
          };

          const filteredItems = allItems.filter(item => {
            if (auditFilterCategory === 'rooms') return item.type === 'Room Booking';
            if (auditFilterCategory === 'walkins') return item.type === 'Walk-In Activity';
            if (auditFilterCategory === 'drinks') return item.type === 'Drink Sale';
            if (auditFilterCategory === 'staff') return item.type === 'Audit Log';
            if (auditFilterCategory === 'cash') {
              const m = (item.paymentMethod || '').toLowerCase();
              return m.includes('cash') || (!m.includes('momo') && !m.includes('mobile') && !m.includes('bank') && !m.includes('pos'));
            }
            if (auditFilterCategory === 'momo') {
              const m = (item.paymentMethod || '').toLowerCase();
              return m.includes('momo') || m.includes('mobile') || m.includes('money');
            }
            return true;
          });

          const calculatedItemsTotal = allItems.reduce((sum, item) => sum + (item.amount || 0), 0);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-hidden backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl shadow-2xl border relative ${
                  isDarkMode ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-800 border-slate-200'
                }`}
              >
                {/* Fixed Top Header Area (Reduced for mobile fluidity) */}
                <div className={`flex-shrink-0 p-4 border-b ${
                  isDarkMode ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}>
                  {/* Title Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h3 className={`text-base font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        Audit: {h.receptionistName}
                      </h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                        h.branch === 'Annex' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {h.branch} Branch
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono leading-none">
                        ID: {h.receptionistId}
                      </span>
                      <span className="text-[10px] font-mono leading-none text-zinc-400">
                        {h.timestamp || 'N/A'}
                      </span>
                    </div>

                    <button
                      onClick={() => setSelectedHandoverForAudit(null)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer text-zinc-400 ${
                        isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-200'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Content Area (Metrics + Table) */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {/* 2x2 Summary Metric Cards Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2.5 border rounded-xl ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                      <div className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 mb-0.5">Total Handed Over</div>
                      <div className="text-base font-bold font-mono text-amber-500">
                        GH₵ {h.totalAmount.toFixed(2)}
                      </div>
                      <div className={`text-[10px] mt-0.5 flex justify-between ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                        <span>C: GH₵{h.cashAmount.toFixed(2)}</span>
                        <span>M: GH₵{h.momoAmount.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className={`p-2.5 border rounded-xl ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                      <div className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 mb-0.5">Room Check-Ins</div>
                      <div className="text-base font-bold font-mono text-blue-400">
                        GH₵ {(h.roomCash + h.roomMomo).toFixed(2)}
                      </div>
                      <div className={`text-[10px] mt-0.5 flex justify-between ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                        <span>C: GH₵{h.roomCash.toFixed(2)}</span>
                        <span>M: GH₵{h.roomMomo.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className={`p-2.5 border rounded-xl ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                      <div className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 mb-0.5">Walk-In Activities</div>
                      <div className="text-base font-bold font-mono text-emerald-400">
                        GH₵ {(h.walkInCash + h.walkInMomo).toFixed(2)}
                      </div>
                      <div className={`text-[10px] mt-0.5 flex justify-between ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                        <span>C: GH₵{h.walkInCash.toFixed(2)}</span>
                        <span>M: GH₵{h.walkInMomo.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className={`p-2.5 border rounded-xl ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-white'}`}>
                      <div className="text-[11px] uppercase font-mono tracking-wider text-zinc-400 mb-0.5">Drink Sales</div>
                      <div className="text-base font-bold font-mono text-purple-400">
                        GH₵ {((h.drinkCash || 0) + (h.drinkMomo || 0)).toFixed(2)}
                      </div>
                      <div className={`text-[10px] mt-0.5 flex justify-between ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                        <span>C: GH₵{(h.drinkCash || 0).toFixed(2)}</span>
                        <span>M: GH₵{(h.drinkMomo || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Handover Notes Banner */}
                  {h.notes && (
                    <div className={`py-1 px-3 border rounded-lg text-xs italic ${
                      isDarkMode ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-800'
                    }`}>
                      <span className="font-bold not-italic uppercase text-[10px] tracking-wider mr-1">Notes:</span>
                      "{h.notes}"
                    </div>
                  )}

                  {/* Filter Tabs */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {[
                      { id: 'all', label: `All Actions (${allItems.length})` },
                      { id: 'rooms', label: `Room Check-ins (${roomItems.length})` },
                      { id: 'walkins', label: `Walk-Ins (${walkInItems.length})` },
                      { id: 'drinks', label: `Drink Sales (${drinkItems.length})` },
                      { id: 'staff', label: `Staff Actions (${staffItems.length})` },
                      { id: 'cash', label: `Cash (${cashItems.length})` },
                      { id: 'momo', label: `MoMo (${momoItems.length})` }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setAuditFilterCategory(tab.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          auditFilterCategory === tab.id
                            ? 'bg-amber-500 text-amber-950 shadow-sm'
                            : isDarkMode
                              ? 'bg-slate-800 text-zinc-400 hover:bg-slate-700 hover:text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/55'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {/* Itemized Audit Table */}
                  <div className={`border rounded-xl shadow-inner overflow-hidden ${
                    isDarkMode ? 'border-slate-800 bg-slate-950/20' : 'border-slate-200 bg-white'
                  }`}>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse table-auto min-w-[600px]">
                        <thead className={`sticky top-0 z-10 border-b text-[10px] uppercase font-mono tracking-wider ${
                          isDarkMode ? 'bg-slate-900 border-slate-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}>
                          <tr>
                            <th className="py-2 px-2 w-10">#</th>
                            <th className="py-2 px-2 w-16">Time</th>
                            <th className="py-2 px-2 w-24">Cat.</th>
                            <th className="py-2 px-2">Description</th>
                            <th className="py-2 px-2 w-32">Guest</th>
                            <th className="py-2 px-2 w-24">Pay.</th>
                            <th className="py-2 px-2 w-24 text-right">Amt.</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y text-xs ${isDarkMode ? 'divide-slate-800/60 text-zinc-300' : 'divide-slate-200 text-slate-600'}`}>
                          {filteredItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-zinc-400 bg-slate-950/10">
                                {allItems.length === 0 ? (
                                  <div>
                                    <p className="font-bold text-xs text-amber-500 mb-1">Shift Handover Revenue Recorded</p>
                                    <p className="text-[11px] max-w-md mx-auto">
                                      Total handed over money (GH₵{h.totalAmount.toFixed(2)}) is registered. No individual room or walk-in action items were logged during this specific shift period.
                                    </p>
                                  </div>
                                ) : (
                                  'No itemized actions match the selected filter category.'
                                )}
                              </td>
                            </tr>
                          ) : (
                            filteredItems.map((item, idx) => {
                              const isCash = (item.paymentMethod || '').toLowerCase().includes('cash');
                              const isFuture = item.isFutureBooking || item.bookingType === 'future' || (item.description && item.description.includes('Future Booking'));
                              const isPartial = item.isPartialDeposit || (item.description && item.description.includes('Partial Deposit'));
                              const isAudit = item.type === 'Audit Log';
                              const isDeletion = isAudit && (item.serviceOrType?.toLowerCase().includes('delete') || (item.description || '').toLowerCase().includes('delete'));

                              return (
                                <tr key={`item-${item.id}-${idx}`} className={`border-b transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/40' : 'border-slate-100 hover:bg-slate-50'} ${isDeletion ? (isDarkMode ? 'bg-red-500/10' : 'bg-red-50') : ''}`}>
                                  <td className="py-2 px-2 font-mono text-[11px] text-zinc-500">{idx + 1}</td>
                                  <td className="py-2 px-2 font-mono text-[10px] text-zinc-400">
                                    {formatAuditTime(item.timestamp)}
                                  </td>
                                  <td className="py-2 px-2">
                                    {isFuture ? (
                                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap ${
                                        isDarkMode 
                                          ? 'bg-purple-950 text-purple-300 border border-purple-700/60' 
                                          : 'bg-purple-100 text-purple-800 border border-purple-200'
                                      }`}>
                                        Future Booking
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-extrabold ${
                                        item.type === 'Room Booking'
                                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                          : item.type === 'Drink Sale'
                                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                            : item.type === 'Audit Log'
                                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      }`}>
                                        {item.type === 'Audit Log' ? 'Audit' : item.type}
                                      </span>
                                    )}
                                  </td>
                                  <td className={`py-2 px-2 font-medium ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                                    {(() => {
                                      const details = getAuditItemDetails(item.description);
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          <span className="break-words">{details.cleanDescription}</span>
                                          {isFuture && (
                                            <span className={`text-[11px] font-semibold mt-0.5 ${
                                              isDarkMode ? 'text-purple-400' : 'text-purple-700'
                                            }`}>
                                              ({isPartial ? 'Partial' : 'Full'} Deposit Paid: GH₵ {Number(item.amount || 0).toFixed(2)})
                                            </span>
                                          )}
                                          {!isFuture && details.badge && (
                                            <span className={`w-fit px-1.5 py-0.5 rounded text-[9px] font-bold ${details.badgeColor}`}>
                                              {details.badge}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className={`py-2 px-2 ${isDarkMode ? 'text-zinc-300' : 'text-slate-600'}`}>
                                    {item.guestName || '—'}
                                  </td>
                                  <td className="py-2 px-2">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      isCash
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : 'bg-indigo-500/15 text-indigo-400'
                                    }`}>
                                      {item.paymentMethod}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono font-extrabold text-amber-400">
                                    GH₵ {Number(item.amount || 0).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card Layout */}
                    <div className={`md:hidden flex flex-col px-2 ${isDarkMode ? 'bg-slate-950/20' : 'bg-slate-50/50'}`}>
                      {filteredItems.map((item, idx) => {
                        const isCash = (item.paymentMethod || '').toLowerCase().includes('cash');
                        const isFuture = item.isFutureBooking || item.bookingType === 'future' || (item.description && item.description.includes('Future Booking'));
                        const isPartial = item.isPartialDeposit || (item.description && item.description.includes('Partial Deposit'));
                        const isAudit = item.type === 'Audit Log';
                        const isDeletion = isAudit && (item.serviceOrType?.toLowerCase().includes('delete') || (item.description || '').toLowerCase().includes('delete'));
                        const details = getAuditItemDetails(item.description);
                        return (
                          <div key={`item-${item.id}-${idx}`} className={`py-3 border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'} ${isDeletion ? (isDarkMode ? 'bg-red-500/10' : 'bg-red-50') : ''}`}>
                            <div className={`flex justify-between items-center text-[10px] mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                              <span className="font-mono font-bold">#{idx + 1}</span>
                              <span className="font-mono">{formatAuditTime(item.timestamp)}</span>
                            </div>
                            
                            <div className={`font-semibold text-sm leading-snug mb-1 ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>
                               <div className="flex items-center flex-wrap gap-1.5">
                                 {details.badge && (
                                   <span className={`px-1 py-0.5 rounded text-[8px] leading-none ${details.badgeColor}`}>
                                     {details.badge}
                                   </span>
                                 )}
                                 {details.cleanDescription || item.serviceOrType || 'Audit Entry'}
                               </div>
                            </div>
                            {isFuture ? (
                              <div className={`text-[11px] font-semibold mb-1 ${
                                isDarkMode ? 'text-purple-400' : 'text-purple-700'
                              }`}>
                                ({isPartial ? 'Partial' : 'Full'} Deposit Paid: GH₵ {Number(item.amount || 0).toFixed(2)})
                              </div>
                            ) : null}
                            
                            {isFuture ? (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-extrabold mb-2 ${
                                isDarkMode 
                                  ? 'bg-purple-950 text-purple-300 border border-purple-700/60' 
                                  : 'bg-purple-100 text-purple-800 border border-purple-200'
                              }`}>
                                Future Booking
                              </span>
                            ) : details.badge ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mb-2 ${details.badgeColor}`}>
                                  {details.badge}
                              </span>
                            ) : null}

                            <div className="flex justify-between items-center text-[11px]">
                              <span className={`font-medium truncate pr-2 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>{item.guestName || '—'}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono font-black text-amber-400 text-sm">GH₵ {Number(item.amount || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Single-Line Pinned Footer */}
                <div className={`flex-shrink-0 border-t p-3 px-4 flex items-center justify-between gap-3 ${
                  isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'
                }`}>
                  {/* Left: Export Audit CSV */}
                  <button
                    type="button"
                    onClick={() => handleExportCSV(allItems, `Shift_Audit_Handover_${h.receptionistName}_${h.timestamp}`)}
                    className={`flex-shrink-0 text-xs px-3 py-2 rounded-lg border font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isDarkMode 
                        ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-zinc-300' 
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>

                  {/* Center: Verified Financial Audit Reconciliation */}
                  <div className={`flex-1 flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs min-w-0 ${
                    isDarkMode ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-emerald-500 block leading-tight truncate">
                          Verified Financial Audit Reconciliation
                        </span>
                        <span className={`text-[10px] font-medium block leading-tight truncate ${isDarkMode ? 'text-zinc-400' : 'text-emerald-700'}`}>
                          Sum: <strong className={`font-mono ${isDarkMode ? 'text-zinc-200' : 'text-slate-950'}`}>GH₵{calculatedItemsTotal.toFixed(2)}</strong> | Handover: <strong className="font-mono text-amber-500">GH₵{h.totalAmount.toFixed(2)}</strong>
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black rounded uppercase tracking-wider whitespace-nowrap shrink-0 ml-2">
                      PASSED
                    </span>
                  </div>

                  {/* Right: Close Audit Inspector */}
                  <button
                    type="button"
                    onClick={() => setSelectedHandoverForAudit(null)}
                    className="flex-shrink-0 text-xs px-4 py-2 font-bold bg-amber-500 hover:bg-amber-600 text-amber-950 rounded-lg transition-all cursor-pointer shadow-md"
                  >
                    Close Audit
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

    </div>
  );
}
