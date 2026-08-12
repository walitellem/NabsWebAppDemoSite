/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NabsLodgeLogo } from './NabsLodgeLogo';
import { 
  User, Room, Booking, AuditLog, Branch, RoomStatus, BookingStatus, PaymentStatus, Role, WalkInActivityInput, HandoverItemBreakdown, DrinkItem, DrinkSale 
} from '../types';
import { 
  getRooms, getBookings, getLogs, createBooking, checkoutBooking, updateBookingPayment, addAuditLog, updateRoomStatus, getFormattedDateTime,
  getActivityCatalog, saveActivityCatalog, getSettings, getUsers, addHandover, cancelBooking, saveRooms, saveBookings,
  getDrinks, saveDrinks, getDrinkSales, saveDrinkSales, addDrinkSale, updateDrinkSale, deleteDrinkSale
} from '../data';
import { sendActivityInvoiceViaGmail, parseSafeDate } from '../utils/formatters';
import { 
  LogOut, UserPlus, Wrench, Plus,  Bed, Calendar, Phone, CheckCircle, Clock, Grid, Filter, 
  Search, Receipt, PlusCircle, Printer, Download, UserCheck, UserMinus, Info, AlertTriangle, Shield, MapPin, X, Sun, Moon, Sliders, RefreshCw, LayoutGrid, Table, Menu, ChevronLeft, ChevronRight, Lock, Unlock, ShieldCheck, Edit2, Trash2, Wine, Building2, Globe, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLoading } from './LoadingContext';
import { useToast } from './ToastContext';
import { DateRangePicker } from './DateRangePicker';
import { getThemeClasses, getRoomStatusClasses } from '../utils/theme';
import { db, auth, handleFirestoreError, OperationType, isFirebaseConfigured, safeSetDoc, safeUpdateDoc, safeAddDoc, safeDeleteDoc } from '../firebase';
import { doc, setDoc, collection, query, where, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { RoomBookingCalendar } from './RoomBookingCalendar';
import { FutureStayCalendar } from './FutureStayCalendar';
import { QuickAvailabilityCalendar } from './QuickAvailabilityCalendar';
import { WalkInActivityLedger } from './WalkInActivityLedger';
import { EditBookingModal } from './EditBookingModal';
import { EmptyState } from './EmptyState';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function isBookingPaid(b: any): boolean {
  if (!b) return false;
  if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially') || b.paymentStatus === 'Pending') return false;
  if (Number(b.lateCheckOutFeeApplied || 0) > 0 && Number(b.balance_due || b.pending_payment || 0) > 0) return false;
  if (b.paymentStatus === 'Paid') return true;
  const paid = Number(b.amountPaid || b.deposit || b.amountReceived || 0);
  const total = Number(b.totalPrice || 0);
  if (total > 0 && paid >= total) return true;
  return false;
}

export function getEffectivePaymentStatus(b: any): string {
  if (isBookingPaid(b)) return 'Paid';
  return b.paymentStatus || 'Unpaid';
}

export function getActualPaidAmount(b: any): number {
  if (!b) return 0;
  const prior = Number(b.priorAmountPaid || b.prior_amount_paid || 0);
  const lateFee = Number(b.lateCheckOutFeeApplied || 0);
  if (lateFee > 0 && prior > 0) return prior;
  if (lateFee > 0 && Number(b.totalPrice || 0) > lateFee) {
    const computed = Number(b.totalPrice || 0) - lateFee;
    return computed > 0 ? computed : 0;
  }
  const directPaid = Number(b.amountPaid || b.deposit || b.amountReceived || 0);
  const total = Number(b.totalPrice || 0);
  if (directPaid >= total && total > 0) return total;
  if (directPaid > 0) return directPaid;
  if (isBookingPaid(b)) return total;
  if (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) return total * 0.5;
  return 0;
}

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
  return m.includes('mobile') || m.includes('momo') || m.includes('bank') || m.includes('pos') || m.includes('transfer');
};

function sanitizeClonedDoc(clonedDoc: Document) {
  const styles = clonedDoc.querySelectorAll('style');
  styles.forEach((styleEl) => {
    if (styleEl.textContent && (styleEl.textContent.includes('oklch') || styleEl.textContent.includes('oklab'))) {
      styleEl.textContent = sanitizeCssColors(styleEl.textContent);
    }
  });

  // Force clean white background and black/dark text for printed/downloaded invoice & receipt sheets
  const invoiceSheet = clonedDoc.getElementById('print-invoice-sheet') || clonedDoc.getElementById('checkout-receipt-card') || clonedDoc.getElementById('walkin-invoice-card');
  if (invoiceSheet) {
    invoiceSheet.style.backgroundColor = '#ffffff';
    invoiceSheet.style.color = '#000000';
    invoiceSheet.style.boxShadow = 'none';
  }

  const allElements = clonedDoc.querySelectorAll('*');
  allElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style) {
      if (htmlEl.style.cssText && (htmlEl.style.cssText.includes('oklch') || htmlEl.style.cssText.includes('oklab'))) {
        htmlEl.style.cssText = sanitizeCssColors(htmlEl.style.cssText);
      }
      htmlEl.style.letterSpacing = 'normal';
      // Ensure dark mode backgrounds don't render gray/dark in exported PDF
      if (htmlEl.style.backgroundColor && (htmlEl.style.backgroundColor.includes('dark') || htmlEl.style.backgroundColor.includes('zinc-9') || htmlEl.style.backgroundColor.includes('zinc-8') || htmlEl.style.backgroundColor.includes('slate-9') || htmlEl.style.backgroundColor.includes('slate-8'))) {
        htmlEl.style.backgroundColor = '#ffffff';
      }
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

interface ReceptionistDashboardProps {
  currentUser: User;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenTutorial?: () => void;
}

const isUnpaidDrink = (s: any) => {
  if (s.paymentStatus === 'Paid') return false;
  const isFullyUnpaid = s.paymentStatus === 'Unpaid' || s.paymentMethod === 'Unpaid (Add to Room Bill)';
  const isPartiallyUnpaid = (s.paymentStatus === 'Split' || s.paymentMethod === 'Split (Paid & Unpaid)') && (s.unpaidAmount || 0) > 0;
  return isFullyUnpaid || isPartiallyUnpaid;
};

const getDrinkUnpaidAmount = (s: any) => {
  if (s.paymentStatus === 'Paid') return 0;
  const isFullyUnpaid = s.paymentStatus === 'Unpaid' || s.paymentMethod === 'Unpaid (Add to Room Bill)';
  return isFullyUnpaid ? s.totalPrice : (s.unpaidAmount || 0);
};

const getDrinkPaidAmount = (s: any) => {
  if (s.paymentStatus === 'Paid') return Number(s.totalPrice || 0);
  if (s.paymentStatus === 'Unpaid') return 0;
  if (s.paymentStatus === 'Split') return Number(s.paidAmount || 0);
  const isUnpaid = s.paymentMethod === 'Unpaid (Add to Room Bill)';
  const isSplit = s.paymentMethod === 'Split (Paid & Unpaid)';
  return isUnpaid ? 0 : (isSplit ? (Number(s.paidAmount) || 0) : Number(s.totalPrice || 0));
};

export default function ReceptionistDashboard({ currentUser, onLogout, isDarkMode, onToggleTheme, onOpenTutorial }: ReceptionistDashboardProps) {
  const { withLoading } = useLoading();
  const branch: Branch = currentUser.branch || 'Annex';
  const { addToast } = useToast();
  
  const upcomingMonths = React.useMemo(() => {
    const months = [];
    const currentDate = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      months.push(label);
    }
    return months;
  }, []);
  
  const triggerPrint = (elementId?: string, title: string = 'Hotel Document') => {
    let targetEl: HTMLElement | null = null;
    if (elementId) {
      targetEl = document.getElementById(elementId);
    }
    if (!targetEl) {
      targetEl = document.getElementById('print-invoice-sheet') || 
                 document.getElementById('checkout-receipt-card');
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
                  @page {
                    size: 80mm auto;
                    margin: 0;
                  }
                  * { box-sizing: border-box; letter-spacing: normal !important; }
                  body {
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #000 !important;
                    background: #fff !important;
                    padding: 8px;
                    margin: 0;
                    width: 76mm;
                    font-size: 11px;
                  }
                  h1 { font-size: 16px !important; margin: 4px 0 !important; }
                  h2, h3, h4, h5, h6 { font-size: 12px !important; margin: 4px 0 !important; }
                  p, span, div { font-size: 10px !important; color: #000 !important; }
                  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px !important; }
                  th, td { border: 1px solid #d1d5db; padding: 4px 6px !important; text-align: left; }
                  th { background-color: #f3f4f6; font-weight: 600; }
                                     .grid, [class*="grid-"] {
                     display: flex !important;
                     flex-direction: column !important;
                     gap: 4px !important;
                   }
                   .flex-row, .logo-header-row, [class*="flex-row"] {
                     display: flex !important;
                     flex-direction: row !important;
                     align-items: center !important;
                   }
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
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body > * { display: none !important; }
          #${targetEl.id} {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 76mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          #${targetEl.id} * {
            visibility: visible !important;
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
      addToast('Print Triggered', 'info', 'Use the "Save PDF" button if browser print is blocked.');
    } finally {
      setShowPrintInvoiceModal(false);
      setShowPrintPreviewModal(false);
      setShowBookingModal(false);
      setShowInvoiceModal(false);
      setShowArrivalModal(false);
      setShowFutureStayModal(false);
      setIsCheckingIn(false);
      setIsProcessingAction(false);

      setTimeout(() => {
        const existingStyle = document.getElementById('active-print-style-sheet');
        if (existingStyle) existingStyle.remove();
      }, 2000);
    }
  };

  const handlePrint = () => {
    triggerPrint();
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Live state representing the specific branch's view of the database
  const [rooms, setRooms] = useState<Room[]>([]);
  const [otherBranchRooms, setOtherBranchRooms] = useState<Room[]>([]);
  const [showCrossBranch, setShowCrossBranch] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const dynamicRooms = useMemo(() => {
    return rooms.map(r => {
      const isOccupied = r.status === 'Occupied' || !!r.guestName || bookings.some(b => (b.roomId === r.id || String(b.roomNumber) === String(r.roomNumber)) && b.branch === branch && (b.status === 'CheckedIn' || b.status === 'checked_in'));
      return { ...r, status: isOccupied ? 'Occupied' : r.status };
    });
  }, [rooms, bookings, branch]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Shift revenue and handover states
  const [roomRevenues, setRoomRevenues] = useState<any[]>(() => {
    try {
      const local = localStorage.getItem('nabslodge_room_revenues');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [walkInTransactions, setWalkInTransactions] = useState<any[]>(() => {
    try {
      const local = localStorage.getItem('nabslodge_activity_ledger');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [shiftResetGeneralTime, setShiftResetGeneralTime] = useState<number>(() => {
    try {
      const globalKey = `nabslodge_shift_reset_${currentUser.id}`;
      const savedGlobal = localStorage.getItem(globalKey);
      if (savedGlobal) return Number(savedGlobal);

      const todayDateStr = new Date().toISOString().split('T')[0];
      const key = `nabslodge_shift_reset_${currentUser.id}_${todayDateStr}`;
      const savedDated = localStorage.getItem(key);
      if (savedDated) return Number(savedDated);

      if (currentUser && currentUser.lastShiftReset) {
        return Number(currentUser.lastShiftReset);
      }
      return 0;
    } catch {
      return 0;
    }
  });

  // Automated print invoice options
  const [invoicePrintPaperSize, setInvoicePrintPaperSize] = useState<'thermal' | 'a4'>('thermal');
  const [invoicePrintShowBranding, setInvoicePrintShowBranding] = useState(true);
  const [invoicePrintShowStaff, setInvoicePrintShowStaff] = useState(true);
  const [invoicePrintShowSignature, setInvoicePrintShowSignature] = useState(true);
  const [invoicePrintMemo, setInvoicePrintMemo] = useState('Thank you for choosing Nabslodge! We hope you enjoyed your stay.');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Future Stay & Front Desk Search state
  const [searchFutureBookings, setSearchFutureBookings] = useState('');
  const [futureStatusFilter, setFutureStatusFilter] = useState<'All' | 'Active' | 'Pending Review' | 'Checked-In' | 'No Show' | 'Completed'>('All');

  // Book Future Stay Modal State
  const [showFutureStayModal, setShowFutureStayModal] = useState(false);
  const [futureGuestName, setFutureGuestName] = useState('');
  const [futureGuestPhone, setFutureGuestPhone] = useState('');
  const [futureGuestEmail, setFutureGuestEmail] = useState('');
  const [futureRoomId, setFutureRoomId] = useState('');
  const [futureCheckIn, setFutureCheckIn] = useState('');
  const [futureCheckOut, setFutureCheckOut] = useState('');
  const [futureAmountPaid, setFutureAmountPaid] = useState<number>(0);
  const [futureStayError, setFutureStayError] = useState('');
  const [activePopover, setActivePopover] = useState<'checkin' | 'checkout' | null>(null);
  const [showRoomWarning, setShowRoomWarning] = useState<'checkin' | 'checkout' | null>(null);
  const [futureIsOccasion, setFutureIsOccasion] = useState(false);
  const [futureIsMonthly, setFutureIsMonthly] = useState(false);
  const [futureSelectedMonth, setFutureSelectedMonth] = useState<string>('');
  const [futureGuestCount, setFutureGuestCount] = useState('1');
  const [futureIsFivePercentDiscount, setFutureIsFivePercentDiscount] = useState(false);
  const [futureManualDiscountAmount, setFutureManualDiscountAmount] = useState<number>(0);
  const [isShiftProtocolOpen, setIsShiftProtocolOpen] = useState(true);

  // Arrival Walk-In Balance Modal State
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalBooking, setArrivalBooking] = useState<Booking | null>(null);
  const [arrivalAmountReceived, setArrivalAmountReceived] = useState<number>(0);

  // Search & Filter state
  const [roomStatusFilter, setRoomStatusFilter] = useState<'All' | RoomStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Tab control
  const [activeTab, setActiveTab] = useState<'rooms' | 'reservations' | 'quickCalendar' | 'history' | 'activityLedger' | 'drinks'>('rooms');
  // Room board view mode (Grid vs Table)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Booking history search & filters
  const [historySearch, setHistorySearch] = useState('');
  const [todayBookingSearch, setTodayBookingSearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'All' | BookingStatus>('All');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<'All' | PaymentStatus>('All');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Hidden / Secured Booking History Access State
  const [isHistoryUnlocked, setIsHistoryUnlocked] = useState<boolean>(false);
  const [showHistoryPinModal, setShowHistoryPinModal] = useState<boolean>(false);
  const [historyPinInput, setHistoryPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  useEffect(() => {
    if (currentUser && currentUser.lastShiftReset) {
      const resetTime = Number(currentUser.lastShiftReset);
      if (resetTime > 0) {
        setShiftResetGeneralTime(resetTime);
      }
    }
  }, [currentUser?.lastShiftReset]);

  useEffect(() => {
    if (activeTab === 'history' && !isHistoryUnlocked) {
      setActiveTab('rooms');
    }
  }, [activeTab, isHistoryUnlocked]);

  // Inline Reservation Form State
  const [resRoomId, setResRoomId] = useState(() => localStorage.getItem('draft_resRoomId') || '');
  const [resGuestName, setResGuestName] = useState(() => localStorage.getItem('draft_resGuestName') || '');
  const [resGuestContact, setResGuestContact] = useState(() => localStorage.getItem('draft_resGuestContact') || '');
  const [resCheckIn, setResCheckIn] = useState(() => {
    const draft = localStorage.getItem('draft_resCheckIn');
    if (draft) return draft;
    const today = new Date();
    const savedCheckInTime = localStorage.getItem('globalCheckInTime') || '14:00';
    const [inHour, inMinute] = savedCheckInTime.split(':').map(Number);
    today.setHours(inHour, inMinute, 0, 0);
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [resCheckOut, setResCheckOut] = useState(() => {
    const draft = localStorage.getItem('draft_resCheckOut');
    if (draft) return draft;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const savedCheckOutTime = localStorage.getItem('globalCheckOutTime') || '12:00';
    const [outHour, outMinute] = savedCheckOutTime.split(':').map(Number);
    tomorrow.setHours(outHour, outMinute, 0, 0);
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    return new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [resPayment, setResPayment] = useState<PaymentStatus>(() => (localStorage.getItem('draft_resPayment') as PaymentStatus) || 'Paid');
  const [resError, setResError] = useState('');
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [showBookingCalendarPopover, setShowBookingCalendarPopover] = useState(false);
  const [showQuickCalendarPopover, setShowQuickCalendarPopover] = useState(false);
  const [globalCheckInTime, setGlobalCheckInTime] = useState(() => getSettings().checkInTime);
  const [globalCheckOutTime, setGlobalCheckOutTime] = useState(() => getSettings().checkOutTime);

  useEffect(() => {
    localStorage.setItem('draft_resRoomId', resRoomId);
    localStorage.setItem('draft_resGuestName', resGuestName);
    localStorage.setItem('draft_resGuestContact', resGuestContact);
    localStorage.setItem('draft_resCheckIn', resCheckIn);
    localStorage.setItem('draft_resCheckOut', resCheckOut);
    localStorage.setItem('draft_resPayment', resPayment);
  }, [resRoomId, resGuestName, resGuestContact, resCheckIn, resCheckOut, resPayment]);


  // Modals & Form states
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [bookingIsOccasion, setBookingIsOccasion] = useState(false);
  const [bookingIsMonthly, setBookingIsMonthly] = useState(false);
  const [bookingSelectedMonth, setBookingSelectedMonth] = useState<string>('');
  const [bookingGuestCount, setBookingGuestCount] = useState('1');
  const [bookingError, setBookingError] = useState('');
  const [initialPaymentMode, setInitialPaymentMode] = useState<'full' | 'partial' | 'unpaid' | 'split'>('full');
  const [initialPartialAmount, setInitialPartialAmount] = useState<number>(0);
  const [isFivePercentDiscount, setIsFivePercentDiscount] = useState(false);
  const [manualDiscountAmount, setManualDiscountAmount] = useState<number>(0);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitMomoAmount, setSplitMomoAmount] = useState<number>(0);
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<'Cash' | 'Mobile Money'>('Cash');
  const [resPaymentMethod, setResPaymentMethod] = useState<'Cash' | 'Mobile Money'>('Cash');
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'Cash' | 'Mobile Money'>('Cash');
  const [resIsFivePercentDiscount, setResIsFivePercentDiscount] = useState(false);
  const [resManualDiscountAmount, setResManualDiscountAmount] = useState<number>(0);
  const [checkoutIsFivePercent, setCheckoutIsFivePercent] = useState(false);
  const [checkoutManualDiscount, setCheckoutManualDiscount] = useState<number>(0);

  // DRINKS & BAR SERVICES STATE
  const [drinks, setDrinks] = useState<DrinkItem[]>(() => getDrinks());
  const [drinkSales, setDrinkSales] = useState<DrinkSale[]>(() => getDrinkSales());
  const [showDrinkOrderModal, setShowDrinkOrderModal] = useState<boolean>(false);
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>('');
  const [drinkQty, setDrinkQty] = useState<number | string>(1);
  const [drinkCart, setDrinkCart] = useState<import('../types').DrinkSaleItem[]>([]);
  const [drinkGuestName, setDrinkGuestName] = useState<string>('');
  const [drinkRoomNumber, setDrinkRoomNumber] = useState<string>('');
  const [drinkPaymentMethod, setDrinkPaymentMethod] = useState<'Cash' | 'Mobile Money' | 'Split (Cash + Momo)' | 'Unpaid (Add to Room Bill)' | 'Split (Paid & Unpaid)'>('Cash');
  const [drinkBookingId, setDrinkBookingId] = useState<string>('');
  const [drinkSplitPaidAmount, setDrinkSplitPaidAmount] = useState<number>(0);
  const [drinkSplitUnpaidAmount, setDrinkSplitUnpaidAmount] = useState<number>(0);
  const [drinkSplitCashAmount, setDrinkSplitCashAmount] = useState<number>(0);
  const [drinkSplitMomoAmount, setDrinkSplitMomoAmount] = useState<number>(0);
  const [showEditDrinkSaleModal, setShowEditDrinkSaleModal] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState<DrinkSale | null>(null);
  const [editDrinkSaleQty, setEditDrinkSaleQty] = useState<number | string>(1);
  const [editDrinkSalePaymentMethod, setEditDrinkSalePaymentMethod] = useState<DrinkSale['paymentMethod']>('Cash');
  const [editDrinkSaleRoomNumber, setEditDrinkSaleRoomNumber] = useState('');
  const [editDrinkSaleGuestName, setEditDrinkSaleGuestName] = useState('');
  const [editDrinkSaleDrinkId, setEditDrinkSaleDrinkId] = useState('');
  const [isProcessingEditSale, setIsProcessingEditSale] = useState(false);
  const [showDeleteSaleConfirm, setShowDeleteSaleConfirm] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<DrinkSale | null>(null);
  const [drinkSplitPaidMethod, setDrinkSplitPaidMethod] = useState<'Cash' | 'Mobile Money'>('Cash');
  const [isProcessingDrinkSale, setIsProcessingDrinkSale] = useState<boolean>(false);

  // Sync check-in/check-out dates automatically when monthly package and month are selected
  useEffect(() => {
    if (bookingIsMonthly && bookingSelectedMonth) {
      const parts = bookingSelectedMonth.split(' ');
      if (parts.length === 2) {
        const monthName = parts[0];
        const year = parseInt(parts[1], 10);
        const dateObj = new Date(`${monthName} 1, ${year}`);
        if (!isNaN(dateObj.getTime())) {
          const startYear = dateObj.getFullYear();
          const startMonth = dateObj.getMonth();
          const startDate = new Date(startYear, startMonth, 1, 14, 0, 0);
          const endDate = new Date(startYear, startMonth + 1, 1, 12, 0, 0);
          
          const formatIso = (d: Date) => {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            const hr = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yr}-${mo}-${dy}T${hr}:${mi}`;
          };

          setCheckInDate(formatIso(startDate));
          setCheckOutDate(formatIso(endDate));
        }
      }
    }
  }, [bookingIsMonthly, bookingSelectedMonth]);

  useEffect(() => {
    if (futureIsMonthly && futureSelectedMonth) {
      const parts = futureSelectedMonth.split(' ');
      if (parts.length === 2) {
        const monthName = parts[0];
        const year = parseInt(parts[1], 10);
        const dateObj = new Date(`${monthName} 1, ${year}`);
        if (!isNaN(dateObj.getTime())) {
          const startYear = dateObj.getFullYear();
          const startMonth = dateObj.getMonth();
          const startDate = new Date(startYear, startMonth, 1, 14, 0, 0);
          const endDate = new Date(startYear, startMonth + 1, 1, 12, 0, 0);
          
          const formatIso = (d: Date) => {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            const hr = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yr}-${mo}-${dy}T${hr}:${mi}`;
          };

          setFutureCheckIn(formatIso(startDate));
          setFutureCheckOut(formatIso(endDate));
        }
      }
    }
  }, [futureIsMonthly, futureSelectedMonth]);

  // Airtight State Machine States & Listeners
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [extensionFee, setExtensionFee] = useState<number>(0);
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [totalRate, setTotalRate] = useState<number>(0);

  // Active Booking Real-Time Listener (Local simulation)
  useEffect(() => {
    if (!selectedRoom) {
      setActiveBooking(null);
      return;
    }
    const currentBookings = getBookings();
    const found = currentBookings.find(b => 
      (b.roomId === selectedRoom.id || (b.roomNumber && String(b.roomNumber) === String(selectedRoom.roomNumber))) && 
      (b.branch === branch || !b.branch) && 
      !['CheckedOut', 'Cancelled', 'No Show'].includes(b.status)
    );
    setActiveBooking(found || null);
  }, [selectedRoom, branch, bookings]);

  // Synchronize Form Inputs with Active Booking Document
  useEffect(() => {
    if (activeBooking) {
      setGuestName(activeBooking.guestName || '');
      setGuestContact(activeBooking.guestContact || '');
      setGuestEmail(activeBooking.guestEmail || '');
      setBookingGuestCount(String(activeBooking.guestCount || '1'));
      setBookingIsOccasion(Boolean(activeBooking.isOccasionBooking || activeBooking.isOccasion || false));
      setBookingIsMonthly(Boolean(activeBooking.isMonthlyBooking || false));
      if (activeBooking.selectedMonth) {
        setBookingSelectedMonth(activeBooking.selectedMonth);
      } else {
        setBookingSelectedMonth(upcomingMonths[0] || '');
      }
      setTotalRate(Number(activeBooking.totalRate || activeBooking.totalPrice || selectedRoom?.price || 0));
    } else if (selectedRoom) {
      setGuestName('');
      setGuestContact('');
      setGuestEmail('');
      setBookingGuestCount('1');
      setBookingIsOccasion(false);
      setBookingIsMonthly(false);
      setBookingSelectedMonth(upcomingMonths[0] || '');
      setTotalRate(selectedRoom.price);
    }
  }, [activeBooking, selectedRoom]);

  // --- THE AIRTIGHT 4-STEP STATE MACHINE MATRIX HANDLERS ---

  // Step 1: Check-In Room
  const handleLockStay = async () => {
    if (!selectedRoom) return;
    setIsCheckingIn(true);
    try {
      if (!checkInDate || !checkOutDate) {
        throw new Error("Check-In and Check-Out dates are required.");
      }

      const conflict = checkSchedulingConflict(selectedRoom.id, checkInDate, checkOutDate);
      if (conflict) {
        throw new Error(`❌ Room conflict detected! This room is already booked for certain dates during ${bookingIsMonthly ? bookingSelectedMonth : 'these dates'}. Cannot proceed.`);
      }

      const cleanPhone = guestContact.replace(/\D/g, '');
      if (cleanPhone.length < 9) {
        throw new Error("Please enter a valid phone number.");
      }

      const isApartment = selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment';
      let baseRate = selectedRoom.price;
      if (bookingIsMonthly) {
        baseRate = selectedRoom.monthlyPremiumPrice || selectedRoom.price;
      } else if (isApartment) {
        baseRate = bookingIsOccasion ? (selectedRoom.occasionBookingPrice || 1000) : (selectedRoom.normalBookingPrice || 600);
      }

      const checkInDateParsed = new Date(`${checkInDate.split('T')[0]}T${globalCheckInTime}`);
      const checkOutDateParsed = new Date(`${checkOutDate.split('T')[0]}T${globalCheckOutTime}`);
      const days = Math.ceil((checkOutDateParsed.getTime() - checkInDateParsed.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const origTotalPrice = bookingIsMonthly ? baseRate : (baseRate * days);

      let discountAmt = 0;
      if (days >= 10 && isFivePercentDiscount) {
        discountAmt += origTotalPrice * 0.05;
      }
      discountAmt += manualDiscountAmount;
      const finalTotalPrice = Math.max(0, origTotalPrice - discountAmt);
      const discountType = (days >= 10 && isFivePercentDiscount) ? '5% Long-Stay' : (manualDiscountAmount > 0 ? 'Manual' : 'None');

      let finalAmountPaid = 0;
      let finalPaymentStatus: PaymentStatus = 'Unpaid';
      if (initialPaymentMode === 'full') {
        finalAmountPaid = finalTotalPrice;
        finalPaymentStatus = 'Paid';
      } else if (initialPaymentMode === 'partial') {
        finalAmountPaid = Math.min(Math.max(0, initialPartialAmount), finalTotalPrice);
        finalPaymentStatus = 'Partially Paid (50% Deposit)';
      } else if (initialPaymentMode === 'split') {
        finalAmountPaid = Math.min(Math.max(0, splitCashAmount + splitMomoAmount), finalTotalPrice);
        finalPaymentStatus = 'Partially Paid (Split)';
      } else {
        finalAmountPaid = 0;
        finalPaymentStatus = 'Unpaid';
      }

      const bookingId = `book_${Math.random().toString(36).substring(2, 11)}`;
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;
      const pendingBalance = Math.max(0, finalTotalPrice - finalAmountPaid);

      const newBooking: Booking = {
        id: bookingId,
        roomId: selectedRoom.id,
        roomNumber: selectedRoom.roomNumber,
        branch: branch,
        lodgeBranch: userAssignedBranch,
        discountType: discountType,
        discountAmount: discountAmt,
        guestName: guestName.trim() || 'Guest Locked Hold',
        guestContact: cleanPhone,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        status: 'CheckedIn',
        totalPrice: finalTotalPrice,
        paymentStatus: finalPaymentStatus,
        amountPaid: finalAmountPaid,
        deposit: finalAmountPaid,
        balance_due: pendingBalance,
        pending_payment: pendingBalance,
        paymentMethod: finalAmountPaid > 0 ? bookingPaymentMethod : 'Cash',
        receptionistId: currentUser.id,
        receptionistName: currentUser.name,
        createdAt: getFormattedDateTime(),
        dateCreated: serverTimestamp(),
        totalRate: Number(baseRate),
        isOccasionBooking: bookingIsOccasion,
        isOccasion: bookingIsOccasion,
        isMonthlyBooking: bookingIsMonthly,
        selectedMonth: bookingIsMonthly ? (bookingSelectedMonth || null) : null,
        roomType: selectedRoom.roomType,
        occasionMaxGuests: selectedRoom.occasionBookingMaxGuests || 8,
        occasionPrice: selectedRoom.occasionBookingPrice || 1000,
        normalMaxGuests: selectedRoom.normalBookingMaxGuests || 4,
        normalPrice: selectedRoom.normalBookingPrice || 600,
        guestCount: Number(bookingGuestCount) || 1
      };

      // 1. Save booking to local (Sync)
      createBooking(newBooking);

      // 2. Set room status to Occupied in local (Sync)
      updateRoomStatus(currentUser.id, currentUser.name, 'Receptionist', selectedRoom.id, 'Occupied');

      // 3. Save booking to Firestore
      await setDoc(doc(db, 'bookings', bookingId), newBooking);

      // 4. Update room status in Firestore
      await setDoc(doc(db, 'rooms', selectedRoom.id), {
        status: 'Occupied'
      }, { merge: true });

      // 5. Log revenue to Firestore
      if (finalAmountPaid > 0) {
        if (initialPaymentMode === 'split') {
          if (splitCashAmount > 0) {
            await logRoomRevenue({
              bookingId: bookingId,
              roomNumber: selectedRoom.roomNumber,
              roomType: selectedRoom.roomType,
              branch: branch,
              guestName: guestName,
              amount: splitCashAmount,
              receptionistId: currentUser.id,
              receptionistName: currentUser.name,
              revenueType: 'Allocation',
              paymentMethod: 'Cash'
            });
          }
          if (splitMomoAmount > 0) {
            await logRoomRevenue({
              bookingId: bookingId,
              roomNumber: selectedRoom.roomNumber,
              roomType: selectedRoom.roomType,
              branch: branch,
              guestName: guestName,
              amount: splitMomoAmount,
              receptionistId: currentUser.id,
              receptionistName: currentUser.name,
              revenueType: 'Allocation',
              paymentMethod: 'Mobile Money'
            });
          }
        } else {
          await logRoomRevenue({
            bookingId: bookingId,
            roomNumber: selectedRoom.roomNumber,
            roomType: selectedRoom.roomType,
            branch: branch,
            guestName: guestName,
            amount: finalAmountPaid,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: finalPaymentStatus === 'Paid' ? 'Allocation' : 'Deposit',
            paymentMethod: bookingPaymentMethod
          });
        }
      }

      // 6. Add Audit Log to Firestore
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch: branch,
        action: 'Check-in Guest (Form)',
        details: `Room: ${selectedRoom.roomNumber}, Price: GH₵${finalTotalPrice.toFixed(2)}, Paid: GH₵${finalAmountPaid.toFixed(2)}`
      });

      refreshData();

      setShowBookingModal(false);
      setInvoiceBooking(newBooking);
      setInvoiceType('CheckIn');
      setShowPrintInvoiceModal(true);

      addToast("Check-In Successful", "success", `Room ${selectedRoom.roomNumber} checked in successfully.`, 3000);
    } catch (error: any) {
      const msg = error?.message || String(error);
      window.alert("Booking Engine Error: " + msg);
      addToast("Check-In Error", "error", msg, 5000);
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Step 2: Initiate Check (Guest Intake & Registration)
  const handleInitiateCheck = async () => {
    addToast("Registration Processed", "success", "Guest registration simulated.", 3000);
  };

  // Step 3: Confirm Paid (Reconcile Stay Finances)
  const handleConfirmPaid = async () => {
    if (!activeBooking || !selectedRoom) return;
    setIsCheckingIn(true);
    try {
      updateBookingPayment(currentUser.id, currentUser.name, activeBooking.id, 'Paid');
      
      // Update Firestore Booking
      await setDoc(doc(db, 'bookings', activeBooking.id), {
        paymentStatus: 'Paid',
        balance_due: 0,
        pending_payment: 0,
        amountPaid: activeBooking.totalPrice,
        deposit: activeBooking.totalPrice,
        branch: branch
      }, { merge: true });

      // Update unpaid drinks to Paid in Firestore & locally
      const bookingUnpaidDrinks = drinkSales.filter(s =>
        s.bookingId === activeBooking.id &&
        isUnpaidDrink(s)
      );
      if (bookingUnpaidDrinks.length > 0) {
        const unpaidDrinksTotal = bookingUnpaidDrinks.reduce((sum, s) => sum + getDrinkUnpaidAmount(s), 0);
        if (unpaidDrinksTotal > 0) {
          await logRoomRevenue({
            bookingId: activeBooking.id,
            roomNumber: selectedRoom.roomNumber,
            roomType: selectedRoom.roomType,
            branch: branch,
            guestName: activeBooking.guestName,
            amount: unpaidDrinksTotal,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'DrinkSettlement',
            paymentMethod: bookingPaymentMethod
          });
        }

        for (const sale of bookingUnpaidDrinks) {
          const updatedSale = {
            ...sale,
            paymentStatus: 'Paid' as const,
            paidAmount: sale.totalPrice,
            unpaidAmount: 0,
            settledPaymentMethod: bookingPaymentMethod
          };
          await setDoc(doc(db, 'drinkSales', sale.id), updatedSale, { merge: true });
        }
        const updatedDrinkSalesList = drinkSales.map(s => {
          if (bookingUnpaidDrinks.some(bs => bs.id === s.id)) {
            return { 
              ...s, 
              paymentStatus: 'Paid' as const, 
              paidAmount: s.totalPrice, 
              unpaidAmount: 0,
              settledPaymentMethod: bookingPaymentMethod
            };
          }
          return s;
        });
        setDrinkSales(updatedDrinkSalesList);
        saveDrinkSales(updatedDrinkSalesList);
      }

      // Log the balance payment to RoomRevenue
      const balanceToPay = Math.max(0, activeBooking.totalPrice - (activeBooking.amountPaid || 0));
      if (balanceToPay > 0) {
        await logRoomRevenue({
          bookingId: activeBooking.id,
          roomNumber: selectedRoom.roomNumber,
          roomType: selectedRoom.roomType,
          branch: branch,
          guestName: activeBooking.guestName,
          amount: balanceToPay,
          receptionistId: currentUser.id,
          receptionistName: currentUser.name,
          revenueType: 'Allocation',
          paymentMethod: bookingPaymentMethod
        });
      }

      // Add Audit Log
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch: branch,
        action: 'Reconcile Payment',
        details: `Room: ${selectedRoom.roomNumber}, Booking: ${activeBooking.id}, Amount: GH₵${balanceToPay.toFixed(2)}`
      });

      refreshData();
      addToast("Payment Reconciled", "success", `Finances fully cleared for Room ${selectedRoom.roomNumber}.`, 3000);
    } catch (error: any) {
      window.alert("Payment Error: " + error.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Step 4: Check Out (Release & Reset Room)
  const handleCheckOut = async () => {
    if (!activeBooking || !selectedRoom) return;
    setIsCheckingIn(true);
    try {
      checkoutBooking(currentUser.id, currentUser.name, activeBooking.id, 'Available');
      
      // Update Firestore Booking
      await safeSetDoc(doc(db, 'bookings', activeBooking.id), {
        status: 'CheckedOut',
        actualCheckOutDate: getFormattedDateTime()
      }, { merge: true });

      // Update Firestore Room
      await safeSetDoc(doc(db, 'rooms', selectedRoom.id), {
        status: 'Available'
      }, { merge: true });

      // Add Audit Log
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await safeSetDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch: branch,
        action: 'Check-Out Guest',
        details: `Room: ${selectedRoom.roomNumber}, Guest: ${activeBooking.guestName}`
      });

      refreshData();
      addToast("Check-Out Successful", "success", `Room ${selectedRoom.roomNumber} has been released and reset back to vacant.`, 3000);
      setShowBookingModal(false);
    } catch (error: any) {
      window.alert("Check-Out Error: " + error.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const getStateMachineStep = () => {
    if (!activeBooking) return 'vacant';
    const status = activeBooking.status;
    if (status === 'locked') return 'locked';
    if (status === 'checking_in') return 'checking_in';
    if (status === 'paid' || status === 'CheckedIn') return 'paid';
    return 'vacant';
  };

  // Walk-In Activity Billing states
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showWalkInReceiptModal, setShowWalkInReceiptModal] = useState(false);
  const [walkInReceiptData, setWalkInReceiptData] = useState<WalkInActivityInput | null>(null);
  const [walkInGuestName, setWalkInGuestName] = useState('');
  const [walkInGuestPhone, setWalkInGuestPhone] = useState('');
  const [walkInServiceType, setWalkInServiceType] = useState('Photography Session');
  const [walkInTotalCharged, setWalkInTotalCharged] = useState('');
  const [walkInPaymentStatus, setWalkInPaymentStatus] = useState<'Paid' | 'Partial'>('Paid');
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState<'Cash' | 'Mobile Money'>('Cash');
  const [walkInAmountPaid, setWalkInAmountPaid] = useState('');
  const [walkInError, setWalkInError] = useState('');
  const [isSavingWalkIn, setIsSavingWalkIn] = useState(false);
  const [arrivalPaymentPathway, setArrivalPaymentPathway] = useState<'payNow' | 'payLater'>('payNow');
  const [activityCatalog, setActivityCatalog] = useState<any[]>(() => getActivityCatalog());

  // Active Checkout/Invoice State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  
  useEffect(() => {
    if (selectedBooking) {
      setApplyLateCheckOutFee(Number((selectedBooking as any).lateCheckOutFeeApplied || 0) > 0);
    }
  }, [selectedBooking]);
  const [checkoutNextStatus, setCheckoutNextStatus] = useState<RoomStatus>('Cleaning');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [applyLateCheckOutFee, setApplyLateCheckOutFee] = useState(false);
  const [lateCheckOutFee, setLateCheckOutFee] = useState<number>(() => getSettings().lateCheckOutFee);

  const [checkoutUnpaidDrinks, setCheckoutUnpaidDrinks] = useState<DrinkSale[]>([]);
  const [checkoutUnpaidDrinksTotal, setCheckoutUnpaidDrinksTotal] = useState<number>(0);

  React.useEffect(() => {
    if (showInvoiceModal && selectedBooking && !checkoutSuccess) {
      const unpaid = drinkSales.filter(s =>
        s.bookingId === selectedBooking.id &&
        isUnpaidDrink(s)
      );
      setCheckoutUnpaidDrinks(unpaid);
      setCheckoutUnpaidDrinksTotal(unpaid.reduce((sum, s) => sum + getDrinkUnpaidAmount(s), 0));
    } else if (!showInvoiceModal) {
      setCheckoutUnpaidDrinks([]);
      setCheckoutUnpaidDrinksTotal(0);
    }
  }, [showInvoiceModal, selectedBooking, checkoutSuccess, drinkSales]);

  // Edit / Rectify Booking state
  const [showEditBookingModal, setShowEditBookingModal] = useState(false);
  const [editingBookingTarget, setEditingBookingTarget] = useState<Booking | null>(null);

  const getModalNights = () => {
    if (!futureCheckIn || !futureCheckOut) return 0;
    const start = new Date(futureCheckIn);
    const end = new Date(futureCheckOut);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const formatReadableDateTime = (dateTimeStr: string) => {
    if (!dateTimeStr) return "Select Date & Time";
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    return d.toLocaleString('en-US', {
       month: 'short',
       day: 'numeric',
       year: 'numeric',
       hour: '2-digit',
       minute: '2-digit',
       hour12: true
    });
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const dateObj = new Date(y, m, d);
    if (isNaN(dateObj.getTime())) return dateStr;
    const day = dateObj.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = monthNames[dateObj.getMonth()];
    const yearStr = dateObj.getFullYear();
    return `${day} ${monthStr} ${yearStr}`;
  };

  const handleCheckInClick = () => {
    if (!futureRoomId) {
      setShowRoomWarning('checkin');
      setTimeout(() => setShowRoomWarning(null), 3000);
      return;
    }
    setActivePopover(activePopover === 'checkin' ? null : 'checkin');
  };

  const handleCheckOutClick = () => {
    if (!futureRoomId) {
      setShowRoomWarning('checkout');
      setTimeout(() => setShowRoomWarning(null), 3000);
      return;
    }
    setActivePopover(activePopover === 'checkout' ? null : 'checkout');
  };

  // Automated print invoice state
  const [showPrintInvoiceModal, setShowPrintInvoiceModal] = useState(false);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [invoiceType, setInvoiceType] = useState<'CheckIn' | 'CheckOut'>('CheckIn');

  // Print Preview & Range Confirmation Dialog State
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false);
  const [printPreviewConfig, setPrintPreviewConfig] = useState<{
    elementId?: string;
    title: string;
    documentType: 'Invoice' | 'Receipt' | 'Report';
    invoiceNum?: string;
    guestName?: string;
    roomNumber?: string;
    checkInDate?: string;
    checkOutDate?: string;
    numberOfNights?: number;
    totalPrice?: number;
    paymentStatus?: string;
    bookingObj?: Booking | null;
  } | null>(null);
  const [isRangeConfirmed, setIsRangeConfirmed] = useState(true);

  const openPrintPreview = (config: {
    elementId?: string;
    title: string;
    documentType: 'Invoice' | 'Receipt' | 'Report';
    invoiceNum?: string;
    guestName?: string;
    roomNumber?: string;
    checkInDate?: string;
    checkOutDate?: string;
    numberOfNights?: number;
    totalPrice?: number;
    paymentStatus?: string;
    bookingObj?: Booking | null;
  }) => {
    setPrintPreviewConfig(config);
    setIsRangeConfirmed(true);
    setShowPrintPreviewModal(true);
  };

  const handleDownloadReceipt = async () => {
    const element = document.getElementById('checkout-receipt-card');
    addToast('Generating PDF Receipt...', 'info', 'Please wait while the receipt is being generated.', 3000);

    if (element) {
      try {
        const canvas = await executeWithOklchSafeStyles(async () => {
          return await html2canvas(element, { 
            scale: 2, 
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff',
            onclone: sanitizeClonedDoc
          });
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Receipt_Room_${selectedBooking?.roomNumber || 'Booking'}.pdf`);
        addToast('Download Successful', 'success', 'Downloaded PDF Receipt', 3000);
        return;
      } catch (error: any) {
        console.warn("Canvas Receipt generation failed, using fallback generator:", error);
      }
    }

    try {
      const pdf = new jsPDF();
      const b = selectedBooking;
      const start = b?.checkInDate ? new Date(b.checkInDate) : new Date();
      const end = b?.checkOutDate ? new Date(b.checkOutDate) : new Date();
      const diffDays = Math.max(1, Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 3600 * 24)));

      pdf.setFontSize(20);
      pdf.text(cleanPdfText("NABSLODGE"), 14, 20);
      pdf.setFontSize(14);
      pdf.text(cleanPdfText(`CHECKOUT RECEIPT - ${(b?.branch || branch).toUpperCase()} BRANCH`), 14, 28);
      pdf.setLineWidth(0.5);
      pdf.line(14, 32, 196, 32);

      pdf.setFontSize(11);
      pdf.text(cleanPdfText(`Receipt Reference: ${(b?.id || 'N/A').toUpperCase()}`), 14, 42);
      pdf.text(cleanPdfText(`Guest Name: ${b?.guestName || 'Valued Guest'}`), 14, 50);
      pdf.text(cleanPdfText(`Room Number: ${b?.roomNumber || 'N/A'}`), 14, 58);
      pdf.text(cleanPdfText(`Invoice Stay Period: ${b?.checkInDate || 'N/A'} to ${b?.checkOutDate || 'N/A'} (${diffDays} Nights)`), 14, 66);
      pdf.text(cleanPdfText(`Payment Status: ${b?.paymentStatus || 'Paid'}`), 14, 74);

      pdf.line(14, 82, 196, 82);
      pdf.setFontSize(12);
      pdf.text(cleanPdfText(`Itemization: Accommodation Room ${b?.roomNumber || 'N/A'} (${diffDays} Nights)`), 14, 92);
      pdf.text(cleanPdfText(`Total Amount Paid: GH₵ ${(b?.totalPrice || 0).toLocaleString()}`), 14, 102);

      pdf.setLineWidth(0.25);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, 112, 196, 112);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(cleanPdfText("Web app developed by SUALAH TELLEM (0553189032)"), 14, 120);

      pdf.save(`Receipt_Room_${b?.roomNumber || 'Booking'}.pdf`);
      addToast('Download Successful', 'success', 'Downloaded PDF Receipt', 3000);
    } catch (fallbackErr) {
      console.error("PDF Receipt fallback failed:", fallbackErr);
      addToast('Download Failed', 'error', 'Could not generate PDF.');
    }
  };

  const handleDownloadInvoicePDF = async () => {
    const element = document.getElementById('print-invoice-sheet');
    addToast('Generating PDF Invoice...', 'info', 'Please wait while the invoice is being generated.', 3000);

    if (element) {
      try {
        const canvas = await executeWithOklchSafeStyles(async () => {
          return await html2canvas(element, { 
            scale: 2, 
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff',
            onclone: sanitizeClonedDoc
          });
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Invoice_${invoiceBooking?.id?.replace('book_', '').toUpperCase() || 'Booking'}.pdf`);
        addToast('Download Successful', 'success', 'Downloaded PDF Invoice', 3000);
        return;
      } catch (error: any) {
        console.warn("Canvas PDF generation failed, using fallback generator:", error);
      }
    }

    try {
      const pdf = new jsPDF();
      const b = invoiceBooking;
      const start = b?.checkInDate ? new Date(b.checkInDate) : new Date();
      const end = b?.checkOutDate ? new Date(b.checkOutDate) : new Date();
      const diffTime = Math.max(0, end.getTime() - start.getTime());
      const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const total = b?.totalPrice || 0;
      const nightlyRate = total / nights;

      pdf.setFontSize(20);
      pdf.text(cleanPdfText("NABSLODGE"), 14, 20);
      pdf.setFontSize(14);
      pdf.text(cleanPdfText(`OFFICIAL INVOICE - ${(b?.branch || branch).toUpperCase()} BRANCH`), 14, 28);
      pdf.setLineWidth(0.5);
      pdf.line(14, 32, 196, 32);

      pdf.setFontSize(11);
      pdf.text(cleanPdfText(`Invoice Ref: INV-${(b?.id || 'N/A').replace('book_', '').toUpperCase()}`), 14, 42);
      pdf.text(cleanPdfText(`Guest Name: ${b?.guestName || 'Valued Guest'}`), 14, 50);
      pdf.text(cleanPdfText(`Contact: ${b?.guestContact || b?.guestPhone || 'N/A'}`), 14, 58);
      pdf.text(cleanPdfText(`Processed By: ${b?.receptionistName || 'Staff'} (ID: ${b?.receptionistId || 'N/A'})`), 14, 66);
      
      pdf.text(cleanPdfText(`Invoice Stay Period: ${b?.checkInDate || 'N/A'} to ${b?.checkOutDate || 'N/A'} (${nights} Nights)`), 14, 76);
      pdf.text(cleanPdfText(`Payment Method: ${b?.paymentMethod || 'Cash / Mobile Money'}`), 14, 84);
      pdf.text(cleanPdfText(`Payment Status: ${b?.paymentStatus || 'Paid'}`), 14, 92);

      pdf.line(14, 98, 196, 98);
      pdf.setFontSize(12);
      pdf.text(cleanPdfText("BILLING ITEMIZATION:"), 14, 108);
      pdf.setFontSize(10);
      pdf.text(cleanPdfText(`Item: Room ${b?.roomNumber || 'N/A'} (${b?.roomType || 'Standard Room'})`), 14, 116);
      pdf.text(cleanPdfText(`Duration: ${nights} Nights @ GH₵ ${nightlyRate.toFixed(2)} / night`), 14, 122);
      pdf.text(cleanPdfText("Note: ALL CHARGES ARE FLAT AND TAX-EXEMPT"), 14, 128);
      
      pdf.line(14, 140, 196, 140);
      pdf.setFontSize(14);
      pdf.text(cleanPdfText(`TOTAL AMOUNT DUE: GH₵ ${total.toLocaleString()}`), 14, 150);

      pdf.setLineWidth(0.25);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, 158, 196, 158);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(cleanPdfText("Web app developed by SUALAH TELLEM (0553189032)"), 14, 165);

      pdf.save(`Invoice_${b?.id || 'Booking'}.pdf`);
      addToast('Download Successful', 'success', 'Downloaded PDF Invoice', 3000);
    } catch (fallbackError) {
      console.error("PDF Invoice fallback failed:", fallbackError);
      addToast('Download Failed', 'error', 'Could not generate PDF.');
    }
  };

  const handleDownloadWalkInPDF = async () => {
    const element = document.getElementById('walkin-invoice-card');
    addToast('Generating PDF Invoice...', 'info', 'Please wait while the receipt is being generated.', 3000);

    if (element) {
      try {
        const canvas = await executeWithOklchSafeStyles(async () => {
          return await html2canvas(element, { 
            scale: 2, 
            useCORS: true,
            scrollX: 0,
            scrollY: 0,
            backgroundColor: '#ffffff',
            onclone: sanitizeClonedDoc
          });
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`WalkIn_Invoice_${walkInReceiptData?.serialNumber || 'Activity'}.pdf`);
        addToast('Download Successful', 'success', 'Downloaded PDF Invoice', 3000);
        return;
      } catch (error: any) {
        console.warn("Canvas Receipt generation failed:", error);
      }
    }

    try {
      const pdf = new jsPDF();
      pdf.setFontSize(20);
      pdf.text(cleanPdfText("NABSLODGE"), 14, 20);
      pdf.setFontSize(14);
      pdf.text(cleanPdfText("WALK-IN ACTIVITY INVOICE & RECEIPT"), 14, 28);
      pdf.setLineWidth(0.5);
      pdf.line(14, 32, 196, 32);

      pdf.setFontSize(11);
      pdf.text(cleanPdfText(`Serial No: ${walkInReceiptData?.serialNumber || 'N/A'}`), 14, 42);
      pdf.text(cleanPdfText(`Guest Name: ${walkInReceiptData?.guestName || 'Valued Guest'}`), 14, 50);
      pdf.text(cleanPdfText(`Phone: ${walkInReceiptData?.guestPhone || 'N/A'}`), 14, 58);
      pdf.text(cleanPdfText(`Activity / Service: ${walkInReceiptData?.serviceType || 'N/A'}`), 14, 66);
      pdf.text(cleanPdfText(`Processed By: ${walkInReceiptData?.receptionistName || 'Staff'}`), 14, 74);
      pdf.text(cleanPdfText(`Payment Status: ${walkInReceiptData?.paymentStatus || 'Paid'}`), 14, 82);

      pdf.line(14, 90, 196, 90);
      pdf.setFontSize(12);
      pdf.text(cleanPdfText(`Total Amount Paid: GH₵ ${(walkInReceiptData?.amountPaid || walkInReceiptData?.totalPrice || 0).toLocaleString()}`), 14, 102);

      pdf.setLineWidth(0.25);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, 112, 196, 112);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(cleanPdfText("Web app developed by SUALAH TELLEM (0553189032)"), 14, 120);

      pdf.save(`WalkIn_Invoice_${walkInReceiptData?.serialNumber || 'Activity'}.pdf`);
      addToast('Download Successful', 'success', 'Downloaded PDF Invoice', 3000);
    } catch (e) {
      console.error("PDF walk-in invoice fallback failed:", e);
      addToast('Download Failed', 'error', 'Could not generate PDF.');
    }
  };

  const handlePrintWalkInReceipt = () => {
    const element = document.getElementById('walkin-invoice-card');
    if (!element) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Walk-In Receipt - ${walkInReceiptData?.serialNumber || 'Receipt'}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111; background: #fff; }
              .no-print, button { display: none !important; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 16px; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
              th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #666; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .text-right { text-align: right; }
              .text-emerald-500 { color: #059669; }
              .font-bold { font-weight: 700; }
              .font-black { font-weight: 900; }
              .text-xl { font-size: 20px; }
              .border-b { border-bottom: 1px solid #eee; }
              .py-6 { padding-top: 24px; padding-bottom: 24px; }
              .footer-credit { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #777; font-family: monospace; }
            </style>
          </head>
          <body>
            ${element.innerHTML}
            <div class="footer-credit">
              Web app developed by SUALAH TELLEM (0553189032)
            </div>
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
      printWindow.document.close();
    }
  };

  const [isFabOpen, setIsFabOpen] = useState(false);
  const [showQuickCheckInModal, setShowQuickCheckInModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);

  // Guest Profile Quick-View Modal
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [selectedGuestName, setSelectedGuestName] = useState('');

  // Sign out confirmation
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // Handover state variables
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverCashInput, setHandoverCashInput] = useState<string>('');
  const [handoverMomoInput, setHandoverMomoInput] = useState<string>('');
  const [handoverNotes, setHandoverNotes] = useState<string>('');

  // Reactive 60-second polling hook to update current timestamp for check-out warning states
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize local and branch state
  const refreshData = () => {
    const allRooms = getRooms();
    const branchRooms = allRooms.filter(r => r.branch === branch);
    setRooms(branchRooms);
    setOtherBranchRooms(allRooms.filter(r => r.branch !== branch));

    const allBookings = getBookings();
    const branchBookings = allBookings.filter(b => b.branch === branch);
    setBookings(branchBookings);

    const allLogs = getLogs();
    const branchLogs = allLogs.filter(l => l.branch === branch || !l.branch);
    setLogs(branchLogs);

    const allDrinkSales = getDrinkSales();
    setDrinkSales(allDrinkSales);

    // Refresh room revenues from localStorage
    try {
      const localRevs = localStorage.getItem('nabslodge_room_revenues');
      const parsedRevs = localRevs ? JSON.parse(localRevs) : [];
      const branchRevs = parsedRevs.filter((r: any) => r.branch === branch);
      setRoomRevenues(branchRevs);
    } catch (err) {
      console.warn("Failed to refresh room revenues from localStorage:", err);
    }

    // Refresh walk-in transactions from localStorage
    try {
      const localWalkIns = localStorage.getItem('nabslodge_activity_ledger');
      const parsedWalkIns = localWalkIns ? JSON.parse(localWalkIns) : [];
      const branchWalkIns = parsedWalkIns.filter((w: any) => w.branch === branch);
      setWalkInTransactions(branchWalkIns);
    } catch (err) {
      console.warn("Failed to refresh walk-ins from localStorage:", err);
    }
  };

  useEffect(() => {
    // Initial data load from local storage
    refreshData();
    setIsLoadingData(true);

    // Subscribe to real-time Firestore updates for the specific branch if available
    let unsubRooms: (() => void) | undefined;
    let unsubBookings: (() => void) | undefined;
    let unsubLogs: (() => void) | undefined;
    let unsubActivity: (() => void) | undefined;
    let unsubRoomRevenue: (() => void) | undefined;
    let unsubWalkIn: (() => void) | undefined;
    let unsubDrinks: (() => void) | undefined;
    let unsubDrinkSales: (() => void) | undefined;

    if (!isFirebaseConfigured) {
      setIsLoadingData(false);
      return;
    }

    // Secure a quick fallback to ensure skeletons resolve even on slow connections
    const fallbackTimer = setTimeout(() => {
      setIsLoadingData(false);
    }, 1000);

    try {
      const roomsQ = query(collection(db, 'rooms'));
      unsubRooms = onSnapshot(roomsQ, (snapshot) => {
        const fetched = snapshot.docs.map((doc) => {
          const data = doc.data() || {};
          return {
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
          } as Room;
        });
        setRooms(fetched.filter(r => r.branch === branch));
        setOtherBranchRooms(fetched.filter(r => r.branch !== branch));
        try {
          saveRooms(fetched);
        } catch (err) {
          console.warn("Local storage rooms merge error:", err);
        }
        setIsLoadingData(false);
      }, (err) => {
        console.warn("Firestore rooms snapshot listener error:", err);
        setIsLoadingData(false);
      });

      const bookingsQ = query(collection(db, 'bookings'), where('branch', '==', branch));
      unsubBookings = onSnapshot(bookingsQ, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
        setBookings(fetched);
        try {
          const allLocalBookings = getBookings();
          const otherBranchBookings = allLocalBookings.filter(b => b.branch !== branch);
          saveBookings([...otherBranchBookings, ...fetched]);
        } catch (err) {
          console.warn("Local storage bookings merge error:", err);
        }
        setIsLoadingData(false);
      }, (err) => {
        console.warn("Firestore bookings snapshot listener error:", err);
        setIsLoadingData(false);
      });

      const logsQ = query(collection(db, 'auditLogs'), where('branch', '==', branch));
      unsubLogs = onSnapshot(logsQ, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
        setLogs(fetched);
      }, (err) => {
        console.warn("Firestore logs snapshot listener error:", err);
      });

      unsubActivity = onSnapshot(collection(db, 'ActivityCatalog'), (snapshot) => {
        const catalogData: any[] = [];
        snapshot.forEach((doc) => {
          catalogData.push({ id: doc.id, ...doc.data() });
        });
        setActivityCatalog(catalogData);
        saveActivityCatalog(catalogData);
      }, (err) => {
        console.warn("Firestore activity catalog snapshot listener error:", err);
      });

      const roomRevenueQ = query(collection(db, 'RoomRevenue'), where('branch', '==', branch));
      unsubRoomRevenue = onSnapshot(roomRevenueQ, (snapshot) => {
        const fetched: any[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() });
        });
        setRoomRevenues(fetched);
        try {
          localStorage.setItem('nabslodge_room_revenues', JSON.stringify(fetched));
        } catch (e) {
          console.error("Failed to update localStorage room revenues:", e);
        }
      }, (err) => {
        console.warn("Firestore room revenues snapshot error:", err);
      });

      const walkInQ = query(collection(db, 'ActivityLedger'), where('branch', '==', branch));
      unsubWalkIn = onSnapshot(walkInQ, (snapshot) => {
        const fetched: any[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() });
        });
        setWalkInTransactions(fetched);
        try {
          localStorage.setItem('nabslodge_activity_ledger', JSON.stringify(fetched));
        } catch (e) {
          console.error("Failed to update localStorage activity ledger:", e);
        }
      }, (err) => {
        console.warn("Firestore walk-ins snapshot error:", err);
      });

      unsubDrinks = onSnapshot(collection(db, 'drinks'), (snapshot) => {
        const fetched: DrinkItem[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as DrinkItem);
        });
        setDrinks(fetched);
        saveDrinks(fetched);
      }, (err) => {
        console.warn("Firestore drinks snapshot error:", err);
      });

      const drinkSalesQ = query(collection(db, 'drinkSales'), where('branch', '==', branch));
      unsubDrinkSales = onSnapshot(drinkSalesQ, (snapshot) => {
        const fetched: DrinkSale[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as DrinkSale);
        });
        setDrinkSales(fetched);
        saveDrinkSales(fetched);
      }, (err) => {
        console.warn("Firestore drink sales snapshot error:", err);
      });
    } catch (e) {
      console.warn("Firestore listener init warning:", e);
      setIsLoadingData(false);
    }

    // Load settings from global data layer
    const loadGlobalSettings = () => {
      const s = getSettings();
      localStorage.setItem('globalCheckInTime', s.checkInTime);
      localStorage.setItem('globalCheckOutTime', s.checkOutTime);
      setGlobalCheckInTime(s.checkInTime);
      setGlobalCheckOutTime(s.checkOutTime);
      setLateCheckOutFee(s.lateCheckOutFee);
    };

    loadGlobalSettings();
    window.addEventListener('globalSettingsUpdated', loadGlobalSettings);

    const handleSettingsChange = () => {
      const formatDateTimeLocal = (date: Date, hours: number, minutes: number = 0) => {
        const d = new Date(date);
        d.setHours(hours, minutes, 0, 0);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      };
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      const savedCheckInTime = localStorage.getItem('globalCheckInTime') || '14:00';
      const savedCheckOutTime = localStorage.getItem('globalCheckOutTime') || '12:00';
      setGlobalCheckInTime(savedCheckInTime);
      setGlobalCheckOutTime(savedCheckOutTime);
      const [inHour, inMinute] = savedCheckInTime.split(':').map(Number);
      const [outHour, outMinute] = savedCheckOutTime.split(':').map(Number);
      
      setResCheckIn(formatDateTimeLocal(today, inHour, inMinute));
      setResCheckOut(formatDateTimeLocal(tomorrow, outHour, outMinute));
    };

    window.addEventListener('storage', handleSettingsChange);
    window.addEventListener('globalSettingsUpdated', handleSettingsChange);

    const handleHandoverEvent = () => {
      const todayDateStr = new Date().toISOString().split('T')[0];
      const key = `nabslodge_shift_reset_${currentUser.id}_${todayDateStr}`;
      setShiftResetGeneralTime(Number(localStorage.getItem(key) || 0));
    };
    window.addEventListener('shiftHandoverCompleted', handleHandoverEvent);
    
    // Set initial date-time values
    handleSettingsChange();

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener('storage', handleSettingsChange);
      window.removeEventListener('globalSettingsUpdated', handleSettingsChange);
      window.removeEventListener('shiftHandoverCompleted', handleHandoverEvent);
      if (unsubRooms) unsubRooms();
      if (unsubBookings) unsubBookings();
      if (unsubLogs) unsubLogs();
      if (unsubActivity) unsubActivity();
      if (unsubRoomRevenue) unsubRoomRevenue();
      if (unsubWalkIn) unsubWalkIn();
      if (unsubDrinks) unsubDrinks();
      if (unsubDrinkSales) unsubDrinkSales();
    };
  }, [currentUser, branch]);

  const handleAddToCart = () => {
    const drink = drinks.find(d => d.id === selectedDrinkId);
    if (!drink) {
      addToast('Validation Error', 'error', 'Please select a valid drink item.');
      return;
    }
    const qtyNum = Number(drinkQty) || 1;
    if (qtyNum <= 0) {
      addToast('Validation Error', 'error', 'Quantity must be at least 1.');
      return;
    }
    if (drink.inStock === false) {
      addToast('Out of Stock', 'error', 'The selected drink is currently marked as out of stock/unavailable.');
      return;
    }
    
    setDrinkCart(prev => {
      const existing = prev.find(item => item.drinkId === drink.id);
      if (existing) {
        return prev.map(item => item.drinkId === drink.id 
          ? { ...item, quantity: item.quantity + qtyNum, subtotal: (item.quantity + qtyNum) * drink.price }
          : item
        );
      }
      return [...prev, {
        drinkId: drink.id,
        drinkName: drink.name,
        quantity: qtyNum,
        unitPrice: drink.price,
        subtotal: drink.price * qtyNum
      }];
    });
    
    setSelectedDrinkId('');
    setDrinkQty(1);
  };

  const handleProcessDrinkSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (drinkCart.length === 0) {
      addToast('Validation Error', 'error', 'Please add at least one drink to the order.');
      return;
    }

    setIsProcessingDrinkSale(true);
    try {
      const serialNumber = 'DRK-' + Date.now().toString().slice(-6);
      const totalPrice = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);

      let paymentStatus: 'Paid' | 'Unpaid' | 'Split' = 'Paid';
      let paidAmount = totalPrice;
      let unpaidAmount = 0;

      if (drinkPaymentMethod === 'Unpaid (Add to Room Bill)') {
        paymentStatus = 'Unpaid';
        paidAmount = 0;
        unpaidAmount = totalPrice;
        if (!drinkBookingId && !drinkRoomNumber) {
          addToast('Validation Error', 'error', 'Unpaid drinks must be assigned to an active checked-in guest booking or room.');
          setIsProcessingDrinkSale(false);
          return;
        }
      } else if (drinkPaymentMethod === 'Split (Paid & Unpaid)') {
        paymentStatus = 'Split';
        paidAmount = Number(drinkSplitPaidAmount) || 0;
        unpaidAmount = Number(drinkSplitUnpaidAmount) || 0;
        if (Math.abs((paidAmount + unpaidAmount) - totalPrice) > 0.01) {
          addToast('Validation Error', 'error', 'Paid amount and Unpaid amount must equal total price.');
          setIsProcessingDrinkSale(false);
          return;
        }
        if (unpaidAmount > 0 && !drinkBookingId && !drinkRoomNumber) {
          addToast('Validation Error', 'error', 'Unpaid portion must be assigned to an active checked-in guest booking or room.');
          setIsProcessingDrinkSale(false);
          return;
        }
      } else if (drinkPaymentMethod === 'Split (Cash + Momo)') {
        paymentStatus = 'Paid';
        if (Math.abs((drinkSplitCashAmount + drinkSplitMomoAmount) - totalPrice) > 0.01) {
          addToast('Validation Error', 'error', 'Cash amount and MoMo amount must equal total price.');
          setIsProcessingDrinkSale(false);
          return;
        }
      }

      const drinkNames = drinkCart.map(i => `${i.drinkName} (x${i.quantity})`).join(', ');

      const newSale: import('../types').DrinkSale = {
        id: 'drksale_' + Math.random().toString(36).substring(2, 9),
        items: drinkCart,
        // Legacy fields mapping first item for backward compatibility (optional)
        drinkId: drinkCart[0].drinkId,
        drinkName: drinkNames,
        quantity: drinkCart.reduce((sum, item) => sum + item.quantity, 0),
        unitPrice: drinkCart[0].unitPrice,
        totalPrice,
        guestName: drinkGuestName.trim() || 'Walk-In Guest',
        roomNumber: drinkRoomNumber.trim() || undefined,
        bookingId: drinkBookingId || undefined,
        receptionistId: currentUser.id,
        receptionistName: currentUser.name,
        branch: branch,
        paymentMethod: drinkPaymentMethod,
        paymentStatus,
        paidAmount,
        unpaidAmount,
        splitCashAmount: drinkPaymentMethod === 'Split (Cash + Momo)' ? drinkSplitCashAmount : undefined,
        splitMomoAmount: drinkPaymentMethod === 'Split (Cash + Momo)' ? drinkSplitMomoAmount : undefined,
        splitPaidMethod: drinkPaymentMethod === 'Split (Paid & Unpaid)' ? drinkSplitPaidMethod : undefined,
        timestamp: getFormattedDateTime(),
        serialNumber: serialNumber
      };

      const added = addDrinkSale(newSale);
      await safeSetDoc(doc(db, 'drinkSales', added.id), {
        ...added,
        dateCreated: serverTimestamp()
      });

      addAuditLog(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        branch,
        'Drink Sale Recorded',
        `Sold ${drinkNames} (GH₵${newSale.totalPrice.toFixed(2)}) to ${newSale.guestName}${newSale.roomNumber ? ` [Room ${newSale.roomNumber}]` : ''} via ${drinkPaymentMethod}.`
      );

      // Persist to Firestore for Manager/Handover Audit
      const saleLogId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      await safeSetDoc(doc(db, 'auditLogs', saleLogId), {
        id: saleLogId,
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        branch: branch,
        action: 'Drink Sale Recorded',
        details: `Sold ${drinkNames} (GH₵${newSale.totalPrice.toFixed(2)}) to ${newSale.guestName}${newSale.roomNumber ? ` [Room ${newSale.roomNumber}]` : ''} via ${drinkPaymentMethod}.`
      });

      setDrinkSales(getDrinkSales());
      setShowDrinkOrderModal(false);
      setDrinkCart([]);
      setSelectedDrinkId('');
      setDrinkQty(1);
      setDrinkGuestName('');
      setDrinkRoomNumber('');
      setDrinkBookingId('');
      setDrinkSplitPaidAmount(0);
      setDrinkSplitUnpaidAmount(0);
      setDrinkSplitPaidMethod('Cash');

      addToast('Drink Sale Recorded', 'success', `Recorded GH₵${newSale.totalPrice.toFixed(2)} for ${drinkNames}. Serial: ${serialNumber}`);
    } catch (err: any) {
      console.error("Failed to process drink sale:", err);
      addToast('Error', 'error', 'Failed to record drink sale.');
    } finally {
      setIsProcessingDrinkSale(false);
    }
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

  const isRecordInActiveShift = useCallback((record: any): boolean => {
    const isMyUser = 
      record.receptionistId === currentUser.id || 
      (currentUser.email && record.receptionistId === currentUser.email) ||
      (currentUser.name && record.receptionistName && record.receptionistName.toLowerCase() === currentUser.name.toLowerCase()) ||
      record.userId === currentUser.id;

    if (!isMyUser) return false;

    const recordMs = parseTimestampMs(record);

    if (recordMs !== null) {
      if (shiftResetGeneralTime && shiftResetGeneralTime > 0) {
        return recordMs > shiftResetGeneralTime;
      }

      const recDate = new Date(recordMs);
      const now = new Date();
      const isToday = (
        recDate.getFullYear() === now.getFullYear() &&
        recDate.getMonth() === now.getMonth() &&
        recDate.getDate() === now.getDate()
      );

      return isToday;
    }

    return false;
  }, [shiftResetGeneralTime, currentUser.id, currentUser.email, currentUser.name]);

  const activeShiftDrinkSales = useMemo(() => {
    return drinkSales.filter(s => isRecordInActiveShift(s) && s.receptionistId === currentUser.id);
  }, [drinkSales, isRecordInActiveShift, currentUser.id]);

  const handleEditDrinkSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleToEdit) return;
    setIsProcessingEditSale(true);

    try {
      const qtyNum = Number(editDrinkSaleQty) || 1;
      const selectedDrink = drinks.find(d => d.id === editDrinkSaleDrinkId);
      const unitPrice = selectedDrink ? selectedDrink.price : (saleToEdit.unitPrice || 0);
      const drinkName = selectedDrink ? selectedDrink.name : (saleToEdit.drinkName || 'Unknown');
      const totalPrice = qtyNum * unitPrice;

      let paymentStatus: 'Paid' | 'Unpaid' | 'Split' = 'Paid';
      let paidAmount = totalPrice;
      let unpaidAmount = 0;

      if (editDrinkSalePaymentMethod === 'Unpaid (Add to Room Bill)') {
        paymentStatus = 'Unpaid';
        paidAmount = 0;
        unpaidAmount = totalPrice;
      }

      let newBookingId = saleToEdit.bookingId;
      if (editDrinkSaleRoomNumber && editDrinkSaleRoomNumber !== saleToEdit.roomNumber) {
        const activeBooking = bookings.find(b => 
          b.roomNumber === editDrinkSaleRoomNumber && 
          (b.status === 'CheckedIn' || b.status === 'checked_in')
        );
        newBookingId = activeBooking ? activeBooking.id : undefined;
      }

      const updatedSale: DrinkSale = {
        ...saleToEdit,
        drinkId: editDrinkSaleDrinkId || saleToEdit.drinkId,
        drinkName,
        unitPrice,
        quantity: qtyNum,
        totalPrice,
        guestName: editDrinkSaleGuestName.trim() || 'Walk-In Guest',
        roomNumber: editDrinkSaleRoomNumber.trim() || undefined,
        bookingId: newBookingId,
        paymentMethod: editDrinkSalePaymentMethod,
        paymentStatus,
        paidAmount,
        unpaidAmount
      };

      updateDrinkSale(updatedSale);
      await safeSetDoc(doc(db, 'drinkSales', updatedSale.id), {
        ...updatedSale,
        dateModified: serverTimestamp()
      }, { merge: true });

      addAuditLog(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        branch,
        'Drink Sale Edited',
        `Edited sale ${saleToEdit.serialNumber || saleToEdit.id}. New Total: GH₵${totalPrice.toFixed(2)} for ${updatedSale.guestName}.`
      );

      // Persist to Firestore for Manager/Handover Audit
      const editLogId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      await safeSetDoc(doc(db, 'auditLogs', editLogId), {
        id: editLogId,
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        branch: branch,
        action: 'Drink Sale Edited',
        details: `Edited drink sale ${saleToEdit.serialNumber || saleToEdit.id}. New Total: GH₵${totalPrice.toFixed(2)} for ${updatedSale.guestName}.`
      });

      setDrinkSales(getDrinkSales());
      setShowEditDrinkSaleModal(false);
      setSaleToEdit(null);
      addToast('Sale Updated', 'success', 'Drink sale has been successfully updated.');
    } catch (err: any) {
      console.error("Failed to update drink sale:", err);
      addToast('Error', 'error', 'Failed to update drink sale.');
    } finally {
      setIsProcessingEditSale(false);
    }
  };

  const handleDeleteDrinkSale = async () => {
    if (!saleToDelete) return;
    setIsProcessingEditSale(true);

    try {
      deleteDrinkSale(saleToDelete.id);
      await safeDeleteDoc(doc(db, 'drinkSales', saleToDelete.id));

      addAuditLog(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        branch,
        'Drink Sale Deleted',
        `Permanently deleted drink sale ${saleToDelete.serialNumber || saleToDelete.id} (Total: GH₵${saleToDelete.totalPrice.toFixed(2)}).`
      );

      // Persist to Firestore for Manager/Handover Audit
      const deleteLogId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      await safeSetDoc(doc(db, 'auditLogs', deleteLogId), {
        id: deleteLogId,
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        branch: branch,
        action: 'Drink Sale Deleted',
        details: `Permanently deleted drink sale ${saleToDelete.serialNumber || saleToDelete.id} (Total: GH₵${saleToDelete.totalPrice.toFixed(2)}).`
      });

      setDrinkSales(getDrinkSales());
      setShowDeleteSaleConfirm(false);
      setSaleToDelete(null);
      addToast('Sale Deleted', 'success', 'Drink sale record has been removed.');
    } catch (err: any) {
      console.error("Failed to delete drink sale:", err);
      addToast('Error', 'error', 'Failed to delete drink sale.');
    } finally {
      setIsProcessingEditSale(false);
    }
  };

  const handleOpenEditDrinkSale = (sale: DrinkSale) => {
    setSaleToEdit(sale);
    setEditDrinkSaleQty(sale.quantity || 1);
    setEditDrinkSaleGuestName(sale.guestName || '');
    setEditDrinkSaleRoomNumber(sale.roomNumber || '');
    setEditDrinkSalePaymentMethod(sale.paymentMethod);
    setEditDrinkSaleDrinkId(sale.drinkId || '');
    setShowEditDrinkSaleModal(true);
  };

  const currentSaleIndex = saleToEdit ? activeShiftDrinkSales.findIndex(s => s.id === saleToEdit.id) : -1;
  const hasNextSale = currentSaleIndex > 0;
  const hasPrevSale = currentSaleIndex < activeShiftDrinkSales.length - 1 && currentSaleIndex !== -1;



  const handleInlineReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResError('');

    if (!resRoomId) {
      setResError('Please select a room.');
      return;
    }

    const room = rooms.find(r => r.id === resRoomId);
    if (!room) {
      setResError('Selected room is invalid.');
      return;
    }

    const cleanedPhone = resGuestContact.replace(/\D/g, '');
    if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('0')) {
      setResError('Phone number must strictly be exactly 10 digits starting with 0 (e.g., 0245556789).');
      return;
    }

    // Auto-append locked global times
    const finalInDate = `${resCheckIn.split('T')[0]}T${globalCheckInTime}`;
    const finalOutDate = `${resCheckOut.split('T')[0]}T${globalCheckOutTime}`;

    const start = new Date(finalInDate);
    const end = new Date(finalOutDate);
    if (end.getTime() <= start.getTime()) {
      setResError('Check-out date must occur after check-in date.');
      return;
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const origTotalPrice = room.price * diffDays;
    let discountAmt = 0;
    if (diffDays >= 10 && resIsFivePercentDiscount) {
      discountAmt = origTotalPrice * 0.05;
    } else if (resManualDiscountAmount > 0) {
      discountAmt = resManualDiscountAmount;
    }
    const totalPrice = Math.max(0, origTotalPrice - discountAmt);

    // Strict custom schema variables
    const isApartment = room.roomType === '2 Bedroom Apartment' || room.roomType === '3 Bedroom Apartment';
    const guestCount = 1; // default to 1 since inline/quick checkin doesn't have a guest count dropdown
    const isOccasionBooking = false; // default to false
    const totalRate = room.price;

    setIsCheckingIn(true);
    try {
      const bookingId = `book_${Math.random().toString(36).substring(2, 11)}`;
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;
      
      let depositVal = 0;
      let actualPaymentStatus: PaymentStatus = 'Paid';
      let actualPaymentMethod = resPaymentMethod as string;

      if ((resPayment as string) === 'Split') {
        depositVal = Math.min(splitCashAmount + splitMomoAmount, totalPrice);
        actualPaymentStatus = depositVal >= totalPrice ? 'Paid' : 'Partially Paid (Split)';
        actualPaymentMethod = 'Split (Cash + Momo)';
      } else if (resPayment === 'Partial') {
        depositVal = initialPartialAmount > 0 ? Math.min(initialPartialAmount, totalPrice) : totalPrice * 0.5;
        actualPaymentStatus = depositVal >= totalPrice ? 'Paid' : 'Partial';
      } else if (resPayment === 'Paid') {
        depositVal = totalPrice;
        actualPaymentStatus = 'Paid';
      } else {
        depositVal = 0;
        actualPaymentStatus = 'Unpaid';
      }

      const pendingBalance = Math.max(0, totalPrice - depositVal);

      const newBooking: Booking = {
        id: bookingId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        branch,
        lodgeBranch: userAssignedBranch,
        discountType: (diffDays >= 10 && resIsFivePercentDiscount) ? '5% Long-Stay' : (resManualDiscountAmount > 0 ? 'Manual' : 'None'),
        discountAmount: discountAmt,
        guestName: resGuestName,
        guestContact: cleanedPhone,
        checkInDate: finalInDate,
        checkOutDate: finalOutDate,
        status: 'CheckedIn',
        totalPrice,
        paymentStatus: actualPaymentStatus,
        deposit: depositVal,
        amountPaid: depositVal,
        balance_due: pendingBalance,
        pending_payment: pendingBalance,
        paymentMethod: depositVal > 0 ? actualPaymentMethod : 'Cash',
        isOccasion: isOccasionBooking,
        guestCount,
        receptionistId: auth.currentUser?.uid || currentUser.id,
        receptionistName: currentUser.name,
        createdAt: getFormattedDateTime(),
        dateCreated: serverTimestamp(),
        totalRate,
        isOccasionBooking,
        roomType: room.roomType,
        occasionMaxGuests: room.occasionBookingMaxGuests || 8,
        occasionPrice: room.occasionBookingPrice || 1000,
        normalMaxGuests: room.normalBookingMaxGuests || 4,
        normalPrice: room.normalBookingPrice || 600
      };

      // Log to RoomRevenue
      if ((resPayment as string) === 'Split') {
        if (splitCashAmount > 0) {
          await logRoomRevenue({
            bookingId: bookingId,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            branch: branch,
            guestName: resGuestName,
            amount: splitCashAmount,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: actualPaymentStatus === 'Paid' ? 'Allocation' : 'Deposit',
            paymentMethod: 'Cash'
          });
        }
        if (splitMomoAmount > 0) {
          await logRoomRevenue({
            bookingId: bookingId,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            branch: branch,
            guestName: resGuestName,
            amount: splitMomoAmount,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: actualPaymentStatus === 'Paid' ? 'Allocation' : 'Deposit',
            paymentMethod: 'Mobile Money'
          });
        }
      } else if (depositVal > 0) {
        await logRoomRevenue({
          bookingId: bookingId,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          branch: branch,
          guestName: resGuestName,
          amount: depositVal,
          receptionistId: currentUser.id,
          receptionistName: currentUser.name,
          revenueType: resPayment === 'Paid' ? 'Allocation' : 'Deposit',
          paymentMethod: resPaymentMethod
        });
      }

      // 1. Save booking to local (Sync)
      createBooking(newBooking);

      // 2. Update room status to Occupied in local (Sync)
      updateRoomStatus(currentUser.id, currentUser.name, 'Receptionist', room.id, 'Occupied');

      // 3. Save booking to Firestore
      await setDoc(doc(db, 'bookings', bookingId), newBooking);

      // 4. Update room status to Occupied in Firestore
      await setDoc(doc(db, 'rooms', room.id), {
        status: 'Occupied'
      }, { merge: true });

      // 5. Add audit log to Firestore
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch: branch,
        action: 'Check-in Guest (Desk)',
        details: `Room: ${room.roomNumber}, Price: GH₵${totalPrice.toFixed(2)}, Payment: ${resPayment}`
      });

      refreshData();
      addToast(
        'Booking Confirmed Successfully!',
        'success',
        `Room ${room.roomNumber} has been booked for ${resGuestName}. Invoice: GH₵${totalPrice.toFixed(2)} (${resPayment}).`,
        6000
      );

      setResGuestName('');
      setResGuestContact('');
      setResRoomId('');
      setSplitCashAmount(0);
      setSplitMomoAmount(0);

      const formatDateTimeLocal = (date: Date, hours: number, minutes: number = 0) => {
        const d = new Date(date);
        d.setHours(hours, minutes, 0, 0);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      };
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      const savedCheckInTime = localStorage.getItem('globalCheckInTime') || '14:00';
      const savedCheckOutTime = localStorage.getItem('globalCheckOutTime') || '12:00';
      const [inHour, inMinute] = savedCheckInTime.split(':').map(Number);
      const [outHour, outMinute] = savedCheckOutTime.split(':').map(Number);
      
      setResCheckIn(formatDateTimeLocal(today, inHour, inMinute));
      setResCheckOut(formatDateTimeLocal(tomorrow, outHour, outMinute));
      
      refreshData();
      setActiveTab('rooms');
    } catch (firestoreErr: any) {
      console.error("Firestore booking creation failed:", firestoreErr);
      setResError("Database Error: " + firestoreErr.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Handle open booking modal
  const handleOpenBooking = (room: Room) => {
    if (showCrossBranch || (room.branch && room.branch !== branch)) {
      alert(`Room ${room.roomNumber} belongs to ${room.branch || (branch === 'Annex' ? 'Ayigya' : 'Annex')} branch and is view-only. You cannot book or modify rooms across branches.`);
      return;
    }
    setSelectedRoom(room);
    setGuestName('');
    setGuestContact('');
    setIsFivePercentDiscount(false);
    setManualDiscountAmount(0);
    
    // Default dates: Today and Tomorrow with hours
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const savedCheckInTime = localStorage.getItem('globalCheckInTime') || '14:00';
    const savedCheckOutTime = localStorage.getItem('globalCheckOutTime') || '12:00';
    const [inHour, inMinute] = savedCheckInTime.split(':').map(Number);
    const [outHour, outMinute] = savedCheckOutTime.split(':').map(Number);

    const formatDateTimeLocal = (date: Date, hours: number, minutes: number = 0) => {
      const d = new Date(date);
      d.setHours(hours, minutes, 0, 0);
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    };

    setCheckInDate(formatDateTimeLocal(today, inHour, inMinute));
    setCheckOutDate(formatDateTimeLocal(tomorrow, outHour, outMinute));
    setPaymentStatus('Paid');
    setBookingIsOccasion(false);
    setBookingGuestCount('1');
    setBookingError('');
    setShowBookingModal(true);
  };

  // Helper to log room revenue transactions under strict structural compliance
  const logRoomRevenue = async (data: {
    bookingId: string;
    roomNumber: string;
    roomType: string;
    branch: string;
    guestName: string;
    amount: number;
    receptionistId: string;
    receptionistName: string;
    revenueType: 'Allocation' | 'Deposit' | 'CheckInBalance' | 'ExtensionFee' | 'CheckoutBalance' | 'DrinkSettlement';
    revenueSubType?: string;
    paymentMethod?: string;
    isFutureBooking?: boolean;
    isPartialDeposit?: boolean;
  }) => {
    try {
      if (!data.amount || Number(data.amount) <= 0) {
        return; // Zero or unpaid balance isolation: do not hit active revenue ledgers
      }
      const revId = `rev_${Math.random().toString(36).substring(2, 11)}`;
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;
      const newRevDoc = {
        id: revId,
        bookingId: data.bookingId,
        roomNumber: data.roomNumber,
        roomType: data.roomType,
        branch: data.branch,
        lodgeBranch: userAssignedBranch,
        guestName: data.guestName,
        amount: Number(data.amount) || 0,
        receptionistId: currentUser.id,
        receptionistName: data.receptionistName,
        revenueType: data.revenueType,
        revenueSubType: data.revenueSubType || '',
        paymentMethod: data.paymentMethod || 'Cash',
        isFutureBooking: !!data.isFutureBooking,
        isPartialDeposit: !!data.isPartialDeposit,
        timestamp: getFormattedDateTime(),
        dateCreated: new Date().toISOString()
      };

      // Optimistically update local roomRevenues state so totals reflect immediately
      setRoomRevenues(prev => {
        const updated = [newRevDoc, ...prev.filter(r => r.id !== revId)];
        try {
          const raw = localStorage.getItem('nabslodge_room_revenues');
          const globalRevs = raw ? JSON.parse(raw) : [];
          const merged = [newRevDoc, ...globalRevs.filter((r: any) => r.id !== revId)];
          localStorage.setItem('nabslodge_room_revenues', JSON.stringify(merged));
        } catch (err) {
          console.error("Failed to write to local nabslodge_room_revenues:", err);
        }
        return updated;
      });

      // Write to Firestore
      await safeSetDoc(doc(db, 'RoomRevenue', revId), newRevDoc);

    } catch (err: any) {
      console.error("Failed to write to RoomRevenue:", err);
      handleFirestoreError(err, OperationType.WRITE, 'RoomRevenue');
    }
  };

  // Submit Booking Form
  const handleCreateBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCheckingIn) return;
    setBookingError('');

    if (!selectedRoom) {
      window.alert("Validation Error: Room Selection is missing. Please select a valid room.");
      return;
    }

    if (!guestName.trim()) {
      window.alert("Validation Error: Guest Name is missing.");
      return;
    }
    if (!guestContact.trim()) {
      window.alert("Validation Error: Guest Contact is missing.");
      return;
    }
    if (!checkInDate) {
      window.alert("Validation Error: Check-In Date is missing.");
      return;
    }
    if (!checkOutDate) {
      window.alert("Validation Error: Check-Out Date is missing.");
      return;
    }

    const cleanedPhone = guestContact.replace(/\D/g, '');
    if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('0')) {
      window.alert("Validation Error: Phone number must strictly be exactly 10 digits starting with 0.");
      setBookingError('Phone number must strictly be exactly 10 digits starting with 0 (e.g., 0245556789).');
      return;
    }

    // Auto-append locked global times
    const finalInDate = `${checkInDate.split('T')[0]}T${globalCheckInTime}`;
    const finalOutDate = `${checkOutDate.split('T')[0]}T${globalCheckOutTime}`;

    const start = new Date(finalInDate);
    const end = new Date(finalOutDate);
    if (end.getTime() <= start.getTime()) {
      window.alert("Validation Error: Check-out date must occur after the check-in date.");
      setBookingError('Check-out date must occur after the check-in date.');
      return;
    }

    setIsCheckingIn(true);
    try {
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let baseRate = selectedRoom.price;
      if (bookingIsMonthly) {
        baseRate = selectedRoom.monthlyPremiumPrice || selectedRoom.price;
      } else if (selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment') {
        baseRate = bookingIsOccasion 
          ? (selectedRoom.occasionBookingPrice || 1000) 
          : (selectedRoom.normalBookingPrice || 600);
      }
      const origTotalPrice = bookingIsMonthly ? baseRate : (baseRate * diffDays);
      let discountAmt = 0;
      if (diffDays >= 10 && isFivePercentDiscount) {
        discountAmt = origTotalPrice * 0.05;
      } else if (manualDiscountAmount > 0) {
        discountAmt = manualDiscountAmount;
      }
      const totalPrice = Math.max(0, origTotalPrice - discountAmt);

      // Strict custom schema and form variable alignment check
      const isApartment = selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment';
      const isOccasionBooking = bookingIsOccasion;
      const guestCount = parseInt(bookingGuestCount);
      const occasionMaxGuests = selectedRoom.occasionBookingMaxGuests || 8;
      const normalMaxGuests = selectedRoom.normalBookingMaxGuests || 4;
      const occasionPrice = selectedRoom.occasionBookingPrice || 1000;
      const normalPrice = selectedRoom.normalBookingPrice || 600;
      const totalRate = baseRate;

      if (isApartment) {
        if (isOccasionBooking) {
          if (!guestCount) {
            window.alert("Validation Error: Guest count must be specified for Apartment booking.");
            setIsCheckingIn(false);
            return;
          }
          if (guestCount > occasionMaxGuests) {
            window.alert(`Validation Error: Guest count (${guestCount}) exceeds occasion max guests limit (${occasionMaxGuests}).`);
            setIsCheckingIn(false);
            return;
          }
          if (totalRate !== occasionPrice) {
            window.alert(`Validation Error: Total rate (GH₵${totalRate}) must match occasion price (GH₵${occasionPrice}).`);
            setIsCheckingIn(false);
            return;
          }
        } else if (bookingIsMonthly) {
          if (!guestCount) {
            window.alert("Validation Error: Guest count must be specified for Apartment booking.");
            setIsCheckingIn(false);
            return;
          }
          if (guestCount > normalMaxGuests) {
            window.alert(`Validation Error: Guest count (${guestCount}) exceeds normal max guests limit (${normalMaxGuests}).`);
            setIsCheckingIn(false);
            return;
          }
          const monthlyPrice = selectedRoom.monthlyPremiumPrice || selectedRoom.price;
          if (totalRate !== monthlyPrice) {
            window.alert(`Validation Error: Total rate (GH₵${totalRate}) must match monthly premium price (GH₵${monthlyPrice}).`);
            setIsCheckingIn(false);
            return;
          }
        } else {
          if (!guestCount) {
            window.alert("Validation Error: Guest count must be specified for Apartment booking.");
            setIsCheckingIn(false);
            return;
          }
          if (guestCount > normalMaxGuests) {
            window.alert(`Validation Error: Guest count (${guestCount}) exceeds normal max guests limit (${normalMaxGuests}).`);
            setIsCheckingIn(false);
            return;
          }
          if (totalRate !== normalPrice) {
            window.alert(`Validation Error: Total rate (GH₵${totalRate}) must match normal price (GH₵${normalPrice}).`);
            setIsCheckingIn(false);
            return;
          }
        }
      }
      
      const actualPaymentStatus: PaymentStatus = paymentStatus === 'Partial' ? 'Partially Paid (50% Deposit)' : paymentStatus;
      const depositVal = paymentStatus === 'Partial' ? totalPrice * 0.5 : (paymentStatus === 'Paid' ? totalPrice : 0);
      const pendingBalance = Math.max(0, totalPrice - depositVal);

      const bookingId = `book_${Math.random().toString(36).substring(2, 11)}`;
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

      const newBooking: Booking = {
        id: bookingId,
        roomId: selectedRoom.id,
        roomNumber: selectedRoom.roomNumber,
        branch,
        lodgeBranch: userAssignedBranch,
        discountType: (diffDays >= 10 && isFivePercentDiscount) ? '5% Long-Stay' : (manualDiscountAmount > 0 ? 'Manual' : 'None'),
        discountAmount: discountAmt,
        guestName,
        guestContact: cleanedPhone,
        checkInDate: finalInDate,
        checkOutDate: finalOutDate,
        status: 'CheckedIn',
        totalPrice,
        paymentStatus: actualPaymentStatus,
        deposit: depositVal,
        amountPaid: depositVal,
        balance_due: pendingBalance,
        pending_payment: pendingBalance,
        paymentMethod: depositVal > 0 ? bookingPaymentMethod : 'Cash',
        isOccasion: bookingIsOccasion,
        isMonthlyBooking: bookingIsMonthly,
        selectedMonth: bookingIsMonthly ? (bookingSelectedMonth || null) : null,
        guestCount,
        receptionistId: auth.currentUser?.uid || currentUser.id,
        receptionistName: currentUser.name,
        createdAt: getFormattedDateTime(),
        dateCreated: serverTimestamp(),
        totalRate: Number(totalRate),
        isOccasionBooking: bookingIsOccasion,
        roomType: selectedRoom.roomType,
        occasionMaxGuests,
        occasionPrice,
        normalMaxGuests,
        normalPrice
      };

      // 1. Save booking to local (Sync)
      createBooking(newBooking);

      // 2. Set room status to Occupied in local (Sync)
      updateRoomStatus(currentUser.id, currentUser.name, 'Receptionist', selectedRoom.id, 'Occupied');

      // 3. Save booking to Firestore
      await setDoc(doc(db, 'bookings', bookingId), newBooking);

      // Log to RoomRevenue only if funds were collected
      if (depositVal > 0) {
        await withLoading(logRoomRevenue({
          bookingId: bookingId,
          roomNumber: selectedRoom.roomNumber,
          roomType: selectedRoom.roomType,
          branch: branch,
          guestName: guestName,
          amount: depositVal,
          receptionistId: currentUser.id,
          receptionistName: currentUser.name,
          revenueType: paymentStatus === 'Paid' ? 'Allocation' : 'Deposit',
          paymentMethod: bookingPaymentMethod
        }));
      }

      // Trigger the automated state modal displaying the completed invoice summary
      setInvoiceBooking(newBooking);
      setInvoiceType('CheckIn');
      setShowPrintInvoiceModal(true);

      // 4. Update room status in Firestore
      await setDoc(doc(db, 'rooms', selectedRoom.id), {
        status: 'Occupied'
      }, { merge: true });

      // 5. Add audit log to Firestore
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch,
        action: 'Check-In Guest',
        details: `Registered guest "${guestName}" (${guestContact}) in Room ${selectedRoom.roomNumber} for ${diffDays} nights. Status: Occupied.`
      });

      setShowBookingModal(false);
      addToast(
        'Booking Confirmed Successfully!',
        'success',
        `Room ${selectedRoom.roomNumber} has been booked for ${guestName}. Invoice: GH₵${totalPrice.toFixed(2)} (${paymentStatus}).`,
        6000
      );
    } catch (firestoreErr: any) {
      console.error("Firestore booking creation failed:", firestoreErr);
      alert(`CRITICAL FIRESTORE ERROR: Failed to create booking.\n\nError details: ${firestoreErr.message}`);
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Real-time date conflict checking using date strings (YYYY-MM-DD)
  // Hospitality standard rule: check-out day is turnover day. A new stay can check in on the day the previous stay checks out.
  const checkSchedulingConflict = (roomId: string, checkIn: string, checkOut: string, ignoreBookingId?: string) => {
    if (!roomId || !checkIn || !checkOut) return false;
    
    const reqStartStr = checkIn.split('T')[0];
    const reqEndStr = checkOut.split('T')[0];
    if (!reqStartStr || !reqEndStr || reqEndStr <= reqStartStr) return false;

    return bookings.some(b => {
      if (b.id === ignoreBookingId) return false;
      // Match on roomId or raw roomNumber
      const isSameRoom = b.roomId === roomId || b.roomNumber === roomId || `Room ${b.roomNumber}` === roomId;
      if (!isSameRoom) return false;
      if (b.status === 'Cancelled' || b.status === 'No Show' || b.status === 'Completed' || b.status === 'CheckedOut') return false;
      
      const existStartStr = b.checkInDate ? b.checkInDate.split('T')[0] : '';
      const existEndStr = b.checkOutDate ? b.checkOutDate.split('T')[0] : '';
      if (!existStartStr || !existEndStr) return false;
      
      // Stays overlap if and only if new check-in is before existing check-out AND new check-out is after existing check-in
      return (reqStartStr < existEndStr) && (reqEndStr > existStartStr);
    });
  };

  // Get mapped blocked dates for a specific room to support custom date picker highlights
  const getBlockedDatesForRoom = (roomId: string) => {
    const blocked: { [dateStr: string]: { guestName: string; bookingId: string } } = {};
    if (!roomId) return blocked;

    const activeBookings = bookings.filter(b => 
      (b.roomId === roomId || b.roomNumber === roomId || `Room ${b.roomNumber}` === roomId) && 
      b.status !== 'Cancelled' && 
      b.status !== 'No Show' && 
      b.status !== 'Completed' && 
      b.status !== 'CheckedOut'
    );

    activeBookings.forEach(b => {
      if (!b.checkInDate || typeof b.checkInDate !== 'string' || !b.checkOutDate || typeof b.checkOutDate !== 'string') return;
      const start = new Date(b.checkInDate.split('T')[0]);
      const end = new Date(b.checkOutDate.split('T')[0]);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

      const current = new Date(start);
      while (current < end) {
        const yr = current.getFullYear();
        const mo = String(current.getMonth() + 1).padStart(2, '0');
        const dy = String(current.getDate()).padStart(2, '0');
        const dateStr = `${yr}-${mo}-${dy}`;
        blocked[dateStr] = { guestName: b.guestName, bookingId: b.id };
        current.setDate(current.getDate() + 1);
      }
    });

    return blocked;
  };

  // Submit Future Stay Booking
  const handleBookFutureStaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingAction) return;
    setFutureStayError('');

    if (!futureRoomId) {
      setFutureStayError("Validation Error: Room Selection is missing. Please select a valid room.");
      return;
    }
    if (!futureGuestName.trim()) {
      setFutureStayError("Validation Error: Guest Name is missing.");
      return;
    }
    if (!futureGuestPhone.trim()) {
      setFutureStayError("Validation Error: Guest Phone/Contact is missing.");
      return;
    }
    if (!futureCheckIn) {
      setFutureStayError("Validation Error: Check-In Date is missing.");
      return;
    }
    if (!futureCheckOut) {
      setFutureStayError("Validation Error: Check-Out Date is missing.");
      return;
    }

    const room = rooms.find(r => r.id === futureRoomId);
    if (!room) {
      setFutureStayError('Selected room is invalid.');
      return;
    }

    const cleanedPhone = futureGuestPhone.replace(/\D/g, '');
    if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('0')) {
      setFutureStayError('Phone number must strictly be exactly 10 digits starting with 0.');
      return;
    }

    const finalInDate = `${futureCheckIn.split('T')[0]}T${globalCheckInTime}`;
    const finalOutDate = `${futureCheckOut.split('T')[0]}T${globalCheckOutTime}`;

    const start = new Date(finalInDate);
    const end = new Date(finalOutDate);
    if (end.getTime() <= start.getTime()) {
      setFutureStayError('Check-out date must occur after check-in date.');
      return;
    }

    // Check for date conflicts
    const conflict = checkSchedulingConflict(room.id, finalInDate, finalOutDate);
    if (conflict) {
      setFutureStayError('❌ Room conflict detected! This room number is already locked for these dates on the schedule.');
      return;
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let baseRate = room.price;
    if (futureIsMonthly) {
      baseRate = room.monthlyPremiumPrice || room.price;
    } else if (room.roomType === '2 Bedroom Apartment' || room.roomType === '3 Bedroom Apartment') {
      baseRate = futureIsOccasion 
        ? (room.occasionBookingPrice || 1000) 
        : (room.normalBookingPrice || 600);
    }
    const origTotalPrice = futureIsMonthly ? baseRate : (baseRate * diffDays);
    let discountAmt = 0;
    if (diffDays >= 10 && futureIsFivePercentDiscount) {
      discountAmt = origTotalPrice * 0.05;
    } else if (futureManualDiscountAmount > 0) {
      discountAmt = futureManualDiscountAmount;
    }
    const totalPrice = Math.max(0, origTotalPrice - discountAmt);
    const minDeposit = totalPrice * 0.5;

    let finalFuturePaid = 0;
    let actualPaymentStatus: PaymentStatus = 'Paid';
    let actualPaymentMethod = resPaymentMethod as string;

    if ((resPayment as string) === 'Split') {
      finalFuturePaid = Math.min(splitCashAmount + splitMomoAmount, totalPrice);
      actualPaymentStatus = finalFuturePaid >= totalPrice ? 'Paid' : (finalFuturePaid > 0 ? 'Partially Paid (Split)' : 'Unpaid');
      actualPaymentMethod = 'Split (Cash + Momo)';
    } else if (resPayment === 'Partial') {
      finalFuturePaid = futureAmountPaid;
      actualPaymentStatus = finalFuturePaid >= totalPrice ? 'Paid' : 'Partial';
    } else if (resPayment === 'Paid') {
      finalFuturePaid = totalPrice;
      actualPaymentStatus = 'Paid';
    } else {
      finalFuturePaid = 0;
      actualPaymentStatus = 'Unpaid';
    }

    // Strict custom schema and form variable alignment check
    const isApartment = room.roomType === '2 Bedroom Apartment' || room.roomType === '3 Bedroom Apartment';
    const isOccasionBooking = futureIsOccasion;
    const guestCount = parseInt(futureGuestCount);
    const occasionMaxGuests = room.occasionBookingMaxGuests || 8;
    const normalMaxGuests = room.normalBookingMaxGuests || 4;
    const occasionPrice = room.occasionBookingPrice || 1000;
    const normalPrice = room.normalBookingPrice || 600;
    const totalRate = baseRate;

    if (isApartment) {
      if (isOccasionBooking) {
        if (!guestCount) {
          setFutureStayError("Validation Error: Guest count must be specified for Apartment booking.");
          return;
        }
        if (guestCount > occasionMaxGuests) {
          setFutureStayError(`Validation Error: Guest count (${guestCount}) exceeds occasion max guests limit (${occasionMaxGuests}).`);
          return;
        }
        if (totalRate !== occasionPrice) {
          setFutureStayError(`Validation Error: Total rate (GH₵${totalRate}) must match occasion price (GH₵${occasionPrice}).`);
          return;
        }
      } else if (futureIsMonthly) {
        if (!guestCount) {
          setFutureStayError("Validation Error: Guest count must be specified for Apartment booking.");
          return;
        }
        if (guestCount > normalMaxGuests) {
          setFutureStayError(`Validation Error: Guest count (${guestCount}) exceeds normal max guests limit (${normalMaxGuests}).`);
          return;
        }
        const monthlyPrice = room.monthlyPremiumPrice || room.price;
        if (totalRate !== monthlyPrice) {
          setFutureStayError(`Validation Error: Total rate (GH₵${totalRate}) must match monthly premium price (GH₵${monthlyPrice}).`);
          return;
        }
      } else {
        if (!guestCount) {
          setFutureStayError("Validation Error: Guest count must be specified for Apartment booking.");
          return;
        }
        if (guestCount > normalMaxGuests) {
          setFutureStayError(`Validation Error: Guest count (${guestCount}) exceeds normal max guests limit (${normalMaxGuests}).`);
          return;
        }
        if (totalRate !== normalPrice) {
          setFutureStayError(`Validation Error: Total rate (GH₵${totalRate}) must match normal price (GH₵${normalPrice}).`);
          return;
        }
      }
    }

    if (resPayment === 'Partial' && (finalFuturePaid <= 0 || isNaN(finalFuturePaid))) {
      setFutureStayError(`❌ Please enter a valid initial payment / deposit amount greater than GH₵0.`);
      return;
    }
    if (resPayment === 'Partial' && finalFuturePaid > totalPrice) {
      setFutureStayError(`❌ Initial deposit (GH₵${finalFuturePaid.toFixed(2)}) cannot exceed the total stay cost (GH₵${totalPrice.toFixed(2)}).`);
      return;
    }

    setIsProcessingAction(true);
    const bookingId = `book_${Math.random().toString(36).substring(2, 11)}`;
    try {
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

      const initialBookingStatus: BookingStatus = 'Pending';

      const newBooking: Booking = {
        id: bookingId,
        roomId: room.id,
        roomNumber: room.roomNumber,
        branch,
        lodgeBranch: userAssignedBranch,
        discountType: (diffDays >= 10 && futureIsFivePercentDiscount) ? '5% Long-Stay' : (futureManualDiscountAmount > 0 ? 'Manual' : 'None'),
        discountAmount: discountAmt,
        guestName: futureGuestName,
        guestContact: cleanedPhone,
        checkInDate: finalInDate,
        checkOutDate: finalOutDate,
        status: initialBookingStatus,
        totalPrice,
        paymentStatus: actualPaymentStatus,
        deposit: finalFuturePaid,
        amountPaid: finalFuturePaid,
        balance_due: Math.max(0, totalPrice - finalFuturePaid),
        pending_payment: Math.max(0, totalPrice - finalFuturePaid),
        isOccasion: futureIsOccasion,
        isMonthlyBooking: futureIsMonthly,
        selectedMonth: futureIsMonthly ? (futureSelectedMonth || null) : null,
        guestCount,
        receptionistId: auth.currentUser?.uid || currentUser.id,
        receptionistName: currentUser.name,
        createdAt: getFormattedDateTime(),
        dateCreated: serverTimestamp(),
        totalRate: Number(totalRate),
        isOccasionBooking: futureIsOccasion,
        roomType: room.roomType,
        paymentMethod: finalFuturePaid > 0 ? actualPaymentMethod : 'Cash',
        occasionMaxGuests,
        occasionPrice,
        normalMaxGuests,
        normalPrice,
        isFutureBooking: true,
        bookingType: 'future'
      };

      // Add custom email attribute safely
      if (futureGuestEmail.trim()) {
        (newBooking as any).guestEmail = futureGuestEmail.trim();
      }
      // Store amountPaid attribute accurately using finalFuturePaid
      (newBooking as any).amountPaid = finalFuturePaid;
      (newBooking as any).deposit = finalFuturePaid;
      (newBooking as any).isFutureBooking = true;
      (newBooking as any).isPartialDeposit = finalFuturePaid < totalPrice;

      // 1. Save booking to local (Sync)
      createBooking(newBooking);

      // 2. Save booking to Firestore
      await setDoc(doc(db, 'bookings', bookingId), newBooking);

      const isPartialDep = finalFuturePaid < totalPrice;

      // Log deposit to RoomRevenue if there is any deposit paid
      if ((resPayment as string) === 'Split') {
        if (splitCashAmount > 0) {
          await logRoomRevenue({
            bookingId: bookingId,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            branch: branch,
            guestName: futureGuestName,
            amount: splitCashAmount,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'Deposit',
            revenueSubType: 'Future Booking',
            paymentMethod: 'Cash',
            isFutureBooking: true,
            isPartialDeposit: isPartialDep
          });
        }
        if (splitMomoAmount > 0) {
          await logRoomRevenue({
            bookingId: bookingId,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            branch: branch,
            guestName: futureGuestName,
            amount: splitMomoAmount,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'Deposit',
            revenueSubType: 'Future Booking',
            paymentMethod: 'Mobile Money',
            isFutureBooking: true,
            isPartialDeposit: isPartialDep
          });
        }
      } else if (finalFuturePaid > 0) {
        await logRoomRevenue({
          bookingId: bookingId,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          branch: branch,
          guestName: futureGuestName,
          amount: finalFuturePaid,
          receptionistId: currentUser.id,
          receptionistName: currentUser.name,
          revenueType: 'Deposit',
          revenueSubType: 'Future Booking',
          paymentMethod: resPaymentMethod,
          isFutureBooking: true,
          isPartialDeposit: isPartialDep
        });
      }

      // 2. Add audit log
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: getFormattedDateTime(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch,
        action: 'Book Future Stay',
        details: `Created future reservation for "${futureGuestName}" in Room ${room.roomNumber} from ${finalInDate} to ${finalOutDate}. Deposit Paid: GH₵${finalFuturePaid.toFixed(2)}.`
      });

      setShowFutureStayModal(false);
      
      // Reset fields
      setFutureGuestName('');
      setFutureGuestPhone('');
      setFutureGuestEmail('');
      setFutureRoomId('');
      setFutureAmountPaid(0);
      setSplitCashAmount(0);
      setSplitMomoAmount(0);

      addToast(
        'Future Stay Booked!',
        'success',
        `Pending reservation created for ${futureGuestName} in Room ${room.roomNumber}.`,
        5000
      );
    } catch (err: any) {
      console.error("Failed to book future stay:", err);
      handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Mark Guest as No Show and Release Room
  const handleMarkNoShow = async (booking: Booking) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      const nowStr = getFormattedDateTime();
      
      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;
      
      // 1. Update Booking status to 'Cancelled' (due to No Show) in Firestore
      await setDoc(doc(db, 'bookings', booking.id), {
        status: 'Cancelled',
        noShow: true,
        cancellationReason: 'No Show',
        branch: branch,
        lodgeBranch: userAssignedBranch,
        roomId: booking.roomId,
        roomType: booking.roomType || '',
        guestCount: Number(booking.guestCount) || 1,
        totalRate: Number(booking.totalRate || booking.totalPrice) || 0,
        isOccasionBooking: booking.isOccasionBooking ?? booking.isOccasion ?? false,
        dateCreated: serverTimestamp()
      }, { merge: true });

      // Update local state if snapshots are not immediate enough
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'Cancelled', noShow: true } : b));

      // Save to local storage for offline synchronization
      try {
        const localBookings = getBookings();
        const updatedLocalBookings = localBookings.map(b => b.id === booking.id ? { ...b, status: 'Cancelled' as BookingStatus, noShow: true } : b);
        saveBookings(updatedLocalBookings);
      } catch (err) {
        console.warn("Failed to update local storage for no show:", err);
      }

      // 2. Add audit log
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: nowStr,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch,
        action: 'Mark No Show',
        details: `Booking #${booking.id.substring(5, 11).toUpperCase()} for guest ${booking.guestName} was marked as No Show. Non-refundable deposit of GH₵${(booking as any).amountPaid || 0} preserved.`
      });

      addToast(
        'Guest Marked as No Show',
        'info',
        `Guest ${booking.guestName} marked as No Show. Room released on calendar.`,
        5000
      );
    } catch (err: any) {
       console.error("Failed to mark No Show:", err);
       handleFirestoreError(err, OperationType.WRITE, `bookings/${booking.id}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Confirm Arrival Check-In and Collect Balance
  const handleConfirmArrivalCheckIn = async () => {
    if (!arrivalBooking) {
      window.alert("Validation Error: No arrival reservation selected.");
      return;
    }
    if (isProcessingAction) return;
    setIsProcessingAction(true);

    try {
      if (!arrivalBooking.id || (!arrivalBooking.roomId && !arrivalBooking.roomNumber)) {
        throw new Error("Missing critical booking data (ID, Room ID, or Room Number).");
      }

      const nowStr = getFormattedDateTime();
      const depositPaid = getActualPaidAmount(arrivalBooking);
      const isPayNow = arrivalPaymentPathway === 'payNow';
      const updatedAmountPaid = isPayNow ? arrivalBooking.totalPrice : depositPaid;
      const updatedPaymentStatus = isPayNow ? 'Paid' : (depositPaid > 0 ? 'Partially Paid (50% Deposit)' : 'Unpaid');
      const arrivalPendingBalance = Math.max(0, arrivalBooking.totalPrice - updatedAmountPaid);

      let singleNightRate = Number(arrivalBooking.totalRate || (arrivalBooking as any).price || 0);
      if (!singleNightRate && arrivalBooking.totalPrice) {
        const checkIn = new Date(arrivalBooking.checkInDate);
        const checkOut = new Date(arrivalBooking.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        singleNightRate = arrivalBooking.totalPrice / nights;
      }

      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

      // Locate the exact matching room document by ID or Room Number
      const targetRoom = rooms.find(r => r.id === arrivalBooking.roomId || String(r.roomNumber) === String(arrivalBooking.roomNumber));
      const targetRoomId = targetRoom ? targetRoom.id : arrivalBooking.roomId;

      // 1. Update Booking status to 'CheckedIn', amountPaid, deposit, paymentStatus, and balance_due
      const updatedBooking: Booking = {
        ...arrivalBooking,
        roomId: targetRoomId,
        status: 'CheckedIn',
        paymentStatus: updatedPaymentStatus,
        deposit: updatedAmountPaid,
        amountPaid: updatedAmountPaid,
        amountReceived: updatedAmountPaid,
        balance_due: arrivalPendingBalance,
        pending_payment: arrivalPendingBalance
      };

      // Preserve and forward ruleset snapshot variables: 'lodgeBranch', 'roomId', 'guestCount', 'totalRate', and 'isOccasionBooking'
      await withLoading(setDoc(doc(db, 'bookings', arrivalBooking.id), {
        status: 'CheckedIn',
        amountPaid: updatedAmountPaid,
        amountReceived: updatedAmountPaid,
        deposit: updatedAmountPaid,
        paymentStatus: updatedPaymentStatus,
        balance_due: arrivalPendingBalance,
        pending_payment: arrivalPendingBalance,
        branch: branch,
        lodgeBranch: userAssignedBranch,
        roomId: targetRoomId,
        roomType: arrivalBooking.roomType || '',
        guestCount: Number(arrivalBooking.guestCount) || 1,
        totalRate: singleNightRate,
        isOccasionBooking: arrivalBooking.isOccasionBooking ?? arrivalBooking.isOccasion ?? false
      }, { merge: true }));

      // Log check-in balance to RoomRevenue
      if (isPayNow) {
        const balanceAmt = arrivalBooking.totalPrice - depositPaid;
        if (balanceAmt > 0) {
          const rObj = rooms.find(rm => rm.id === targetRoomId || String(rm.roomNumber) === String(arrivalBooking.roomNumber));
          await logRoomRevenue({
            bookingId: arrivalBooking.id,
            roomNumber: arrivalBooking.roomNumber,
            roomType: rObj?.roomType || 'Standard Room',
            branch: branch,
            guestName: arrivalBooking.guestName,
            amount: balanceAmt,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'CheckInBalance',
            paymentMethod: bookingPaymentMethod
          });
        }
      }

      // 2. Set Room status to 'Occupied' in Firestore
      if (targetRoomId) {
        await setDoc(doc(db, 'rooms', targetRoomId), {
          status: 'Occupied'
        }, { merge: true });
      }

      // Update local state if snapshots are not immediate enough
      setBookings(prev => prev.map(b => b.id === arrivalBooking.id ? updatedBooking : b));
      setRooms(prev => prev.map(r => (r.id === targetRoomId || String(r.roomNumber) === String(arrivalBooking.roomNumber)) ? { ...r, status: 'Occupied' } : r));

      // Save to local storage for offline synchronization
      try {
        const localBookings = getBookings();
        const updatedLocalBookings = localBookings.map(b => b.id === arrivalBooking.id ? { ...b, ...updatedBooking } : b);
        saveBookings(updatedLocalBookings);
        
        const localRooms = getRooms();
        const updatedLocalRooms = localRooms.map(r => (r.id === targetRoomId || String(r.roomNumber) === String(arrivalBooking.roomNumber)) ? { ...r, status: 'Occupied' as RoomStatus } : r);
        saveRooms(updatedLocalRooms);
        updateRoomStatus(currentUser.id, currentUser.name, currentUser.role, targetRoomId, 'Occupied');
      } catch (err) {
        console.warn("Failed to update local storage for arrival check-in:", err);
      }

      // 3. Add audit log
      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      await setDoc(doc(db, 'auditLogs', logId), {
        timestamp: nowStr,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: 'Receptionist',
        branch,
        action: 'Arrival Check-In',
        details: isPayNow 
          ? `Pending guest ${arrivalBooking.guestName} has checked in. Balance of GH₵${(arrivalBooking.totalPrice - depositPaid).toFixed(2)} collected.`
          : `Pending guest ${arrivalBooking.guestName} checked in with Pay on Check-Out option. Remainder will be collected on checkout.`
      });

      // 4. Launch thermal print sheet for Check-In
      setInvoiceBooking(updatedBooking);
      setInvoiceType('CheckIn');
      setShowArrivalModal(false);
      setShowPrintInvoiceModal(true);

      addToast(
        'Guest Checked In Successfully!',
        'success',
        `Guest ${arrivalBooking.guestName} is now Checked In to Room ${arrivalBooking.roomNumber}.`,
        5000
      );
    } catch (err: any) {
      console.error("Arrival check-in failed:", err);
      addToast(
        'Check-In Failed',
        'error',
        err.message || 'An unexpected error occurred during check-in.',
        5000
      );
      handleFirestoreError(err, OperationType.WRITE, `bookings/${arrivalBooking?.id}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleSaveWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInGuestName.trim()) {
      setWalkInError('Guest Name is required');
      return;
    }
    const total = Number(walkInTotalCharged);
    if (isNaN(total) || total <= 0) {
      setWalkInError('Total Charged must be a positive number');
      return;
    }
    const received = Number(walkInAmountPaid);
    if (isNaN(received) || received < 0) {
      setWalkInError('Amount Received must be a valid non-negative number');
      return;
    }

    setIsSavingWalkIn(true);
    setWalkInError('');

    try {
      const transactionId = `act_${Math.random().toString(36).substring(2, 11)}`;
      const serialNumber = `ACT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = getFormattedDateTime();

      const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

      const payload: WalkInActivityInput = {
        id: transactionId,
        serialNumber: serialNumber,
        guestName: walkInGuestName,
        guestPhone: walkInGuestPhone || 'N/A',
        guestEmail: 'guest@nabslodge.com',
        serviceType: walkInServiceType,
        totalPrice: total,
        amountPaid: received,
        paymentStatus: walkInPaymentStatus,
        paymentMethod: walkInPaymentMethod,
        receptionistId: currentUser.id,
        receptionistName: currentUser.name,
        branch: branch,
        lodgeBranch: userAssignedBranch,
        timestamp: timestamp
      };

      // Generate invoice HTML & send via Gmail utility if available
      try {
        const invoiceHtml = `
          <div style="font-family: sans-serif; padding: 20px; color: #111;">
            <h2 style="color: #2563eb; margin-bottom: 4px;">NABSLODGE - WALK-IN ACTIVITY INVOICE</h2>
            <p style="font-size: 12px; color: #666; margin-top: 0;">Serial No: ${serialNumber} | Date: ${timestamp}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p><strong>Guest:</strong> ${walkInGuestName} (${walkInGuestPhone || 'N/A'})</p>
            <p><strong>Service:</strong> ${walkInServiceType}</p>
            <p><strong>Branch:</strong> ${userAssignedBranch}</p>
            <p><strong>Total Amount:</strong> GH₵ ${total.toFixed(2)}</p>
            <p><strong>Amount Paid:</strong> GH₵ ${received.toFixed(2)} (${walkInPaymentStatus})</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p style="font-size: 11px; color: #888;">Web app developed by SUALAH TELLEM (0553189032)</p>
          </div>
        `;
        sendActivityInvoiceViaGmail('guest@nabslodge.com', invoiceHtml);
      } catch (e) {
        console.warn("Gmail invoice auto-send skipped:", e);
      }

      // Save to localStorage cache immediately for instant UI feedback
      try {
        const existing = JSON.parse(localStorage.getItem('nabslodge_activity_ledger') || '[]');
        localStorage.setItem('nabslodge_activity_ledger', JSON.stringify([payload, ...existing]));
      } catch {}

      try {
        await setDoc(doc(db, 'ActivityLedger', transactionId), payload);

        // Write audit log
        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        await setDoc(doc(db, 'auditLogs', logId), {
          timestamp: timestamp,
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: 'Receptionist',
          branch: branch,
          action: 'Walk-In Activity Billing',
          details: `Walk-in guest "${walkInGuestName}" billed GH₵ ${total.toFixed(2)} for ${walkInServiceType}. Paid: GH₵ ${received.toFixed(2)} (${walkInPaymentStatus}). Invoice ${serialNumber} generated.`
        });
      } catch (fErr: any) {
        console.warn("Firestore ActivityLedger write warning (transaction saved locally):", fErr);
      }

      addToast(
        'Walk-In Transaction Logged',
        'success',
        `Transaction logged & invoice ${serialNumber} generated.`,
        4000
      );

      // Open Invoice Modal
      setWalkInReceiptData(payload);
      setShowWalkInReceiptModal(true);

      // Reset
      setWalkInGuestName('');
      setWalkInGuestPhone('');
      if (activityCatalog.length > 0) {
        const firstItem = activityCatalog[0];
        setWalkInServiceType(firstItem.name);
        setWalkInTotalCharged(firstItem.price.toString());
        setWalkInAmountPaid(firstItem.price.toString());
      } else {
        setWalkInServiceType('Photography Session');
        setWalkInTotalCharged('200');
        setWalkInAmountPaid('200');
      }
      setWalkInPaymentStatus('Paid');
      setShowWalkInModal(false);
    } catch (err: any) {
      console.error("Firestore walk-in logging failed:", err);
      if (err.message?.includes('permission') || err.code === 'permission-denied') {
        setWalkInError(
          'Security Permission Denied: Your account role does not have authorization to write to "ActivityLedger" in Firestore. \n\n' +
          'Troubleshooting Guide:\n' +
          '1. Ensure you are signed in as an authorized Receptionist.\n' +
          '2. Check if Firestore rules are deployed for "ActivityLedger" on the Firebase Console.\n' +
          '3. Make sure your current session is not expired. Try logging out and back in.'
        );
      } else {
        setWalkInError(`Failed to save: ${err.message}`);
      }
    } finally {
      setIsSavingWalkIn(false);
    }
  };

  // Handle invoice display for check-out
  const handleOpenInvoice = (room: Room) => {
    if (showCrossBranch || (room.branch && room.branch !== branch)) {
      alert(`Room ${room.roomNumber} belongs to ${room.branch || (branch === 'Annex' ? 'Ayigya' : 'Annex')} branch and is view-only. You cannot process check-outs across branches.`);
      return;
    }
    const activeBook = bookings.find(b => (b.roomId === room.id || (b.roomNumber && String(b.roomNumber) === String(room.roomNumber))) && b.status === 'CheckedIn');
    if (activeBook) {
      setSelectedBooking(activeBook);
      setCheckoutSuccess(false);
      setShowInvoiceModal(true);
    } else {
      alert('Error: No active booking found for this room.');
    }
  };

  // Process actual check-out transaction
  const handleConfirmCheckout = async () => {
    console.log("handleConfirmCheckout called for guest:", selectedBooking?.guestName);
    if (!currentUser) {
      window.alert("You must be logged in to checkout.");
      return;
    }
    if (!selectedBooking) {
      window.alert("Validation Error: No booking selected for Check-Out.");
      return;
    }
    if (isCheckingOut) {
      window.alert("Checkout is already in progress.");
      return;
    }

    const currentBooking = bookings.find(b => b.id === selectedBooking.id) || selectedBooking;
    if (currentBooking.status === 'CheckedOut' || currentBooking.status === 'checked_out') {
      window.alert('This room has already been checked out.');
      setShowInvoiceModal(false);
      return;
    }

    setIsCheckingOut(true);
    try {
      const checkoutDateStr = getFormattedDateTime();

      // Find unpaid or split drink sales associated with this booking or room
      const bookingUnpaidDrinks = drinkSales.filter(s =>
        s.bookingId === selectedBooking.id &&
        isUnpaidDrink(s)
      );

      const unpaidDrinksTotal = bookingUnpaidDrinks.reduce((sum, s) => {
        return sum + getDrinkUnpaidAmount(s);
      }, 0);

      const originalDiscountAmt = Number(selectedBooking.discountAmount || 0);
      const originalDiscountType = selectedBooking.discountType || 'None';

      const isFivePercentNow = (!selectedBooking.discountType || selectedBooking.discountType === 'None' || originalDiscountAmt === 0) && checkoutIsFivePercent;
      const fivePercentVal = isFivePercentNow ? (selectedBooking.totalPrice * 0.05) : 0;
      
      const checkoutDiscountAmt = fivePercentVal + (checkoutManualDiscount || 0);
      const finalDiscountAmount = originalDiscountAmt + checkoutDiscountAmt;

      let finalDiscountType = originalDiscountType;
      if (checkoutManualDiscount > 0) {
        if (originalDiscountType === '5% Long-Stay' || isFivePercentNow) {
          finalDiscountType = '5% Long-Stay + Manual';
        } else if (originalDiscountType === 'Manual' || originalDiscountType === 'None') {
          finalDiscountType = 'Manual';
        } else if (!originalDiscountType.includes('Manual')) {
          finalDiscountType = `${originalDiscountType} + Manual`;
        }
      } else {
        if (isFivePercentNow) {
          finalDiscountType = '5% Long-Stay';
        } else {
          finalDiscountType = originalDiscountType;
        }
      }

      const oldFee = Number((selectedBooking as any).lateCheckOutFeeApplied || 0);
      const baseRoomPrice = Math.max(0, selectedBooking.totalPrice - oldFee - checkoutDiscountAmt);
      const lateCheckOutFeeApplied = applyLateCheckOutFee ? lateCheckOutFee : 0;
      const baseCheckoutTotal = baseRoomPrice + lateCheckOutFeeApplied;
      const roomStayTotal = baseCheckoutTotal;
      const finalTotalPrice = roomStayTotal;
      const totalAmountCollected = roomStayTotal + unpaidDrinksTotal;

      // 1. Update local data storage
      checkoutBooking(
        currentUser.id,
        currentUser.name,
        selectedBooking.id,
        checkoutNextStatus,
        finalTotalPrice,
        lateCheckOutFeeApplied,
        checkoutPaymentMethod,
        finalDiscountType,
        finalDiscountAmount
      );

      // 2. Attempt Firestore sync if connected
      try {
        let singleNightRate = Number(selectedBooking.totalRate || (selectedBooking as any).price || 0);
        if (!singleNightRate && selectedBooking.totalPrice) {
          const checkIn = parseSafeDate(selectedBooking.checkInDate) || new Date();
          const checkOut = parseSafeDate(selectedBooking.checkOutDate) || new Date();
          const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) || 1;
          singleNightRate = selectedBooking.totalPrice / nights;
        }

        const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

        const priorPaidAmount = getActualPaidAmount(selectedBooking);
        const computedPrior = priorPaidAmount > 0 ? priorPaidAmount : Math.max(0, finalTotalPrice - lateCheckOutFeeApplied);
        await setDoc(doc(db, 'bookings', selectedBooking.id), {
          status: 'CheckedOut',
          paymentStatus: 'Paid',
          totalPrice: finalTotalPrice,
          amountPaid: totalAmountCollected,
          priorAmountPaid: computedPrior,
          deposit: totalAmountCollected,
          discountType: finalDiscountType,
          discountAmount: finalDiscountAmount,
          balance_due: 0,
          pending_payment: 0,
          lateCheckOutFeeApplied,
          actualCheckOutDate: checkoutDateStr,
          branch: branch,
          lodgeBranch: userAssignedBranch,
          roomId: selectedBooking.roomId,
          roomType: selectedBooking.roomType || '',
          guestCount: Number(selectedBooking.guestCount) || 1,
          totalRate: singleNightRate,
          isOccasionBooking: selectedBooking.isOccasionBooking ?? selectedBooking.isOccasion ?? false,
          dateCreated: serverTimestamp()
        }, { merge: true });

        // Log checkout payment components to RoomRevenue (Excluding unpaid drink settlement so it moves directly to drink revenue)
        const rObj = rooms.find(rm => rm.id === selectedBooking.roomId);
        const depositPaid = getActualPaidAmount(selectedBooking);
        const roomBalanceDue = (finalTotalPrice - lateCheckOutFeeApplied) - depositPaid;

        if (roomBalanceDue > 0) {
          await logRoomRevenue({
            bookingId: selectedBooking.id,
            roomNumber: selectedBooking.roomNumber,
            roomType: rObj?.roomType || 'Standard Room',
            branch: branch,
            guestName: selectedBooking.guestName,
            amount: roomBalanceDue,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'CheckoutBalance',
            paymentMethod: checkoutPaymentMethod
          });
        }

        if (unpaidDrinksTotal > 0) {
          await logRoomRevenue({
            bookingId: selectedBooking.id,
            roomNumber: selectedBooking.roomNumber,
            roomType: rObj?.roomType || 'Standard Room',
            branch: branch,
            guestName: selectedBooking.guestName,
            amount: unpaidDrinksTotal,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'DrinkSettlement',
            paymentMethod: checkoutPaymentMethod
          });

          for (const sale of bookingUnpaidDrinks) {
            const updatedSale = {
              ...sale,
              paymentStatus: 'Paid' as const,
              paidAmount: sale.totalPrice,
              unpaidAmount: 0,
              settledPaymentMethod: checkoutPaymentMethod
            };
            await setDoc(doc(db, 'drinkSales', sale.id), updatedSale, { merge: true });
          }
          const updatedDrinkSalesList = drinkSales.map(s => {
            if (bookingUnpaidDrinks.some(bs => bs.id === s.id)) {
              return { 
                ...s, 
                paymentStatus: 'Paid' as const, 
                paidAmount: s.totalPrice, 
                unpaidAmount: 0, 
                settledPaymentMethod: checkoutPaymentMethod
              };
            }
            return s;
          });
          setDrinkSales(updatedDrinkSalesList);
          saveDrinkSales(updatedDrinkSalesList);
        }

        if (lateCheckOutFeeApplied > 0) {
          await logRoomRevenue({
            bookingId: selectedBooking.id,
            roomNumber: selectedBooking.roomNumber,
            roomType: rObj?.roomType || 'Standard Room',
            branch: branch,
            guestName: selectedBooking.guestName,
            amount: lateCheckOutFeeApplied,
            receptionistId: currentUser.id,
            receptionistName: currentUser.name,
            revenueType: 'ExtensionFee',
            revenueSubType: 'EXTENSION_FEE',
            paymentMethod: checkoutPaymentMethod
          });
        }

        await setDoc(doc(db, 'rooms', selectedBooking.roomId), {
          status: checkoutNextStatus
        }, { merge: true });

        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        const feeDetails = applyLateCheckOutFee ? ` (Late checkout fee of GH₵${lateCheckOutFee} applied. New total: GH₵${finalTotalPrice})` : '';
        await setDoc(doc(db, 'auditLogs', logId), {
          timestamp: checkoutDateStr,
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: 'Receptionist',
          branch,
          action: 'Check-Out Guest',
          details: `Guest ${selectedBooking.guestName} checked out of Room ${selectedBooking.roomNumber}${feeDetails}. Room set to status: ${checkoutNextStatus}.`
        });
      } catch (fErr) {
        console.warn("Firestore sync error (proceeding with local checkout):", fErr);
      }

      refreshData();
      setActiveBooking(null);

      // Launch final settlement invoice view showing the breakdown of the stay
      const priorPaidAmount = getActualPaidAmount(selectedBooking);
      const computedPrior = priorPaidAmount > 0 ? priorPaidAmount : Math.max(0, finalTotalPrice - lateCheckOutFeeApplied);
      setInvoiceBooking({
        ...selectedBooking,
        status: 'CheckedOut',
        paymentStatus: 'Paid',
        totalPrice: finalTotalPrice,
        amountPaid: totalAmountCollected,
        priorAmountPaid: computedPrior,
        deposit: totalAmountCollected,
        discountType: finalDiscountType,
        discountAmount: finalDiscountAmount,
        lateCheckOutFeeApplied,
        actualCheckOutDate: checkoutDateStr
      } as any);
      setInvoiceType('CheckOut');
      setShowInvoiceModal(false);
      setShowPrintInvoiceModal(true);

      setCheckoutSuccess(true);
      addToast(
        'Check-Out Processed Successfully!',
        'success',
        `Guest ${selectedBooking.guestName} has successfully checked out of Room ${selectedBooking.roomNumber}. Receipt Generated.`,
        5000
      );
    } catch (err: any) {
      console.error("Checkout update failed:", err);
      window.alert("Checkout Error: " + (err?.message || err));
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Toggle maintenance status for a room
  const handleUpdateRoomStatus = async (room: Room, newStatus: RoomStatus) => {
    if (showCrossBranch || (room.branch && room.branch !== branch)) {
      alert(`Room ${room.roomNumber} belongs to ${room.branch || (branch === 'Annex' ? 'Ayigya' : 'Annex')} branch and is view-only. You cannot change room status across branches.`);
      return;
    }
    if (room.status === 'Occupied' && newStatus !== 'Occupied') {
      alert('Cannot change status of occupied room. Please complete guest check-out first.');
      return;
    }

    try {
      const oldStatus = room.status;

      // 1. Update local database state first
      updateRoomStatus(currentUser.id, currentUser.name, currentUser.role, room.id, newStatus);

      // 2. Update Room Status in Firestore (if available)
      try {
        await setDoc(doc(db, 'rooms', room.id), {
          status: newStatus
        }, { merge: true });

        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        await setDoc(doc(db, 'auditLogs', logId), {
          timestamp: getFormattedDateTime(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          branch,
          action: 'Update Room Status',
          details: `Room ${room.roomNumber} status changed from ${oldStatus} to ${newStatus}.`
        });
      } catch (fErr) {
        console.warn("Firestore status update warning (local state preserved):", fErr);
      }

      refreshData();

      addToast(
        'Room Status Updated',
        'info',
        `Room ${room.roomNumber} status changed to "${newStatus}".`,
        4000
      );
    } catch (err: any) {
      console.error("Room status update failed:", err);
      alert(`Error updating room status: ${err?.message || err}`);
    }
  };

  const handleToggleMaintenance = (room: Room) => {
    const newStatus: RoomStatus = room.status === 'Maintenance' ? 'Available' : 'Maintenance';
    handleUpdateRoomStatus(room, newStatus);
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (confirm("Are you sure you want to cancel this booking? This will free the room immediately.")) {
      const bookingToCancel = bookings.find(b => b.id === bookingId);
      if (!bookingToCancel) {
        alert("Booking not found.");
        return;
      }

      try {
        let singleNightRate = Number(bookingToCancel.totalRate || (bookingToCancel as any).price || 0);
        if (!singleNightRate && bookingToCancel.totalPrice) {
          const checkIn = new Date(bookingToCancel.checkInDate);
          const checkOut = new Date(bookingToCancel.checkOutDate);
          const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) || 1;
          singleNightRate = bookingToCancel.totalPrice / nights;
        }

        const userAssignedBranch = currentUser.assignedBranch || currentUser.branch || branch;

        // 1. Update booking status to Cancelled in local (Sync)
        cancelBooking(currentUser.id, currentUser.name, bookingId);

        // 2. Update booking status to Cancelled in Firestore
        await setDoc(doc(db, 'bookings', bookingId), {
          status: 'Cancelled',
          branch: branch,
          lodgeBranch: userAssignedBranch,
          roomId: bookingToCancel.roomId,
          roomType: bookingToCancel.roomType || '',
          guestCount: Number(bookingToCancel.guestCount) || 1,
          totalRate: singleNightRate,
          isOccasionBooking: bookingToCancel.isOccasionBooking ?? bookingToCancel.isOccasion ?? false,
          dateCreated: serverTimestamp()
        }, { merge: true });

        // 3. Set Room status to Available in Firestore
        await setDoc(doc(db, 'rooms', bookingToCancel.roomId), {
          status: 'Available'
        }, { merge: true });

        // 4. Add audit log to Firestore
        const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
        await setDoc(doc(db, 'auditLogs', logId), {
          timestamp: getFormattedDateTime(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: 'Receptionist',
          branch,
          action: 'Cancel Booking',
          details: `Cancelled booking for guest ${bookingToCancel.guestName} in Room ${bookingToCancel.roomNumber}. Room freed (Available).`
        });

        refreshData();
        addToast(
          'Booking Cancelled',
          'warning',
          `Successfully cancelled check-in for Room ${bookingToCancel.roomNumber}.`,
          4000
        );
      } catch (firestoreErr: any) {
        console.error("Firestore booking cancellation failed:", firestoreErr);
        alert(`CRITICAL FIRESTORE ERROR: Failed to cancel booking.\n\nError details: ${firestoreErr.message}`);
      }
    }
  };

  const getRoomEffectiveStatus = (room: Room): RoomStatus => {
    const activeBooking = bookings.find(b => 
      (b.roomId === room.id || (b.roomNumber && String(b.roomNumber) === String(room.roomNumber))) && 
      b.status === 'CheckedIn' && 
      (b.branch === room.branch || !b.branch || b.branch === branch)
    );
    if (activeBooking) return 'Occupied';
    return room.status;
  };

  // Count metrics for header stats
  const totalRoomsCount = rooms.length;
  const occupiedCount = rooms.filter(r => getRoomEffectiveStatus(r) === 'Occupied').length;
  const availableCount = rooms.filter(r => getRoomEffectiveStatus(r) === 'Available').length;
  const maintenanceCount = rooms.filter(r => getRoomEffectiveStatus(r) === 'Maintenance').length;
  const cleaningCount = rooms.filter(r => getRoomEffectiveStatus(r) === 'Cleaning').length;

  // Get active bookings that are due for checkout within 2 hours (or overdue)
  const getDueSoonBookings = () => {
    const now = new Date().getTime() + (tick * 0); // Reactive dependency on 60s tick
    const checkOutTimeSetting = localStorage.getItem('globalCheckOutTime') || '12:00';
    return bookings.filter(b => {
      if (b.status !== 'CheckedIn') return false;
      const targetStr = b.checkOutDate.includes('T') ? b.checkOutDate : `${b.checkOutDate}T${checkOutTimeSetting}:00`;
      const checkoutTime = new Date(targetStr).getTime();
      const diffMs = checkoutTime - now;
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours <= 2;
    });
  };

  const dueSoonBookings = getDueSoonBookings();

  const getBookingUnpaidDrinks = (bookingId: string, roomNumber?: string) => {
    return drinkSales.filter(s =>
      s.bookingId === bookingId &&
      isUnpaidDrink(s)
    );
  };

  const getBookingUnpaidDrinksTotal = (bookingId: string, roomNumber?: string) => {
    return getBookingUnpaidDrinks(bookingId, roomNumber).reduce((sum, s) => {
      return sum + getDrinkUnpaidAmount(s);
    }, 0);
  };

  const receptionistDrinkSalesMap = useMemo(() => {
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

  const getActiveShiftRevenue = () => {

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

    // Filter walk-in transactions
    const activeWalkIns = walkInTransactions.filter(isRecordInActiveShift);

    const walkInTotal = activeWalkIns.reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);
    const walkInCash = activeWalkIns.filter(t => isCashMethod(t.paymentMethod)).reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);
    const walkInMomo = activeWalkIns.filter(t => isMomoMethod(t.paymentMethod)).reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);

    // Filter room revenues (excluding settled drinks)
    const activeRoomRevs = roomRevenues.filter(r => isRecordInActiveShift(r) && r.revenueType !== 'DrinkSettlement');

    const roomTotal = activeRoomRevs.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const roomCash = activeRoomRevs.filter(r => isCashMethod(r.paymentMethod || r.paymentMode)).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const roomMomo = activeRoomRevs.filter(r => isMomoMethod(r.paymentMethod || r.paymentMode)).reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    // Filter settled drinks at checkout (DrinkSettlement) recorded during this shift by this receptionist
    const activeDrinkSettlements = roomRevenues.filter(r => isRecordInActiveShift(r) && r.revenueType === 'DrinkSettlement' && r.receptionistId === currentUser.id);

    // Use memoized active shift drink sales
    const activeDrinkSales = activeShiftDrinkSales;

    let drinkCash = 0;
    let drinkMomo = 0;

    activeDrinkSales.forEach(s => {
      // EXCLUDE drink sales that were settled at checkout to avoid double counting with RoomRevenue DrinkSettlement
      if (s.settledPaymentMethod) return;

      // Only count the PAID portion of a sale
      const paid = Number(s.paidAmount || (s.paymentStatus === 'Paid' ? s.totalPrice : 0));
      if (paid <= 0) return;

      // Also ensure it's not a purely unpaid sale that somehow has a paid amount (safety check)
      if (s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid') return;

      const method = s.paymentMethod || 'Cash';
      if (method === 'Split (Cash + Momo)') {
        const cashPart = Number(s.splitCashAmount) || (paid / 2);
        const momoPart = Number(s.splitMomoAmount) || (paid / 2);
        drinkCash += cashPart;
        drinkMomo += momoPart;
      } else if (method === 'Split (Paid & Unpaid)') {
        if (s.splitPaidMethod === 'Mobile Money' || isMomoMethod(s.splitPaidMethod || '')) {
          drinkMomo += paid;
        } else {
          drinkCash += paid;
        }
      } else if (isMomoMethod(method)) {
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
      activeWalkIns,
      activeRoomRevs,
      activeDrinkSales,
      activeDrinkSettlements
    };
  };

  const handleOpenHandoverModal = () => {
    const stats = getActiveShiftRevenue();
    setHandoverCashInput(stats.cashTotal.toString());
    setHandoverMomoInput(stats.momoTotal.toString());
    setHandoverNotes('');
    setShowHandoverModal(true);
  };

  const handleCompleteShiftHandover = async () => {
    const cashVal = parseFloat(handoverCashInput) || 0;
    const momoVal = parseFloat(handoverMomoInput) || 0;
    const totalVal = cashVal + momoVal;
    const stats = getActiveShiftRevenue();

    // Construct itemized audit breakdown snapshot of all actions performed during this shift
    const itemsBreakdown: HandoverItemBreakdown[] = [
      ...stats.activeRoomRevs.map((r: any) => {
        const assocBooking = bookings.find(b => b.id === r.bookingId);
        
        const isFuture = !!r.isFutureBooking || r.revenueSubType === 'Future Booking' || 
          (assocBooking && (assocBooking.isFutureBooking || assocBooking.bookingType === 'future' || assocBooking.status === 'Reserved' || assocBooking.status === 'Pending'));
        
        const total = assocBooking?.totalPrice || r.totalPrice || 0;
        const paid = Number(r.amount || 0);
        const isPartial = r.isPartialDeposit || (assocBooking && (assocBooking.paymentStatus === 'Partial' || assocBooking.paymentStatus === 'Partially Paid (50% Deposit)' || (paid > 0 && total > 0 && paid < total))) || (r.revenueType === 'Deposit' && total > paid);

        const dType = assocBooking?.discountType || r.discountType;
        const dAmt = assocBooking?.discountAmount || r.discountAmount || 0;

        let prefix = '';
        if (dType === '5% Long-Stay') {
          prefix = `[DISCOUNTED: 5%] `;
        } else if (dType === 'Manual') {
          prefix = `[MANUAL DISCOUNT: GH₵ ${dAmt}] `;
        }

        if (isFuture) {
          if (isPartial) {
            prefix += `[Future Booking - Partial Deposit] `;
          } else {
            prefix += `[Future Booking] `;
          }
        } else if (isPartial) {
          prefix += `[Partial Deposit] `;
        }

        const roomLabel = r.roomNumber ? `Room ${r.roomNumber}` : 'Room';
        const typeLabel = r.roomType ? ` (${r.roomType})` : '';
        const guestLabel = ` - Guest: ${r.guestName || 'Guest'}`;
        let description = `${prefix}${roomLabel}${typeLabel}${guestLabel}`;
        if (dAmt > 0 && total > 0) {
          const origPrice = total + dAmt;
          description += ` (GH₵${origPrice.toFixed(0)} - GH₵${dAmt.toFixed(0)} = GH₵${total.toFixed(0)})`;
        }

        return {
          id: r.id || `room_rev_${Math.random().toString(36).substring(2, 7)}`,
          type: 'Room Booking' as const,
          description: description,
          roomNumber: r.roomNumber || '',
          guestName: r.guestName || 'Walk-in Guest',
          serviceOrType: isFuture ? (isPartial ? 'Future Booking (Partial Deposit)' : 'Future Booking') : (r.roomType || 'Room Check-in'),
          amount: paid,
          paymentMethod: r.paymentMethod || r.paymentMode || 'Cash',
          timestamp: r.timestamp || r.date || r.createdAt || getFormattedDateTime(),
          isFutureBooking: isFuture,
          isPartialDeposit: isPartial
        };
      }),
      ...stats.activeWalkIns.map((w: any) => ({
        id: w.id || `walkin_${Math.random().toString(36).substring(2, 7)}`,
        type: 'Walk-In Activity' as const,
        description: `${w.serviceType || 'Service'} - Guest: ${w.guestName || 'Walk-in Guest'}`,
        guestName: w.guestName || 'Walk-in Guest',
        serviceOrType: w.serviceType || 'Walk-in Activity',
        amount: Number(w.amountPaid || w.totalPrice || 0),
        paymentMethod: w.paymentMethod || 'Cash',
        timestamp: w.timestamp || w.dateCreated || w.createdAt || getFormattedDateTime()
      })),
      ...stats.activeDrinkSales.map((s: any) => {
        const paid = getDrinkPaidAmount(s);
        const hasUnpaid = isUnpaidDrink(s);
        const label = hasUnpaid 
          ? (s.paymentStatus === 'Split' || s.paymentMethod === 'Split (Paid & Unpaid)' ? ' [PARTIAL]' : ' [UNPAID]')
          : (s.settledPaymentMethod ? ' [SETTLED AT CHECKOUT]' : '');
        return {
          id: s.id || `drink_${Math.random().toString(36).substring(2, 7)}`,
          type: 'Drink Sale' as const,
          description: s.items ? `Drink Purchase: ${s.drinkName} - Guest: ${s.guestName || 'Walk-in Guest'}${label}` : `Drink Purchase: ${s.drinkName || 'Drink'} (x${s.quantity || 1}) - Guest: ${s.guestName || 'Walk-in Guest'}${label}`,
          roomNumber: s.roomNumber || '',
          guestName: s.guestName || 'Walk-in Guest',
          serviceOrType: s.drinkName || 'Drink Purchase',
          amount: paid,
          paymentMethod: s.settledPaymentMethod || s.paymentMethod || 'Cash',
          timestamp: s.timestamp || getFormattedDateTime()
        };
      }),
      ...stats.activeDrinkSettlements.map((ds: any) => ({
        id: ds.id || `drink_settle_${Math.random().toString(36).substring(2, 7)}`,
        type: 'Drink Sale' as const,
        description: `Unpaid Drinks Settled at Checkout - Guest: ${ds.guestName || 'Guest'}`,
        roomNumber: ds.roomNumber || '',
        guestName: ds.guestName || 'Guest',
        serviceOrType: 'Drinks Tab Settlement',
        amount: Number(ds.amount || 0),
        paymentMethod: ds.paymentMethod || 'Cash',
        timestamp: ds.timestamp || ds.createdAt || getFormattedDateTime()
      })),
      ...logs.filter(l => isRecordInActiveShift(l) && l.userId === currentUser.id).map(l => ({
        id: l.id || `audit_${Math.random().toString(36).substring(2, 7)}`,
        type: 'Audit Log' as const,
        description: l.details || l.action,
        guestName: 'Staff Action',
        serviceOrType: l.action,
        amount: 0,
        paymentMethod: 'N/A',
        timestamp: l.timestamp || getFormattedDateTime()
      }))
    ];

    await withLoading((async () => {
      try {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const shiftResetKey = `nabslodge_shift_reset_${currentUser.id}_${todayDateStr}`;
        const resetTime = Date.now();
        
        // 1. Log the handover record (saves to Firestore under /handovers/{id} and LocalStorage)
        const handover = addHandover(
          currentUser.id,
          currentUser.name,
          branch,
          cashVal,
          momoVal,
          totalVal,
          stats.roomCash,
          stats.roomMomo,
          stats.walkInCash,
          stats.walkInMomo,
          stats.drinkCash,
          stats.drinkMomo,
          handoverNotes,
          itemsBreakdown
        );

        // Save to Firestore
        await setDoc(doc(db, 'handovers', handover.id), {
          ...handover,
          dateCreated: serverTimestamp()
        });

        // 2. Save general shift reset time in localStorage and Firestore
        localStorage.setItem(shiftResetKey, resetTime.toString());
        localStorage.setItem(`nabslodge_shift_reset_${currentUser.id}`, resetTime.toString());
        
        try {
          const rawLocalUsers = localStorage.getItem('nabslodge_users');
          if (rawLocalUsers) {
            const localUsers = JSON.parse(rawLocalUsers);
            if (Array.isArray(localUsers)) {
              const updatedUsers = localUsers.map((u: any) => 
                u.id === currentUser.id ? { ...u, lastShiftReset: resetTime } : u
              );
              localStorage.setItem('nabslodge_users', JSON.stringify(updatedUsers));
            }
          }
        } catch (e) {
          console.warn("Failed to update user's lastShiftReset in localStorage", e);
        }

        setShiftResetGeneralTime(resetTime);
        window.dispatchEvent(new Event('shiftHandoverCompleted'));

        await setDoc(doc(db, 'users', currentUser.id), {
          lastShiftReset: resetTime
        }, { merge: true });

        setShowHandoverModal(false);
        onLogout();

        addToast(
          'Handover Completed',
          'success',
          `Shift handover of GH₵${totalVal.toFixed(2)} has been recorded and you have been signed out.`
        );
      } catch (err: any) {
        console.error("Failed to complete shift handover:", err);
        addToast('Handover Error', 'error', 'An error occurred during shift handover.');
      }
    })());
  };

  const theme = getThemeClasses(isDarkMode);

  return (
    <div id="receptionist-dashboard-container" tabIndex={-1} className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-200 min-h-screen w-full flex flex-col md:flex-row font-sans outline-none">
      
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
          <div className="flex items-center gap-3 mb-4">
            <div 
              onDoubleClick={() => {
                if (!isHistoryUnlocked) {
                  setShowHistoryPinModal(true);
                } else {
                  setIsHistoryUnlocked(false);
                }
              }}
              title="Double-click to access secured sections"
              className="cursor-pointer select-none shrink-0"
            >
              <NabsLodgeLogo size="md" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight leading-tight text-zinc-900 dark:text-zinc-50">Nabslodge<br/>{branch}</h1>
            </div>
          </div>
          <div className="px-3 py-2 text-xs font-mono rounded-xl border bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
            <div className="text-[10px] uppercase tracking-widest font-bold mb-0.5 text-zinc-400 dark:text-zinc-500">Receptionist</div>
            <div className="truncate" title={currentUser.name}>{currentUser.name}</div>
          </div>
        </div>

        <nav 
          className="flex-1 overflow-y-auto overscroll-contain py-4 px-4 space-y-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <button
            onClick={() => { setActiveTab('rooms'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'rooms'
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10')
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Bed className="w-4 h-4" />
            Room Board ({rooms.length})
          </button>
          
          <button
            onClick={() => { setActiveTab('reservations'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'reservations'
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10')
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Make Reservation
          </button>

          <button
            onClick={() => { setActiveTab('quickCalendar'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'quickCalendar'
                ? (isDarkMode ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10')
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Calendar className="w-4 h-4 text-emerald-500" />
            Availability Calendar
          </button>
          
          {isHistoryUnlocked && (
            <button
              onClick={() => { 
                setActiveTab('history'); 
                setIsSidebarOpen(false); 
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'history'
                  ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10')
                  : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
              }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4" />
                Booking History ({bookings.length})
              </div>
              <Unlock className="w-3.5 h-3.5 text-emerald-500" />
            </button>
          )}

          <button
            onClick={() => { setActiveTab('activityLedger'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'activityLedger'
                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md shadow-blue-500/5' : 'bg-blue-600 text-white shadow-md shadow-blue-500/10')
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Receipt className="w-4 h-4" />
            Walk-In Activity
          </button>

          <button
            onClick={() => { setActiveTab('drinks'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors md:rounded-xl md:text-xs md:font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'drinks'
                ? (isDarkMode ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20' : 'bg-purple-600 text-white shadow-md shadow-purple-500/10')
                : (isDarkMode ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200' : 'text-zinc-700 hover:bg-zinc-100')
            }`}
          >
            <Wine className="w-4 h-4 text-purple-400" />
            Drinks ({drinkSales.length})
          </button>

          <div className={`mt-8 border-t pt-6 ${isDarkMode ? 'border-zinc-900' : 'border-slate-200'}`}>
            <h4 className={`text-[10px] font-mono uppercase tracking-widest px-4 mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Security Status</h4>
            <div className={`flex items-center gap-2 px-4 text-xs font-medium ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
              <MapPin className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              Strict Isolation Active
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
            Sign Out Shift
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
            <div className="flex flex-row items-center gap-2">
              <NabsLodgeLogo size="xs" />
              <h1 className="font-bold tracking-tight text-sm text-zinc-900 dark:text-zinc-50">{branch}</h1>
            </div>
          </div>
          <div className="flex flex-row items-center gap-2">
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

        {/* TOP-BAR REAL-TIME SEARCH & FILTER UTILITY */}
        <div className="max-w-7xl mx-auto w-full mb-6">
          <div className={`border rounded-3xl p-6 shadow-md transition-colors ${theme.card}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className={`text-base font-extrabold tracking-tight ${isDarkMode ? 'text-zinc-50' : 'text-slate-900'}`}>
                  Receptionist Control Desk & Live Booking Queue
                </h2>
                <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'} mt-1`}>
                  Manage room allocations, check-ins, and schedule future stays for Nabslodge <strong className="text-blue-500">{branch}</strong>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    // Pre-fill defaults
                    const today = new Date();
                    const tomorrow = new Date();
                    tomorrow.setDate(today.getDate() + 1);
                    setFutureCheckIn(today.toISOString().slice(0, 10));
                    setFutureCheckOut(tomorrow.toISOString().slice(0, 10));
                    setFutureGuestName('');
                    setFutureGuestPhone('');
                    setFutureGuestEmail('');
                    setFutureRoomId('');
                    setFutureAmountPaid(0);
                    setResPayment('Partial');
                    setFutureIsOccasion(false);
                    setFutureGuestCount('1');
                    setFutureStayError('');
                    setShowFutureStayModal(true);
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" /> Book Future Stay
                </button>
                <button
                  onClick={() => setActiveTab('quickCalendar')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Calendar className="w-4 h-4" /> Availability Calendar
                </button>
                <button
                  onClick={() => {
                    if (activityCatalog.length > 0) {
                      setWalkInServiceType(activityCatalog[0].name);
                      setWalkInTotalCharged(activityCatalog[0].price.toString());
                      setWalkInAmountPaid(activityCatalog[0].price.toString());
                    } else {
                      setWalkInServiceType('Photography Session');
                      setWalkInTotalCharged('200');
                      setWalkInAmountPaid('200');
                    }
                    setWalkInGuestName('');
                    setWalkInGuestPhone('');
                    setWalkInPaymentStatus('Paid');
                    setWalkInError('');
                    setShowWalkInModal(true);
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" /> New Walk-In Activity
                </button>
                <button
                  onClick={() => {
                    if (drinks.length > 0) {
                      setSelectedDrinkId(drinks[0].id);
                    }
                    setDrinkQty(1);
                    setDrinkGuestName('');
                    setDrinkRoomNumber('');
                    setDrinkPaymentMethod('Cash');
                    setShowDrinkOrderModal(true);
                  }}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Wine className="w-4 h-4" /> Record Drink Sale
                </button>
              </div>
            </div>

            {/* Case-Insensitive Search & Quick Filter Status Toggles */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
              <div className="lg:col-span-2 relative">
                <Search className={`w-5 h-5 absolute left-4 top-3.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={searchFutureBookings}
                  onChange={(e) => setSearchFutureBookings(e.target.value)}
                  placeholder="Search Future Bookings (Guest Name, Phone, or Doc ID)..."
                  className={`block w-full pl-12 pr-4 py-3.5 rounded-2xl text-xs font-semibold focus:outline-none transition-colors border ${theme.input}`}
                />
              </div>

              <div className="relative">
                <select
                  value={futureStatusFilter}
                  onChange={(e) => setFutureStatusFilter(e.target.value as any)}
                  className={`block w-full px-4 py-3.5 rounded-2xl text-xs font-semibold focus:outline-none transition-colors border ${theme.input}`}
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active (Pending + Checked-In)</option>
                  <option value="Pending Review">Pending Review</option>
                  <option value="Checked-In">Checked-In</option>
                  <option value="No Show">No Show</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Quick Badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {(['All', 'Active', 'Pending Review', 'Checked-In', 'No Show', 'Completed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFutureStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wide transition-all cursor-pointer border ${
                    futureStatusFilter === st
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                      : (isDarkMode ? 'bg-zinc-850 border-zinc-800 hover:bg-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600')
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* FRONT DESK REAL-TIME QUEUE RESULTS DISPLAY */}
        {(searchFutureBookings.trim() !== '' || futureStatusFilter !== 'All') && (
          <div className="max-w-7xl mx-auto w-full mb-6">
            <div className={`border rounded-3xl p-5 shadow-sm ${theme.card}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Search & Queue Results
                </h3>
                <button
                  onClick={() => {
                    setSearchFutureBookings('');
                    setFutureStatusFilter('All');
                  }}
                  className="text-[10px] text-blue-500 hover:underline font-bold"
                >
                  Clear Filters
                </button>
              </div>

              {(() => {
                const query = searchFutureBookings.toLowerCase().trim();
                const filtered = bookings.filter(b => {
                  // search query
                  if (query) {
                    const matchesSearch = String(b.guestName || '').toLowerCase().includes(query) ||
                      String(b.guestContact || b.guestPhone || '').toLowerCase().includes(query) ||
                      String(b.id || '').toLowerCase().includes(query);
                    if (!matchesSearch) return false;
                  }

                  // status filter mapping
                  if (futureStatusFilter === 'Active') {
                    return b.status === 'Confirmed' || b.status === 'Pending' || b.status === 'CheckedIn';
                  } else if (futureStatusFilter === 'Pending Review') {
                    return b.status === 'Pending' || (b.status === 'Confirmed' && (b.paymentStatus === 'Partial' || b.paymentStatus === 'Unpaid' || b.paymentStatus === 'Partially Paid (50% Deposit)'));
                  } else if (futureStatusFilter === 'Checked-In') {
                    return b.status === 'CheckedIn';
                  } else if (futureStatusFilter === 'No Show') {
                    return b.status === 'No Show' || b.status === 'Cancelled' || (b as any).noShow === true;
                  } else if (futureStatusFilter === 'Completed') {
                    return b.status === 'CheckedOut';
                  }

                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-6">
                      <EmptyState
                        icon={<Calendar className="w-5 h-5 text-zinc-400" />}
                        title="No Matching Reservations"
                        description="There are currently no active reservations matching your selected status filter in this branch queue."
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-mono uppercase text-zinc-400">
                          <th className="py-3 px-2 font-bold">Booking Ref</th>
                          <th className="py-3 px-2 font-bold">Guest Info</th>
                          <th className="py-3 px-2 font-bold">Room</th>
                          <th className="py-3 px-2 font-bold">Dates / Duration</th>
                          <th className="py-3 px-2 font-bold">Payment Status</th>
                          <th className="py-3 px-2 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                        {filtered.map((b, idx) => {
                          const start = new Date(b.checkInDate);
                          const end = new Date(b.checkOutDate);
                          const diffTime = end.getTime() - start.getTime();
                          const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                          
                          return (
                            <tr key={`${b.id}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                              <td className="py-3.5 px-2 font-mono font-bold text-zinc-500">
                                #{b.id.substring(5, 11).toUpperCase()}
                              </td>
                              <td className="py-3.5 px-2">
                                <span className="font-bold block text-zinc-900 dark:text-zinc-100">{b.guestName}</span>
                                <span className="text-[10px] text-zinc-400 block font-mono">{b.guestContact}</span>
                              </td>
                              <td className="py-3.5 px-2 font-semibold">Room {b.roomNumber}</td>
                              <td className="py-3.5 px-2 font-mono text-[10px]">
                                <div>In: {b.checkInDate}</div>
                                <div className="text-zinc-400">Out: {b.checkOutDate} ({nights} {nights === 1 ? 'Night' : 'Nights'})</div>
                              </td>
                              <td className="py-3.5 px-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isBookingPaid(b)
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : b.paymentStatus === 'Partially Paid (50% Deposit)' || b.paymentStatus === 'Partial'
                                      ? 'bg-amber-500/10 text-amber-500'
                                      : 'bg-red-500/10 text-red-500'
                                }`}>
                                  {getEffectivePaymentStatus(b)}
                                </span>
                                <span className="block text-[10px] text-zinc-500 mt-1 font-mono">
                                  Paid: GH₵{(b.amountPaid || b.deposit || b.amountReceived || (b.paymentStatus === 'Paid' ? b.totalPrice : (b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')) ? b.totalPrice * 0.5 : 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })} / GH₵{b.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </td>
                              <td className="py-3.5 px-2 text-right">
                                <div className="flex gap-2 justify-end">
                                  {(b.status === 'Confirmed' || b.status === 'Pending') && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingBookingTarget(b);
                                          setShowEditBookingModal(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-zinc-950 border border-amber-500/30 text-amber-500 font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                                        title="Edit guest info, dates, deposit, or room for this future stay"
                                      >
                                        <Edit2 className="w-3 h-3" /> Edit / Rectify
                                      </button>
                                      <button
                                        onClick={() => {
                                          setArrivalBooking(b);
                                          const depositPaid = getActualPaidAmount(b);
                                          const totalPrice = Number(b.totalPrice ?? 0);
                                          const bal = totalPrice - depositPaid;
                                          setArrivalAmountReceived(bal);
                                          setShowArrivalModal(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                                      >
                                        <UserCheck className="w-3 h-3" /> Process Check-In
                                      </button>
                                      <button
                                        disabled={isProcessingAction}
                                        onClick={() => handleMarkNoShow(b)}
                                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                      >
                                        {isProcessingAction ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          'Mark No Show'
                                        )}
                                      </button>
                                    </>
                                  )}
                                  {b.status === 'CheckedIn' && (
                                    <span className="text-[10px] text-emerald-500 font-bold px-2 py-1 bg-emerald-500/10 rounded-md uppercase">
                                      Active Checked-In
                                    </span>
                                  )}
                                  {(b.status === 'No Show' || b.status === 'Cancelled' || (b as any).noShow) && (
                                    <span className="text-[10px] text-red-500 font-bold px-2 py-1 bg-red-500/10 rounded-md uppercase">
                                      Cancelled (No Show)
                                    </span>
                                  )}
                                  {b.status === 'CheckedOut' && (
                                    <span className="text-[10px] text-zinc-400 font-bold px-2 py-1 bg-zinc-400/10 rounded-md uppercase">
                                      Completed
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch w-full mb-6">
          
          {/* Left Side: Rooms Management Panel */}
          <div className="lg:col-span-3 space-y-6">
          
          {/* Due Soon / Overdue Check-out Alerts */}
          {dueSoonBookings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`border rounded-3xl p-5 space-y-3.5 shadow-xs ${isDarkMode ? 'border-amber-500/40 bg-amber-900/20' : 'border-amber-500/30 bg-amber-50'}`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full animate-pulse shrink-0 ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'}`} />
                  <AlertTriangle className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                  <div>
                    <h3 className={`font-bold text-xs font-mono uppercase tracking-widest ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                      Check-out Action Flags ({dueSoonBookings.length})
                    </h3>
                    <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-700'}`}>
                      The following guest sessions are due or overdue for checkout. Please process clearance.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dueSoonBookings.map((b, idx) => {
                  const checkOutTimeSetting = localStorage.getItem('globalCheckOutTime') || '12:00';
                  const targetStr = b.checkOutDate.includes('T') ? b.checkOutDate : `${b.checkOutDate}T${checkOutTimeSetting}:00`;
                  const checkoutTime = new Date(targetStr).getTime();
                  const now = new Date().getTime();
                  const diffMs = checkoutTime - now;
                  const isOverdue = diffMs < 0;
                  const absDiffMin = Math.round(Math.abs(diffMs) / (1000 * 60));
                  const hours = Math.floor(absDiffMin / 60);
                  const mins = absDiffMin % 60;
                  
                  const timeLeftStr = isOverdue
                    ? `🚨 OVERDUE CHECK-OUT (${hours > 0 ? `${hours}h ` : ''}${mins}m overdue)`
                    : `⚠️ Approaching Check-Out (Under 2 Hours - ${hours > 0 ? `${hours}h ` : ''}${mins}m remaining)`;

                  return (
                    <div 
                      key={`${b.id}-${idx}`}
                      className={`border p-3.5 rounded-2xl flex justify-between items-center gap-3 transition-all ${
                        isDarkMode
                          ? isOverdue ? 'bg-red-950/40 border-red-500/40' : 'bg-rose-950/20 border-rose-500/30 animate-pulse'
                          : isOverdue ? 'bg-red-50 border-red-200' : 'bg-rose-50 border-rose-200 animate-pulse'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                            Room {b.roomNumber}
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-md uppercase ${
                            isOverdue
                              ? 'bg-red-500/15 text-red-500 font-extrabold'
                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold'
                          }`}>
                            {timeLeftStr}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mt-1 truncate">
                          {b.guestName}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const room = rooms.find(r => r.id === b.roomId);
                          if (room) {
                            handleOpenInvoice(room);
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-[10px] transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Clear
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
          {activeTab === 'rooms' && (
            <motion.div
              key="rooms"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="space-y-6 flex-1 w-full"
            >
              {/* Controls: search and room-status filters */}
              <div className={`border rounded-3xl p-5 space-y-4 transition-colors ${
                theme.card
              }`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h2 className={`text-sm font-mono uppercase tracking-widest ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Room Board • Nabslodge {branch}</h2>
                    <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-450'}`}>Control live availability and guest checks.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Grid / Table Toggle */}
                    <div className="flex gap-1 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          viewMode === 'grid'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                        title="Grid View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          viewMode === 'table'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        }`}
                        title="Table View"
                      >
                        <Table className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Status pills inside the container */}
                    <div className={`flex flex-wrap gap-2 text-[10px] font-mono p-1 rounded-xl border ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <button
                        onClick={() => setShowCrossBranch(!showCrossBranch)}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                          showCrossBranch 
                            ? (isDarkMode ? 'bg-purple-900/50 text-purple-200 border-purple-500/60 shadow-xs' : 'bg-purple-100 text-purple-800 border-purple-400 shadow-xs') 
                            : (isDarkMode ? 'text-purple-400 border-purple-500/30 hover:bg-purple-950/30' : 'text-purple-700 border-purple-200 hover:bg-purple-50')
                        }`}
                      >
                        <Globe className="w-3 h-3 text-purple-500" />
                        {branch === 'Annex' ? 'Ayigya' : 'Annex'} Available ({otherBranchRooms.filter(r => getRoomEffectiveStatus(r) === 'Available').length})
                      </button>
                      <div className={`w-px h-6 my-auto ${isDarkMode ? 'bg-zinc-800' : 'bg-slate-200'}`}></div>
                      <button
                        onClick={() => setRoomStatusFilter('All')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          roomStatusFilter === 'All' 
                            ? (isDarkMode ? 'bg-zinc-800 text-white' : 'bg-blue-600 text-white') 
                            : (isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-550 hover:text-slate-900')
                        }`}
                      >
                        All ({totalRoomsCount})
                      </button>
                      <button
                        onClick={() => setRoomStatusFilter('Available')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          roomStatusFilter === 'Available' 
                            ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-600 text-white') 
                            : (isDarkMode ? 'text-zinc-500 hover:text-emerald-400' : 'text-slate-550 hover:text-emerald-600')
                        }`}
                      >
                        Available ({availableCount})
                      </button>
                      <button
                        onClick={() => setRoomStatusFilter('Occupied')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          roomStatusFilter === 'Occupied' 
                            ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-600 text-white') 
                            : (isDarkMode ? 'text-zinc-500 hover:text-blue-400' : 'text-slate-550 hover:text-blue-600')
                        }`}
                      >
                        Occupied ({occupiedCount})
                      </button>
                      <button
                        onClick={() => setRoomStatusFilter('Cleaning')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          roomStatusFilter === 'Cleaning' 
                            ? (isDarkMode ? 'bg-amber-500/15 text-amber-500' : 'bg-amber-500 text-white') 
                            : (isDarkMode ? 'text-zinc-500 hover:text-amber-500' : 'text-slate-550 hover:text-amber-600')
                        }`}
                      >
                        Cleaning ({cleaningCount})
                      </button>
                      <button
                        onClick={() => setRoomStatusFilter('Maintenance')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          roomStatusFilter === 'Maintenance' 
                            ? (isDarkMode ? 'bg-blue-900/35 text-blue-300' : 'bg-blue-600 text-white') 
                            : (isDarkMode ? 'text-zinc-500 hover:text-blue-400' : 'text-slate-550 hover:text-blue-600')
                        }`}
                      >
                        Maintenance ({maintenanceCount})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cross-Branch Live Switcher Banner */}
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                  showCrossBranch 
                    ? (isDarkMode ? 'bg-purple-950/40 border-purple-500/50 text-purple-200 ring-1 ring-purple-500/30' : 'bg-purple-50 border-purple-300 text-purple-900 ring-1 ring-purple-200')
                    : (isDarkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-slate-50 border-slate-200')
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${
                      showCrossBranch 
                        ? 'bg-purple-600 text-white shadow-sm' 
                        : (isDarkMode ? 'bg-zinc-800 text-purple-400' : 'bg-purple-100 text-purple-700')
                    }`}>
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-row items-center gap-2">
                        <span className="text-xs font-bold font-mono uppercase tracking-wider">
                          {showCrossBranch 
                            ? `📍 Live View: Available Rooms at ${branch === 'Annex' ? 'Ayigya' : 'Annex'} Branch`
                            : `Cross-Branch Availability (${branch === 'Annex' ? 'Ayigya' : 'Annex'} Lodge)`
                          }
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          otherBranchRooms.filter(r => getRoomEffectiveStatus(r) === 'Available').length > 0 
                            ? 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30' 
                            : 'bg-zinc-500/20 text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {otherBranchRooms.filter(r => getRoomEffectiveStatus(r) === 'Available').length} Available
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {showCrossBranch
                          ? `Currently displaying live available rooms at ${branch === 'Annex' ? 'Ayigya' : 'Annex'}. Switch back to view ${branch} rooms.`
                          : `Click the button to inspect live available rooms at ${branch === 'Annex' ? 'Ayigya' : 'Annex'} in real-time.`
                        }
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCrossBranch(!showCrossBranch)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center gap-2 shrink-0 ${
                      showCrossBranch
                        ? 'bg-purple-600 hover:bg-purple-700 text-white ring-2 ring-purple-400/50'
                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    {showCrossBranch ? `Switch Back to ${branch} Rooms` : `View ${branch === 'Annex' ? 'Ayigya' : 'Annex'} Available Rooms`}
                  </button>
                </div>

                {/* Live searching for rooms */}
                <div className="relative">
                  <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search rooms by number, type, or price..."
                    className={`block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  />
                </div>
              </div>

              {/* Rooms Render View */}
              {viewMode === 'table' ? (
                <div className={`border rounded-2xl overflow-hidden ${theme.tableContainer}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className={`border-b font-mono uppercase tracking-wider text-[10px] ${
                          theme.tableHeader
                        }`}>
                          <th className="p-4 font-bold">Room</th>
                          <th className="p-4 font-bold">Type</th>
                          <th className="p-4 font-bold">Price / Night</th>
                          <th className="p-4 font-bold">Max Guests</th>
                          <th className="p-4 font-bold">Status</th>
                          <th className="p-4 font-bold">Amenities</th>
                          <th className="p-4 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-850">
                        {isLoadingData ? (
                          Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={idx} className="animate-pulse">
                              <td className="p-4"><div className="h-5 w-12 bg-zinc-250 dark:bg-zinc-800 rounded font-mono"></div></td>
                              <td className="p-4">
                                <div className="h-4 w-28 bg-zinc-250 dark:bg-zinc-800 rounded mb-1"></div>
                                <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-850 rounded"></div>
                              </td>
                              <td className="p-4"><div className="h-4 w-16 bg-zinc-250 dark:bg-zinc-800 rounded"></div></td>
                              <td className="p-4"><div className="h-4 w-10 bg-zinc-200 dark:bg-zinc-850 rounded"></div></td>
                              <td className="p-4"><div className="h-5 w-16 bg-zinc-250 dark:bg-zinc-800 rounded-full"></div></td>
                              <td className="p-4"><div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-850 rounded"></div></td>
                              <td className="p-4 text-right"><div className="h-8 w-24 bg-zinc-250 dark:bg-zinc-800 rounded-lg ml-auto"></div></td>
                            </tr>
                          ))
                        ) : (showCrossBranch ? otherBranchRooms.filter(r => getRoomEffectiveStatus(r) === 'Available') : rooms.filter(r => roomStatusFilter === 'All' || getRoomEffectiveStatus(r) === roomStatusFilter))
                          .filter(r => {
                            const query = searchQuery.toLowerCase().trim();
                            return (
                              String(r.roomNumber || '').toLowerCase().includes(query) ||
                              String(r.roomType || '').toLowerCase().includes(query) ||
                              String(r.price || '').toLowerCase().includes(query)
                            );
                          })
                          .map((room) => {
                            const activeBooking = bookings.find(b => 
                              (b.roomId === room.id || (b.roomNumber && String(b.roomNumber) === String(room.roomNumber))) && 
                              b.status === 'CheckedIn' && 
                              (b.branch === room.branch || !b.branch || b.branch === branch)
                            ) || null;
                            const effectiveStatus = getRoomEffectiveStatus(room);
                            const isOccupied = effectiveStatus === 'Occupied';
                            const isMaintenance = effectiveStatus === 'Maintenance';
                            const isCleaning = effectiveStatus === 'Cleaning';
                            
                            let radarClasses = "";
                            let radarBadge = null;
                            if (isOccupied && activeBooking) {
                              const targetStr = activeBooking.checkOutDate.includes('T') ? activeBooking.checkOutDate : `${activeBooking.checkOutDate}T${globalCheckOutTime}:00`;
                              const checkoutTime = new Date(targetStr).getTime();
                              const now = new Date().getTime();
                              const diffMs = checkoutTime - now;
                              const isOverdue = diffMs < 0;
                              const hours = diffMs / (1000 * 60 * 60);

                              if (hours <= 2 || isOverdue) {
                                radarClasses = isOverdue 
                                  ? "bg-red-500/10 border-l-4 border-l-red-500" 
                                  : "bg-amber-500/10 border-l-4 border-l-amber-500";
                                radarBadge = (
                                  <span className={`flex items-center gap-1 text-[10px] font-bold mt-1 ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    <Clock className="w-3 h-3" />
                                    {isOverdue ? 'Overdue' : 'Check-out approaching'}
                                  </span>
                                );
                              }
                            }

                            return (
                              <tr key={room.id} className={`transition-colors ${radarClasses ? radarClasses : theme.tableRowHover}`}>
                                <td className="p-4 font-bold font-mono text-sm">{room.roomNumber}</td>
                                <td className="p-4">
                                  <span className="font-semibold block">{room.roomType}</span>
                                  {isOccupied && activeBooking && (
                                    <>
                                      <span className="text-[10px] text-blue-500 dark:text-blue-400 block font-medium mt-0.5">
                                        Guest: {activeBooking.guestName}
                                      </span>
                                      {radarBadge}
                                    </>
                                  )}
                                </td>
                                <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  GH₵{room.price.toFixed(2)}
                                </td>
                                <td className="p-4 font-mono">{room.maxGuests || 2} guests</td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase border ${getRoomStatusClasses(effectiveStatus, isDarkMode)}`}>
                                    {effectiveStatus}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {room.amenities.slice(0, 3).map((a, idx) => (
                                      <span key={idx} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'bg-zinc-950 text-emerald-500 border-emerald-900/30' : 'bg-white text-emerald-600 border-emerald-200'}`}>
                                        {a}
                                      </span>
                                    ))}
                                    {room.amenities.length > 3 && (
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'bg-zinc-950 text-emerald-500 border-emerald-900/30' : 'bg-white text-emerald-600 border-emerald-200'}`}>+{room.amenities.length - 3} more</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex gap-1.5 justify-end">
                                    {showCrossBranch || (room.branch && room.branch !== branch) ? (
                                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1 justify-end">
                                        <Globe className="w-3 h-3 text-purple-500" /> View Only
                                      </span>
                                    ) : (
                                      <>
                                        {effectiveStatus === 'Available' && (
                                          <button
                                            onClick={() => handleOpenBooking(room)}
                                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                                          >
                                            Book
                                          </button>
                                        )}
                                        {effectiveStatus === 'Occupied' && (
                                          <div className="flex gap-1.5 justify-end">
                                            <button
                                              onClick={() => {
                                                if (activeBooking) {
                                                  setEditingBookingTarget(activeBooking);
                                                  setShowEditBookingModal(true);
                                                }
                                              }}
                                              className="px-2 py-1 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white font-bold rounded-lg text-[10px] cursor-pointer flex items-center gap-1"
                                              title="Edit guest details or request stay/price modification"
                                            >
                                              <Edit2 className="w-3 h-3" /> Edit / Rectify
                                            </button>
                                            <button
                                              onClick={() => handleOpenInvoice(room)}
                                              className="px-2.5 py-1 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-bold text-blue-500 dark:text-blue-400 cursor-pointer"
                                            >
                                              Check Out
                                            </button>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isLoadingData ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className={`border rounded-2xl p-5 space-y-4 animate-pulse ${isDarkMode ? 'bg-zinc-900 border-zinc-850' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="h-3 w-24 bg-zinc-250 dark:bg-zinc-800 rounded"></div>
                            <div className="h-6 w-16 bg-zinc-300 dark:bg-zinc-700 rounded-md"></div>
                          </div>
                          <div className="h-5 w-20 bg-zinc-250 dark:bg-zinc-800 rounded-full"></div>
                        </div>
                        <div className="space-y-2.5 pt-2">
                          <div className="h-4 w-32 bg-zinc-250 dark:bg-zinc-800 rounded"></div>
                          <div className="h-3 w-48 bg-zinc-200 dark:bg-zinc-850 rounded"></div>
                        </div>
                        <div className="h-9 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full mt-4"></div>
                      </div>
                    ))
                  ) : (
                    (showCrossBranch ? otherBranchRooms.filter(r => getRoomEffectiveStatus(r) === 'Available') : rooms.filter(r => roomStatusFilter === 'All' || getRoomEffectiveStatus(r) === roomStatusFilter))
                    .filter(r => {
                      const query = searchQuery.toLowerCase().trim();
                      return (
                        String(r.roomNumber || '').toLowerCase().includes(query) ||
                        String(r.roomType || '').toLowerCase().includes(query) ||
                        String(r.price || '').toLowerCase().includes(query)
                      );
                    })
                    .map((room) => {
                      const activeBooking = bookings.find(b => 
                        (b.roomId === room.id || (b.roomNumber && String(b.roomNumber) === String(room.roomNumber))) && 
                        b.status === 'CheckedIn' && 
                        (b.branch === room.branch || !b.branch || b.branch === branch)
                      ) || null;
                      const effectiveStatus = getRoomEffectiveStatus(room);
                      const isOccupied = effectiveStatus === 'Occupied';
                      const isMaintenance = effectiveStatus === 'Maintenance';
                      const isCleaning = effectiveStatus === 'Cleaning';

                      let radarBorder = isOccupied ? 'border-blue-500/20' : isMaintenance ? 'border-red-500/20' : isCleaning ? 'border-amber-500/20' : '';
                      if (isOccupied && activeBooking) {
                        const targetStr = activeBooking.checkOutDate.includes('T') ? activeBooking.checkOutDate : `${activeBooking.checkOutDate}T${globalCheckOutTime}:00`;
                        const checkoutTime = new Date(targetStr).getTime();
                        const now = new Date().getTime();
                        const diffMs = checkoutTime - now;
                        const isOverdue = diffMs < 0;
                        const hours = diffMs / (1000 * 60 * 60);

                        if (hours <= 2 || isOverdue) {
                          radarBorder = isOverdue ? 'border-red-500/50 bg-red-500/5' : 'border-amber-500/50 bg-amber-500/5';
                        }
                      }

                      return (
                        <div 
                          key={room.id}
                          className={`border rounded-2xl p-5 space-y-4 relative overflow-hidden transition-all duration-300 ${
                            theme.card} hover:border-blue-500/50 ${radarBorder}`}
                        >
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-[10px] font-mono uppercase tracking-wider block font-bold ${showCrossBranch ? 'text-purple-500 dark:text-purple-400' : (isDarkMode ? 'text-zinc-500' : 'text-slate-400')}`}>
                                Nabslodge {showCrossBranch ? (branch === 'Annex' ? 'Ayigya' : 'Annex') : branch} Room
                              </span>
                              <span className={`text-2xl font-black font-mono ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{room.roomNumber}</span>
                            </div>

                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border uppercase tracking-wider ${getRoomStatusClasses(effectiveStatus, isDarkMode)}`}>
                              {effectiveStatus}
                            </span>
                          </div>

                          {/* Notifications */}
                          {isCleaning && (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                              Room is currently being cleaned / readied
                            </div>
                          )}

                          {isMaintenance && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Pending Maintenance: {room.description || 'Needs inspection'}
                            </div>
                          )}

                          {isOccupied && activeBooking && (() => {
                            const targetStr = activeBooking.checkOutDate.includes('T') ? activeBooking.checkOutDate : `${activeBooking.checkOutDate}T${globalCheckOutTime}:00`;
                            const checkoutTime = new Date(targetStr).getTime();
                            const now = new Date().getTime();
                            const diffMs = checkoutTime - now;
                            const isOverdue = diffMs < 0;
                            const hours = diffMs / (1000 * 60 * 60);

                            if (hours <= 2 || isOverdue) {
                              return (
                                <div className={`bg-amber-500/10 border border-amber-500/20 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2 ${isOverdue ? 'text-red-600 dark:text-red-400 border-red-500/20 bg-red-500/10' : 'text-amber-600 dark:text-amber-400'}`}>
                                  <Clock className="w-4 h-4" />
                                  {isOverdue ? 'Overdue for check-out' : 'Check-out approaching'}
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Room Type and Price */}
                          <div>
                            <h4 className={`font-bold text-sm leading-none ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>{room.roomType}</h4>
                            <p className={`text-xs font-mono font-extrabold mt-1.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                              GH₵{room.price.toFixed(2)} / night • Max {room.maxGuests || 2} Guest{(room.maxGuests || 2) > 1 ? 's' : ''}
                            </p>
                          </div>

                          {/* Active Guest Info if Occupied */}
                          {isOccupied && activeBooking && (
                            <div className={`border p-3.5 rounded-xl space-y-1.5 text-xs transition-colors ${
                              isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-100'
                            }`}>
                              <div className={`flex justify-between text-[11px] border-b pb-1.5 ${
                                isDarkMode ? 'text-zinc-500 border-zinc-900' : 'text-slate-400 border-slate-200'
                              }`}>
                                <span>Active Guest Info</span>
                                <span className={`flex items-center gap-1 font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                  <Clock className="w-3 h-3" /> Checked In
                                </span>
                              </div>
                              <div className={`font-bold pt-0.5 ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{activeBooking.guestName}</div>
                              <div className={`text-[11px] flex items-center gap-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-550'}`}>
                                <Phone className={`w-3.5 h-3.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-450'}`} /> {activeBooking.guestContact}
                              </div>
                              <div className={`text-[11px] flex items-center gap-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-550'}`}>
                                <Calendar className={`w-3.5 h-3.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-450'}`} /> {activeBooking.checkInDate} to {activeBooking.checkOutDate}
                              </div>
                              {(() => {
                                const unpaidDrinks = getBookingUnpaidDrinksTotal(activeBooking.id, activeBooking.roomNumber || room.roomNumber);
                                const actualPaid = getActualPaidAmount(activeBooking);
                                const overpaidAmount = Math.max(0, actualPaid - activeBooking.totalPrice);
                                const roomBalance = Math.max(0, activeBooking.totalPrice - actualPaid);
                                const totalBalanceDue = roomBalance + unpaidDrinks;
                                return (
                                  <div className="space-y-1.5 pt-1.5 border-t border-dashed border-zinc-750">
                                    <div className="flex justify-between items-center text-[11px]">
                                      <span className={isDarkMode ? 'text-zinc-500' : 'text-slate-400'}>Room Invoice:</span>
                                      <span className="font-mono font-bold">GH₵{activeBooking.totalPrice.toFixed(2)}</span>
                                    </div>
                                    {unpaidDrinks > 0 && (
                                      <div className="flex justify-between items-center text-[11px] text-amber-500 font-semibold">
                                        <span>Unpaid Drinks (Room Bill):</span>
                                        <span className="font-mono">GH₵{unpaidDrinks.toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between items-center text-[11px] font-bold pt-1 border-t border-zinc-800">
                                      <span className={isDarkMode ? 'text-zinc-300' : 'text-slate-700'}>Total Balance Due:</span>
                                      <span className="font-mono text-purple-400">GH₵{totalBalanceDue.toFixed(2)}</span>
                                    </div>
                                    {overpaidAmount > 0 && (
                                      <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400 font-medium space-y-1">
                                        <div className="flex items-center gap-1 font-bold">
                                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                          Overpaid / Guest Credit: GH₵{overpaidAmount.toFixed(2)}
                                        </div>
                                        <p className="leading-tight opacity-90">
                                          Guest paid GH₵{actualPaid.toFixed(2)} for this GH₵{activeBooking.totalPrice.toFixed(2)} invoice.
                                        </p>
                                        <p className="leading-tight opacity-75">
                                          To balance: physically refund GH₵{overpaidAmount.toFixed(2)}, then use <strong>Edit / Rectify</strong> to change Amount Paid to GH₵{activeBooking.totalPrice.toFixed(2)}.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Amenities list */}
                          {!isOccupied && room.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1.5">
                              {room.amenities.map((a, idx) => (
                                <span key={idx} className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                                  isDarkMode ? 'bg-zinc-950 text-emerald-500 border-emerald-900/30' : 'bg-white text-emerald-600 border-emerald-200'
                                }`}>
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Quick Shift actions */}
                          <div className={`pt-2 border-t flex flex-col gap-2 ${isDarkMode ? 'border-zinc-850/60' : 'border-slate-100'}`}>
                            {showCrossBranch || (room.branch && room.branch !== branch) ? (
                              <div className={`p-2.5 rounded-xl border text-center text-xs font-bold flex items-center justify-center gap-2 ${
                                isDarkMode ? 'bg-purple-950/40 border-purple-500/30 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-800'
                              }`}>
                                <Globe className="w-3.5 h-3.5 text-purple-500" />
                                <span>View Only — {room.branch || (branch === 'Annex' ? 'Ayigya' : 'Annex')} Branch Room</span>
                              </div>
                            ) : (
                              <>
                                {effectiveStatus === 'Available' && (
                                  <div className="space-y-2">
                                    <button
                                      onClick={() => handleOpenBooking(room)}
                                      className={`w-full py-2 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                                        isDarkMode 
                                          ? 'bg-blue-600 hover:bg-blue-550 text-white shadow-blue-500/5' 
                                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/10'
                                      }`}
                                    >
                                      <UserCheck className="w-3.5 h-3.5" /> Book / Check-In
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        onClick={() => handleUpdateRoomStatus(room, 'Cleaning')}
                                        className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                          isDarkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                        }`}
                                      >
                                        <RefreshCw className="w-3 h-3" /> Cleaning
                                      </button>
                                      <button
                                        onClick={() => handleUpdateRoomStatus(room, 'Maintenance')}
                                        className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                          isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'
                                        }`}
                                      >
                                        <AlertTriangle className="w-3 h-3" /> Maintenance
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {effectiveStatus === 'Occupied' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => {
                                        if (activeBooking) {
                                          setEditingBookingTarget(activeBooking);
                                          setShowEditBookingModal(true);
                                        }
                                      }}
                                      className={`py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isDarkMode 
                                          ? 'bg-zinc-950 hover:bg-amber-500 hover:text-zinc-950 border-zinc-800 hover:border-amber-500 text-amber-400' 
                                          : 'bg-white hover:bg-amber-600 hover:text-white border-slate-200 hover:border-amber-600 text-amber-700 shadow-xs'
                                      }`}
                                      title="Edit guest details or request stay/price modification"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" /> Edit / Rectify
                                    </button>
                                    <button
                                      onClick={() => handleOpenInvoice(room)}
                                      className={`py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isDarkMode 
                                          ? 'bg-zinc-950 hover:bg-blue-500 hover:text-zinc-950 border-zinc-800 hover:border-blue-500 text-zinc-300' 
                                          : 'bg-white hover:bg-blue-600 hover:text-white border-slate-200 hover:border-blue-600 text-slate-700 shadow-xs'
                                      }`}
                                    >
                                      <UserMinus className="w-3.5 h-3.5" /> Check Out
                                    </button>
                                  </div>
                                )}

                                {effectiveStatus === 'Cleaning' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => handleUpdateRoomStatus(room, 'Available')}
                                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isDarkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                      }`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> Mark Available
                                    </button>
                                    <button
                                      onClick={() => handleUpdateRoomStatus(room, 'Maintenance')}
                                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'
                                      }`}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" /> Maintenance
                                    </button>
                                  </div>
                                )}

                                {effectiveStatus === 'Maintenance' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => handleUpdateRoomStatus(room, 'Available')}
                                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isDarkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                      }`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> Mark Available
                                    </button>
                                    <button
                                      onClick={() => handleUpdateRoomStatus(room, 'Cleaning')}
                                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        isDarkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                      }`}
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" /> Cleaning
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                        </div>
                      );
                    }))}

                  {rooms.length === 0 && (
                    <div className={`col-span-1 md:col-span-2 py-12 text-center rounded-3xl border transition-colors ${
                      isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-white border-slate-200 text-slate-400 shadow-xs'
                    }`}>
                      <Bed className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-zinc-700' : 'text-slate-300'}`} />
                      <p className="text-xs font-semibold">No rooms listed in Nabslodge {branch}. Contact General Manager.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'quickCalendar' && (
            <motion.div
              key="quickCalendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="space-y-6 flex-1 w-full max-w-7xl mx-auto"
            >
              <QuickAvailabilityCalendar
                rooms={rooms}
                bookings={bookings}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {activeTab === 'reservations' && (
            <motion.div
              key="reservations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={`border rounded-3xl p-6 space-y-6 transition-colors ${
                theme.card
              }`}
            >
              <div>
                <h2 className={`text-sm font-mono uppercase tracking-widest ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  New Reservation Desk
                </h2>
                <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-450'}`}>
                  Select an available room at Nabslodge {branch} and register the guest.
                </p>
              </div>

              {/* Ensure scrollable form box and confirm button visibility */}
              <form onSubmit={handleInlineReservationSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {/* ... */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                      Select Available Room *
                    </label>
                    <select
                      required
                      value={resRoomId}
                      onChange={(e) => setResRoomId(e.target.value)}
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    >
                      <option value="">-- Choose a room --</option>
                      {rooms
                        .filter(r => r.status === 'Available')
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            Room {r.roomNumber} - {r.roomType} (GH₵{r.price}/night)
                          </option>
                        ))
                      }
                    </select>
                    {rooms.filter(r => getRoomEffectiveStatus(r) === 'Available').length === 0 && (
                      <p className="text-[10px] text-red-500 mt-1 font-semibold">⚠ No rooms are currently available for booking at this branch.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                      Payment Status *
                    </label>
                    <select
                      value={resPayment}
                      onChange={(e) => setResPayment(e.target.value as any)}
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    >
                      <option value="Paid">Paid In Full</option>
                      <option value="Partial">Partial Deposit Paid</option>
                      <option value="Split">Split Payment (Cash + Momo)</option>
                      <option value="Unpaid">Unpaid / Cash on Checkout</option>
                    </select>

                    {(resPayment as string) === 'Partial' && (
                      <div className="mt-3 p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/50 space-y-1.5">
                        <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                          Deposit / Initial Payment Received (GH₵) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={initialPartialAmount || ''}
                          onChange={(e) => setInitialPartialAmount(Number(e.target.value))}
                          placeholder="Enter partial amount received"
                          className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                        />
                      </div>
                    )}

                    {(resPayment as string) === 'Split' && (
                      <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                              Cash Amount (GH₵)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={splitCashAmount || ''}
                              onChange={(e) => setSplitCashAmount(Number(e.target.value))}
                              placeholder="0.00"
                              className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                              Mobile Money (GH₵)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={splitMomoAmount || ''}
                              onChange={(e) => setSplitMomoAmount(Number(e.target.value))}
                              placeholder="0.00"
                              className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                            />
                          </div>
                        </div>
                        <div className="text-right text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          Total Split Paid: GH₵{(splitCashAmount + splitMomoAmount).toFixed(2)}
                        </div>
                      </div>
                    )}

                    {resPayment !== 'Unpaid' && (resPayment as string) !== 'Split' && (
                      <div className="mt-3">
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 font-bold">
                          Payment Method *
                        </label>
                        <select
                          value={resPaymentMethod}
                          onChange={(e) => setResPaymentMethod(e.target.value as any)}
                          className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                        >
                          <option value="Cash">Cash (Physical Cash)</option>
                          <option value="Mobile Money">Mobile Money (Momo)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                      Guest Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={resGuestName}
                      onChange={(e) => setResGuestName(e.target.value)}
                      placeholder="e.g. Sualah Tellem"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                      Guest Contact Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={resGuestContact}
                      onChange={(e) => setResGuestContact(e.target.value)}
                      placeholder="e.g. 0245551122"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>
                </div>

                <div className="relative">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                        Check-In Date & Time *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                          showCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                        } ${theme.input}`}
                      >
                        <span className={resCheckIn ? "" : "text-zinc-400 dark:text-zinc-550"}>
                          {resCheckIn ? formatReadableDateTime(resCheckIn) : "Select check-in date"}
                        </span>
                        <Calendar className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                        Check-Out Date & Time *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                          showCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                        } ${theme.input}`}
                      >
                        <span className={resCheckOut ? "" : "text-zinc-400 dark:text-zinc-550"}>
                          {resCheckOut ? formatReadableDateTime(resCheckOut) : "Select check-out date"}
                        </span>
                        <Calendar className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {showCalendarPopover && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
                      {/* Dark Backdrop dimming layer */}
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCalendarPopover(false)} />
                      
                      {/* Active Calendar Content Box */}
                      <div className="relative z-50 w-[95%] max-w-sm rounded-2xl p-4 shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {!resRoomId ? (
                              <span className="text-amber-500 font-bold">⚠ Select a room above to show live availability</span>
                            ) : (
                              <span className="text-emerald-500 font-bold">✓ Showing live room availability</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowCalendarPopover(false)}
                            className="px-2 py-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-blue-500 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>

                        <RoomBookingCalendar
                          roomId={resRoomId}
                          bookings={bookings}
                          checkInDate={resCheckIn}
                          checkOutDate={resCheckOut}
                          onDatesChange={(inDate, outDate) => {
                            let finalIn = inDate;
                            let finalOut = outDate;
                            
                            if (inDate) {
                              finalIn = `${inDate.split('T')[0]}T${globalCheckInTime}`;
                            }
                            if (outDate) {
                              finalOut = `${outDate.split('T')[0]}T${globalCheckOutTime}`;
                            }

                            setResCheckIn(finalIn);
                            setResCheckOut(finalOut);
                          }}
                          isDarkMode={isDarkMode}
                        />

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-bold flex items-center gap-1">
                              Check-In Time <span className="text-zinc-400 dark:text-zinc-550">(Locked)</span>
                            </label>
                            <input
                              type="time"
                              disabled={true}
                              value={globalCheckInTime}
                              className={`block w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none transition-colors border opacity-60 cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-zinc-950 border-zinc-850 text-zinc-400' 
                                  : 'bg-slate-100 border-slate-200 text-slate-500 shadow-xs'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 font-bold flex items-center gap-1">
                              Check-Out Time <span className="text-zinc-400 dark:text-zinc-550">(Locked)</span>
                            </label>
                            <input
                              type="time"
                              disabled={true}
                              value={globalCheckOutTime}
                              className={`block w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none transition-colors border opacity-60 cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-zinc-950 border-zinc-850 text-zinc-400' 
                                  : 'bg-slate-100 border-slate-200 text-slate-500 shadow-xs'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline Form Discount Controls */}
                {resCheckIn && resCheckOut && (() => {
                  const d1 = new Date(resCheckIn);
                  const d2 = new Date(resCheckOut);
                  const days = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                  return (
                    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-850">
                      {days >= 10 && (
                        <div className="flex items-center justify-between">
                          <label className={`text-xs font-bold ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Apply 5% Long-Stay Discount</label>
                          <input 
                            type="checkbox" 
                            checked={resIsFivePercentDiscount} 
                            onChange={(e) => setResIsFivePercentDiscount(e.target.checked)} 
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <div>
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Manual Discount (GH₵)</label>
                        <input 
                          type="number" 
                          value={resManualDiscountAmount || ''} 
                          onChange={(e) => setResManualDiscountAmount(Number(e.target.value))} 
                          className={`w-full px-3 py-2 rounded-xl text-xs border ${theme.input}`}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  );
                })()}

                {resError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono">
                    ⚠ {resError}
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    Confirm Booking & Check-In
                  </button>
                </div>
              </form>

              {/* Today's Check-Ins & Check-Outs */}
              <div className="mt-8 border-t pt-8 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className={`text-xs font-mono uppercase tracking-widest font-bold ${isDarkMode ? 'text-zinc-300' : 'text-slate-800'}`}>
                      Today's Check-Ins & Check-Outs
                    </h3>
                  </div>
                  <div className="relative w-64">
                    <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={todayBookingSearch}
                      onChange={(e) => setTodayBookingSearch(e.target.value)}
                      placeholder="Search today's bookings..."
                      className={`block w-full pl-9 pr-3 py-2 rounded-lg text-[10px] focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>
                </div>

                <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        <th className="px-6 py-4">Guest Name</th>
                        <th className="px-6 py-4">Room #</th>
                        <th className="px-6 py-4">Action Type</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {(() => {
                        const userProfile = {
                          ...currentUser,
                          assignedBranch: currentUser.branch || 'Annex'
                        };

                        const branchFiltered = bookings.map(b => ({
                          ...b,
                          assignedBranch: b.branch
                        })).filter(b => {
                          if (userProfile.role === 'Receptionist') {
                            return b.assignedBranch === userProfile.assignedBranch;
                          }
                          return true;
                        });

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        
                        const tomorrow = new Date(today);
                        tomorrow.setDate(tomorrow.getDate() + 1);

                        const todaysCheckIns = branchFiltered.filter(b => {
                          const checkInDate = (b.checkInDate as any)?.seconds ? new Date((b.checkInDate as any).seconds * 1000) : new Date(b.checkInDate);
                          return checkInDate >= today && checkInDate < tomorrow && !['checked_out', 'CheckedOut', 'Cancelled', 'No Show'].includes(b.status);
                        });

                        const todaysCheckOuts = branchFiltered.filter(b => {
                          if (b.status === 'CheckedOut' || b.status === 'checked_out') {
                            if (!b.actualCheckOutDate) return false;
                            const actualCheckOut = (b.actualCheckOutDate as any)?.seconds ? new Date((b.actualCheckOutDate as any).seconds * 1000) : new Date(b.actualCheckOutDate);
                            return actualCheckOut >= today && actualCheckOut < tomorrow;
                          } else {
                            const checkOutDate = (b.checkOutDate as any)?.seconds ? new Date((b.checkOutDate as any).seconds * 1000) : new Date(b.checkOutDate);
                            return checkOutDate >= today && checkOutDate < tomorrow;
                          }
                        });

                        const dateFiltered: Array<Booking & { isArrival: boolean }> = [];
                        todaysCheckIns.forEach(b => {
                          dateFiltered.push({ ...b, isArrival: true });
                        });
                        todaysCheckOuts.forEach(b => {
                          if (!dateFiltered.some(item => item.id === b.id)) {
                            dateFiltered.push({ ...b, isArrival: false });
                          }
                        });

                        const todaysBookings = dateFiltered.filter(b => {
                          const query = todayBookingSearch.toLowerCase().trim();
                          if (!query) return true;
                          return (
                            String(b.guestName || '').toLowerCase().includes(query) ||
                            String(b.roomNumber || '').toLowerCase().includes(query)
                          );
                        });

                        if (todaysBookings.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="py-16 text-center px-6">
                                <div className="flex flex-col items-center justify-center">
                                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900/50 text-zinc-600' : 'bg-slate-50 text-slate-300'}`}>
                                    <Clock className="w-8 h-8" />
                                  </div>
                                  <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>No Activity Today</h4>
                                  <p className="text-xs max-w-xs mx-auto text-zinc-500 dark:text-zinc-400">
                                    There are no expected check-ins or check-outs matching your search for today.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return todaysBookings.map((b, idx) => {
                          const isArrival = b.isArrival;
                          return (
                            <tr key={`${b.id}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                              <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-100 dark:border-zinc-800/60">
                                <div className="font-bold">{b.guestName}</div>
                                <div className="text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">{b.guestContact}</div>
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-100 dark:border-zinc-800/60 font-mono">
                                Room {b.roomNumber}
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-100 dark:border-zinc-800/60">
                                {isArrival ? (
                                  <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/30 px-2.5 py-1 rounded-md text-xs font-medium inline-block">
                                    Check-In Today
                                  </span>
                                ) : (
                                  <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/30 px-2.5 py-1 rounded-md text-xs font-medium inline-block">
                                    Check-Out Today
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-100 dark:border-zinc-800/60">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border uppercase tracking-wider inline-block ${
                                  b.status === 'CheckedIn'
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    : b.status === 'CheckedOut'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : b.status === 'Pending'
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                                }`}>
                                  {b.status === 'CheckedIn' ? 'Checked In' : b.status === 'CheckedOut' ? 'Checked Out' : b.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-100 dark:border-zinc-800/60">
                                <div className="flex gap-2">
                                  {b.status === 'CheckedIn' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const r = rooms.find(room => room.id === b.roomId || String(room.roomNumber) === String(b.roomNumber));
                                        if (r) {
                                          handleOpenInvoice(r);
                                        } else {
                                          setSelectedBooking(b);
                                          setCheckoutSuccess(false);
                                          setShowInvoiceModal(true);
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                                    >
                                      Process Clearance
                                    </button>
                                  ) : b.status === 'CheckedOut' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInvoiceBooking(b);
                                        setInvoiceType('CheckOut');
                                        setShowPrintInvoiceModal(true);
                                      }}
                                      className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
                                    >
                                      View Invoice
                                    </button>
                                  ) : (
                                    <span className="text-zinc-400 dark:text-zinc-550 text-xs font-normal">No Action</span>
                                  )}
                                </div>
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

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={`border rounded-3xl p-6 space-y-6 transition-colors ${
                theme.card
              }`}
            >
              <div>
                <h2 className={`text-sm font-mono uppercase tracking-widest ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Guest Booking History
                </h2>
                <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-zinc-550' : 'text-slate-450'}`}>
                  Complete list of reservations, past checkout histories, and active guest logs for Nabslodge {branch}.
                </p>
              </div>

              {/* Search & Filter Bar for booking history */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="relative md:col-span-2 flex gap-2">
                  <div className="relative flex-1">
                    <Search className={`w-4 h-4 absolute left-3.5 top-3.5 ${isDarkMode ? 'text-zinc-600' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search guest, contact, or room..."
                      className={`block w-full pl-10 pr-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>
                  {(historySearch || historyStatusFilter !== 'All' || historyPaymentFilter !== 'All' || historyStartDate || historyEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryStatusFilter('All');
                        setHistoryPaymentFilter('All');
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                      }}
                      className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  >
                    <option value="All">All Check-In Statuses</option>
                    <option value="CheckedIn">Active (Checked In)</option>
                    <option value="Pending">Pending (Future Reservation)</option>
                    <option value="CheckedOut">Completed (Checked Out)</option>
                    <option value="Cancelled">Cancelled / No Show</option>
                  </select>
                </div>

                <div>
                  <select
                    value={historyPaymentFilter}
                    onChange={(e) => setHistoryPaymentFilter(e.target.value as any)}
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  >
                    <option value="All">All Payment Statuses</option>
                    <option value="Paid">Paid</option>
                    <option value="Partial">Partial</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
              </div>

              {/* Date Filters */}
              <DateRangePicker
                startDate={historyStartDate}
                endDate={historyEndDate}
                onChangeStart={setHistoryStartDate}
                onChangeEnd={setHistoryEndDate}
                onClear={() => {
                  setHistoryStartDate('');
                  setHistoryEndDate('');
                }}
                isDarkMode={isDarkMode}
              />

              {/* Booking History Table */}
              <div className={`overflow-x-auto border rounded-2xl ${theme.tableContainer}`}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b font-mono uppercase tracking-wider text-[10px] ${
                      theme.tableHeader
                    }`}>
                      <th className="p-4 font-bold">Booking Ref</th>
                      <th className="p-4 font-bold">Guest Info</th>
                      <th className="p-4 font-bold">Room</th>
                      <th className="p-4 font-bold">Duration</th>
                      <th className="p-4 font-bold">Check-In Status</th>
                      <th className="p-4 font-bold">Billing</th>
                      <th className="p-4 font-bold">Processed By</th>
                      <th className="p-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-850">
                    {(() => {
                      const filteredBookings = bookings
                        .filter(b => historyStatusFilter === 'All' || b.status === historyStatusFilter)
                        .filter(b => historyPaymentFilter === 'All' || b.paymentStatus === historyPaymentFilter)
                        .filter(b => {
                          if (historyStartDate) {
                            const bEnd = b.checkOutDate && typeof b.checkOutDate === 'string' ? b.checkOutDate.substring(0, 10) : '';
                            if (bEnd < historyStartDate) return false;
                          }
                          if (historyEndDate) {
                            const bStart = b.checkInDate && typeof b.checkInDate === 'string' ? b.checkInDate.substring(0, 10) : '';
                            if (bStart > historyEndDate) return false;
                          }
                          return true;
                        })
                        .filter(b => {
                          const query = historySearch.replace(/[^\w\d]/g, '').toLowerCase().trim();
                          if (!query) return true;
                          const cleanName = String(b.guestName || '').replace(/[^\w\d]/g, '').toLowerCase();
                          const cleanContact = String(b.guestContact || b.guestPhone || '').replace(/[^\w\d]/g, '').toLowerCase();
                          const cleanRoom = String(b.roomNumber || '').replace(/[^\w\d]/g, '').toLowerCase();
                          return (
                            cleanName.includes(query) ||
                            cleanContact.includes(query) ||
                            cleanRoom.includes(query)
                          );
                        });

                      if (filteredBookings.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="py-8">
                              <EmptyState
                                icon={<Search className="w-5 h-5 text-zinc-400" />}
                                title="No Booking History"
                                description={`No bookings match your current search or filters for Nabslodge ${branch}.`}
                                isDarkMode={isDarkMode}
                              />
                            </td>
                          </tr>
                        );
                      }

                      return filteredBookings.map((b, idx) => (
                        <tr key={`${b.id}-${idx}`} className={`transition-colors ${theme.tableRowHover}`}>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            #{b.id.substring(5, 11).toUpperCase() || b.id}
                          </td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            <button
                              onClick={() => {
                                setSelectedGuestName(b.guestName);
                                setShowGuestModal(true);
                              }}
                              className="font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs hover:text-blue-500 dark:hover:text-blue-400 text-left transition-colors cursor-pointer"
                            >
                              {b.guestName}
                            </button>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-500 font-normal mt-0.5">{b.guestContact}</div>
                          </td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">Room {b.roomNumber}</td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            <div className="font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                              In: {b.checkInDate}
                            </div>
                            <div className="font-mono text-zinc-500 dark:text-zinc-500 font-normal mt-0.5">
                              Out: {b.checkOutDate}
                            </div>
                          </td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border uppercase tracking-wider ${
                              b.status === 'CheckedIn'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : b.status === 'CheckedOut'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : b.status === 'Pending'
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {b.status === 'CheckedIn' ? 'Checked In' : b.status === 'CheckedOut' ? 'Checked Out' : b.status === 'Pending' ? 'PENDING' : 'Cancelled'}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            <div className="font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">GH₵{b.totalPrice.toFixed(2)}</div>
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold font-mono uppercase mt-1 ${
                              b.paymentStatus === 'Paid'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : b.paymentStatus === 'Partial' || b.paymentStatus?.startsWith('Partially')
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {b.paymentStatus}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-zinc-900 dark:text-zinc-50 tracking-wider font-bold text-xs">
                            {b.receptionistName || 'System'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-1.5 justify-end">
                              {(b.status === 'Pending' || b.status === 'Confirmed') && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingBookingTarget(b);
                                      setShowEditBookingModal(true);
                                    }}
                                    className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500 hover:text-zinc-950 border border-amber-500/30 text-amber-500 font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                                    title="Edit guest info, dates, deposit, or room for this reservation"
                                  >
                                    <Edit2 className="w-3 h-3" /> Edit / Rectify
                                  </button>
                                  <button
                                    onClick={() => {
                                      setArrivalBooking(b);
                                      const depositPaid = getActualPaidAmount(b);
                                      const totalPrice = Number(b.totalPrice ?? 0);
                                      const bal = totalPrice - depositPaid;
                                      setArrivalAmountReceived(bal);
                                      setShowArrivalModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <UserCheck className="w-3 h-3" /> Check In
                                  </button>
                                  <button
                                    disabled={isProcessingAction}
                                    onClick={() => handleMarkNoShow(b)}
                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                  >
                                    No Show
                                  </button>
                                </>
                              )}
                              {b.status === 'CheckedIn' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingBookingTarget(b);
                                      setShowEditBookingModal(true);
                                    }}
                                    className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500 hover:text-zinc-950 border border-amber-500/30 text-amber-500 font-bold rounded-lg text-[10px] transition-all cursor-pointer flex items-center gap-1"
                                    title="Edit guest info, dates, or payment for this stay"
                                  >
                                    <Edit2 className="w-3 h-3" /> Rectify
                                  </button>
                                  <button
                                    onClick={() => {
                                      const room = rooms.find(r => r.id === b.roomId || String(r.roomNumber) === String(b.roomNumber));
                                      if (room) handleOpenInvoice(room);
                                    }}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                                  >
                                    Clearance
                                  </button>
                                </>
                              )}
                              {b.status === 'CheckedOut' && (
                                <button
                                  onClick={() => {
                                    setInvoiceBooking(b);
                                    setInvoiceType('CheckOut');
                                    setShowPrintInvoiceModal(true);
                                  }}
                                  className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                                >
                                  Invoice
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Developer Attribution Banner statically inside Booking History Layout */}
              <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800/60 text-center">
                <span className={`text-[10px] font-mono tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Web app developed by SUALAH TELLEM (0553189032)
                </span>
              </div>
            </motion.div>
          )}

          {activeTab === 'activityLedger' && (
            <motion.div
              key="activityLedger"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="space-y-6 flex-1 w-full"
            >
              <WalkInActivityLedger 
                currentUser={currentUser} 
                isDarkMode={isDarkMode} 
                branch={branch} 
                activityCatalog={activityCatalog} 
                onOpenHandoverModal={handleOpenHandoverModal}
                onOpenNewWalkInModal={() => {
                  if (activityCatalog.length > 0) {
                    setWalkInServiceType(activityCatalog[0].name);
                    setWalkInTotalCharged(activityCatalog[0].price.toString());
                    setWalkInAmountPaid(activityCatalog[0].price.toString());
                  } else {
                    setWalkInServiceType('Photography Session');
                    setWalkInTotalCharged('200');
                    setWalkInAmountPaid('200');
                  }
                  setWalkInGuestName('');
                  setWalkInGuestPhone('');
                  setWalkInPaymentStatus('Paid');
                  setWalkInError('');
                  setShowWalkInModal(true);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'drinks' && (
            <motion.div
              key="drinks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="space-y-6 flex-1 w-full"
            >
              {/* Header and top buttons */}
              <div className={`p-6 rounded-3xl border ${theme.card}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className={`text-xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      <Wine className="w-6 h-6 text-purple-500" />
                      Drinks & Bar Services
                    </h2>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Sell drinks to guests, bill unpaid beverages directly to room accounts, and view the best-selling drinks in real-time.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const availableDrinks = drinks.filter(d => d.inStock !== false);
                      if (availableDrinks.length > 0) {
                        setSelectedDrinkId(availableDrinks[0].id);
                      } else {
                        setSelectedDrinkId('');
                      }
                      setDrinkQty(1);
                      setDrinkGuestName('');
                      setDrinkRoomNumber('');
                      setDrinkPaymentMethod('Cash');
                      setShowDrinkOrderModal(true);
                    }}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-2 self-start md:self-auto"
                  >
                    <Plus className="w-4 h-4" /> Record New Drink Sale
                  </button>
                </div>

                {/* KPI Overview Cards for Active Shift */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-purple-950/20 border-purple-800/40 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-800'}`}>
                    <div className="text-[10px] font-mono uppercase tracking-wider opacity-80 mb-1">Shift Drink Revenue</div>
                    <div className="text-xl font-black">GH₵ {getActiveShiftRevenue().drinkTotal.toFixed(2)}</div>
                    <div className="text-[10px] mt-1 opacity-70">{getActiveShiftRevenue().drinkCount} Sales Recorded</div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    <div className="text-[10px] font-mono uppercase tracking-wider opacity-80 mb-1">Drink Cash Revenue</div>
                    <div className="text-xl font-black">GH₵ {getActiveShiftRevenue().drinkCash.toFixed(2)}</div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-blue-950/20 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                    <div className="text-[10px] font-mono uppercase tracking-wider opacity-80 mb-1">Drink MoMo Revenue</div>
                    <div className="text-xl font-black">GH₵ {getActiveShiftRevenue().drinkMomo.toFixed(2)}</div>
                  </div>
                </div>

                {/* Drink Menu (Best Sellers First) */}
                <div className="mb-8">
                  <h3 className={`text-sm font-bold uppercase tracking-wider font-mono mb-4 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Available Beverage Menu
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {drinks
                      .filter(d => {
                        // Show all drinks that are available in general or branch specific
                        return d.inStock !== false;
                      })
                      .sort((a, b) => {
                        const soldA = receptionistDrinkSalesMap[a.id] || 0;
                        const soldB = receptionistDrinkSalesMap[b.id] || 0;
                        return soldB - soldA; // descending order of sales
                      })
                      .map((drink, index) => {
                        const totalSold = receptionistDrinkSalesMap[drink.id] || 0;
                        return (
                          <div key={drink.id} className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                            isDarkMode 
                              ? 'bg-zinc-900/30 border-zinc-800/60 hover:bg-zinc-900/50' 
                              : 'bg-slate-50/30 border-slate-100 hover:bg-slate-50/50'
                          }`}>
                            <div>
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'} flex items-center gap-1.5`}>
                                  {index === 0 && totalSold > 0 && (
                                    <span className="bg-amber-500/20 text-amber-500 text-[8px] font-extrabold px-1 py-0.5 rounded uppercase tracking-wider">👑 Best Seller</span>
                                  )}
                                  {drink.name}
                                </span>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                  isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-slate-200/60 text-slate-600'
                                }`}>
                                  {drink.category || 'Drink'}
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between mt-1 mb-3">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-[10px] font-mono opacity-70">Price:</span>
                                  <span className="font-mono font-extrabold text-purple-400 text-xs">GH₵ {drink.price.toFixed(2)}</span>
                                </div>
                                {totalSold > 0 && (
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                                    {totalSold} units sold
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDrinkId(drink.id);
                                  setDrinkQty(1);
                                  setDrinkGuestName('');
                                  setDrinkRoomNumber('');
                                  setDrinkPaymentMethod('Cash');
                                  setShowDrinkOrderModal(true);
                                }}
                                className="w-full py-2 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-500 text-white shadow-sm shadow-purple-600/10 cursor-pointer"
                              >
                                Sell Drink
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Sales Transactions List */}
                <div>
                  <h3 className={`text-sm font-bold uppercase tracking-wider font-mono mb-4 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Recorded Sales Ledger
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${isDarkMode ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'}`}>
                          <th className="py-3 px-3">Serial / Time</th>
                          <th className="py-3 px-3">Drink Item</th>
                          <th className="py-3 px-3 text-center">Qty</th>
                          <th className="py-3 px-3">Guest / Room</th>
                          <th className="py-3 px-3">Payment</th>
                          <th className="py-3 px-3 text-right">Total Price</th>
                          <th className="py-3 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-zinc-800/60' : 'divide-slate-100'}`}>
                        {activeShiftDrinkSales.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-zinc-400">
                              No drink sales recorded yet during this shift.
                            </td>
                          </tr>
                        ) : (
                          activeShiftDrinkSales.map((sale) => (
                            <tr key={sale.id} className={`${isDarkMode ? 'hover:bg-zinc-900/40' : 'hover:bg-slate-50/50'}`}>
                              <td className="py-3 px-3">
                                <div className="font-mono font-bold text-[11px] text-purple-400">{sale.serialNumber || sale.id.slice(-6)}</div>
                                <div className={`text-[10px] ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>{sale.timestamp}</div>
                              </td>
                              <td className="py-3 px-3 font-semibold">
                                {sale.items ? (
                                  <div className="space-y-0.5">
                                    {sale.items.map((item) => (
                                      <div key={item.drinkId} className="text-xs">
                                        {item.drinkName} <span className="text-[10px] text-zinc-500">(GH₵{item.unitPrice.toFixed(2)} ea)</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <>
                                    {sale.drinkName}
                                    <div className={`text-[10px] ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>GH₵{sale.unitPrice?.toFixed(2)} each</div>
                                  </>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center font-bold">
                                x{sale.quantity}
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium">{sale.guestName}</div>
                                {sale.roomNumber && (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400">
                                    Room {sale.roomNumber}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    isCashMethod(sale.paymentMethod)
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-blue-500/10 text-blue-400'
                                  }`}>
                                    {sale.paymentMethod}
                                  </span>
                                  {sale.paymentStatus === 'Paid' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                                      Paid {sale.settledPaymentMethod ? `(Settled: ${sale.settledPaymentMethod})` : ''}
                                    </span>
                                  ) : sale.paymentStatus === 'Split' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider">
                                      Partial Unpaid {sale.splitPaidMethod ? `(${sale.splitPaidMethod})` : ''}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[9px] font-bold uppercase tracking-wider">
                                      Unpaid (Pending)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-black text-purple-400">
                                GH₵ {sale.totalPrice.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <div className="flex justify-center items-center gap-1">
                                  <button
                                    onClick={() => handleOpenEditDrinkSale(sale)}
                                    className="p-1.5 rounded-lg hover:bg-purple-500/10 text-purple-400 transition-colors cursor-pointer"
                                    title="Edit Sale"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSaleToDelete(sale);
                                      setShowDeleteSaleConfirm(true);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors cursor-pointer"
                                    title="Delete Sale"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Right Side: Shift logs and shift guidelines */}
        <div className="lg:col-span-1 h-full">
          {/* Active Shift Guidelines */}
          <div className={`p-6 rounded-xl w-full h-full flex flex-col justify-between gap-6 transition-colors ${theme.card}`}>
            <div className="space-y-4">
              <div className="flex flex-row items-center gap-2">
                <Shield className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                <h3 className={`text-xs font-mono uppercase tracking-widest ${theme.text}`}>Shift Protocol</h3>
              </div>
              
              <p className={`text-xs leading-relaxed ${theme.textMutedLight}`}>
                You are logged in as <strong className={theme.text}>{currentUser.name}</strong> at <strong className={theme.text}>Nabslodge {branch}</strong>. Under strict role constraints:
              </p>

              <ul className={`space-y-2 text-[11px] ${theme.textMutedLight}`}>
                <li className="flex gap-2">
                  <span className={`font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>•</span>
                  <span>You can only access Nabslodge {branch} data.</span>
                </li>
                <li className="flex gap-2">
                  <span className={`font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>•</span>
                  <span>Every guest check-in & checkout is tracked under your profile name.</span>
                </li>
                <li className="flex gap-2">
                  <span className={`font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>•</span>
                  <span>Room configuration modifications can only be requested from the GM.</span>
                </li>
              </ul>

              {/* LIVE SHIFT REVENUE STATS FOR HANDOVER */}
              <div className={`pt-4 border-t mt-2 space-y-2 ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
                <span className={`text-[10px] font-mono tracking-widest uppercase block ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Active Shift Totals</span>
                {(() => {
                  const stats = getActiveShiftRevenue();
                  return (
                    <div className="space-y-1.5 text-xs">
                      <div className={`flex justify-between ${theme.textMuted}`}>
                        <span>Cash Amount:</span>
                        <span className={`font-mono font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>GH₵ {stats.cashTotal.toFixed(2)}</span>
                      </div>
                      <div className={`flex justify-between ${theme.textMuted}`}>
                        <span>MoMo Amount:</span>
                        <span className={`font-mono font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>GH₵ {stats.momoTotal.toFixed(2)}</span>
                      </div>
                      <div className={`flex justify-between border-t border-dashed pt-1.5 font-bold ${
                        isDarkMode ? 'border-zinc-800 text-white' : 'border-zinc-200 text-zinc-900'
                      }`}>
                        <span>Expected Total:</span>
                        <span className={`font-mono ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>GH₵ {stats.grandTotal.toFixed(2)}</span>
                      </div>
                      
                      <button
                        onClick={handleOpenHandoverModal}
                        className="w-full mt-3 py-2 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Shield className="w-3.5 h-3.5" /> End Shift & Handover Money
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            <div className={`text-right pt-4 border-t mt-2 ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
              <span className={`text-[9px] font-mono tracking-widest uppercase ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Secure Operator Node</span>
            </div>
          </div>
        </div>

          {/* BRANDING FOOTER */}
          <div className="text-center py-6 border-t border-zinc-200/60 dark:border-zinc-800/60 mt-auto w-full">
            <span className={`text-[10px] font-mono tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
              Web app developed by SUALAH TELLEM (0553189032)
            </span>
          </div>

        </div>
      </main>

      {/* --- GUEST BOOKING MODAL & AIRTIGHT STATE MACHINE ENGINE --- */}
      <AnimatePresence>
        {showBookingModal && selectedRoom && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="p-6 pb-0 shrink-0 relative">
                <button
                  onClick={() => setShowBookingModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="mb-4">
                  <span className="text-[10px] font-mono tracking-wider text-blue-500 uppercase font-bold">
                    Nabslodge Booking Engine V2
                  </span>
                  <h3 className="text-lg font-bold">
                    Room {selectedRoom.roomNumber} Console
                  </h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Type: {selectedRoom.roomType} • Status: {selectedRoom.status}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-thin scroll-smooth">

              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-blue-500/5 border border-blue-500/15 rounded-2xl">
                  <span className="font-bold text-blue-500 block mb-1 font-mono uppercase tracking-wider text-[11px]">Instant Check-In</span>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Check in guest right away with guest details, duration, and initial payment options.
                  </p>
                </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Lead Guest Name (Hold Placeholder) *
                    </label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Sualah Tellem"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Contact Phone Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={guestContact}
                      onChange={(e) => setGuestContact(e.target.value)}
                      placeholder="e.g. 0245556789"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="e.g. guest@example.com"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  <div className="relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                          Check-In Date & Time *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowBookingCalendarPopover(!showBookingCalendarPopover)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                            showBookingCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                          } ${theme.input}`}
                        >
                          <span className={checkInDate ? "" : "text-zinc-400 dark:text-zinc-550"}>
                            {checkInDate ? formatReadableDateTime(checkInDate) : "Select check-in date"}
                          </span>
                          <Calendar className="w-4 h-4 text-zinc-400" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                          Check-Out Date & Time *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowBookingCalendarPopover(!showBookingCalendarPopover)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                            showBookingCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                          } ${theme.input}`}
                        >
                          <span className={checkOutDate ? "" : "text-zinc-400 dark:text-zinc-550"}>
                            {checkOutDate ? formatReadableDateTime(checkOutDate) : "Select check-out date"}
                          </span>
                          <Calendar className="w-4 h-4 text-zinc-400" />
                        </button>
                      </div>
                    </div>

                    {showBookingCalendarPopover && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowBookingCalendarPopover(false)} />
                        
                        <div className="relative z-50 w-[95%] max-w-sm rounded-2xl p-4 shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                              <span className="text-emerald-500 font-bold">✓ Showing live room availability</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowBookingCalendarPopover(false)}
                              className="px-2 py-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-blue-500 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                            >
                              Done
                            </button>
                          </div>

                          <RoomBookingCalendar
                            roomId={selectedRoom?.id || ""}
                            bookings={bookings}
                            checkInDate={checkInDate}
                            checkOutDate={checkOutDate}
                            onDatesChange={(inDate, outDate) => {
                              let finalIn = inDate;
                              let finalOut = outDate;
                              
                              if (inDate) {
                                finalIn = `${inDate.split('T')[0]}T${globalCheckInTime}`;
                              }
                              if (outDate) {
                                finalOut = `${outDate.split('T')[0]}T${globalCheckOutTime}`;
                              }

                              setCheckInDate(finalIn);
                              setCheckOutDate(finalOut);
                            }}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Occasion Booking & Guest Count */}
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'} space-y-4`}>
                    {/* Occasion Booking Mode (Only for Apartments) */}
                    {(selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment') && (
                      <div className="flex items-center justify-between pb-3.5 border-b border-zinc-200 dark:border-zinc-850">
                        <div className="pr-4">
                          <span className={`text-xs font-bold block ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Occasion Booking Mode</span>
                          <span className={`text-[10px] block leading-normal ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'} mt-0.5`}>
                            Weddings, parties, or gatherings (Premium rates apply).
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={bookingIsOccasion}
                          onChange={(e) => {
                            setBookingIsOccasion(e.target.checked);
                            setBookingIsMonthly(false);
                            setBookingGuestCount('1');
                          }}
                          className="w-4.5 h-4.5 rounded-lg text-blue-600 border-zinc-300 dark:border-zinc-700 focus:ring-blue-500 cursor-pointer shrink-0"
                        />
                      </div>
                    )}

                    {/* Monthly Premium Package (For ALL rooms) */}
                    <div className="flex items-center justify-between">
                      <div className="pr-4">
                        <span className={`text-xs font-bold block ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Monthly Premium Package</span>
                        <span className={`text-[10px] block leading-normal ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'} mt-0.5`}>
                          Long-term stay (Special discounted rates).
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={bookingIsMonthly}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBookingIsMonthly(checked);
                          setBookingIsOccasion(false);
                          setBookingGuestCount('1');
                          if (checked && !bookingSelectedMonth) {
                            setBookingSelectedMonth(upcomingMonths[0]);
                          }
                        }}
                        className="w-4.5 h-4.5 rounded-lg text-purple-600 border-zinc-300 dark:border-zinc-700 focus:ring-purple-500 cursor-pointer shrink-0"
                      />
                    </div>

                    {/* Specify Month Dropdown (Shown only if Monthly Premium Package is checked) */}
                    {bookingIsMonthly && (
                      <div className="space-y-1.5 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-850">
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Specify Booking Month *
                        </label>
                        <select
                          value={bookingSelectedMonth}
                          onChange={(e) => setBookingSelectedMonth(e.target.value)}
                          className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                        >
                          {upcomingMonths.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Guest Count */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-850">
                      <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Number of Guests (Max {
                          (selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment')
                            ? (bookingIsOccasion ? (selectedRoom.occasionBookingMaxGuests || 8) : (selectedRoom.normalBookingMaxGuests || 4))
                            : (selectedRoom.maxGuests || 2)
                        })
                      </label>
                      <select
                        value={bookingGuestCount}
                        onChange={(e) => setBookingGuestCount(e.target.value)}
                        className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                      >
                        {Array.from(
                          { length: (selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment')
                            ? (bookingIsOccasion ? (selectedRoom.occasionBookingMaxGuests || 8) : (selectedRoom.normalBookingMaxGuests || 4))
                            : (selectedRoom.maxGuests || 2)
                          },
                          (_, i) => (i + 1).toString()
                        ).map(num => (
                          <option key={num} value={num}>{num} {num === '1' ? 'Guest' : 'Guests'}</option>
                        ))}
                      </select>
                    </div>

                    {/* Discount Controls */}
                    {checkInDate && checkOutDate && (() => {
                      const checkIn = new Date(`${checkInDate.split('T')[0]}T${globalCheckInTime}`);
                      const checkOut = new Date(`${checkOutDate.split('T')[0]}T${globalCheckOutTime}`);
                      const days = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
                      return (
                        <>
                          {days >= 10 && (
                            <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-850">
                              <label className={`text-xs font-bold ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Apply 5% Long-Stay Discount</label>
                              <input 
                                type="checkbox" 
                                checked={isFivePercentDiscount} 
                                onChange={(e) => setIsFivePercentDiscount(e.target.checked)} 
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-850">
                            <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Manual Discount (GH₵)</label>
                            <input 
                              type="number" 
                              value={manualDiscountAmount || ''} 
                              onChange={(e) => setManualDiscountAmount(Number(e.target.value))} 
                              className={`w-full px-3 py-2 rounded-xl text-xs border ${theme.input}`}
                              placeholder="0.00"
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Pricing summary */}
                  {(() => {
                    const checkInDateParsed = checkInDate ? new Date(`${checkInDate.split('T')[0]}T${globalCheckInTime}`) : null;
                    const checkOutDateParsed = checkOutDate ? new Date(`${checkOutDate.split('T')[0]}T${globalCheckOutTime}`) : null;
                    if (checkInDateParsed && checkOutDateParsed && checkOutDateParsed > checkInDateParsed) {
                      const days = Math.ceil((checkOutDateParsed.getTime() - checkInDateParsed.getTime()) / (1000 * 60 * 60 * 24));
                      let baseRate = selectedRoom.price;
                      if (bookingIsMonthly) {
                        baseRate = selectedRoom.monthlyPremiumPrice || selectedRoom.price;
                      } else if (selectedRoom.roomType === '2 Bedroom Apartment' || selectedRoom.roomType === '3 Bedroom Apartment') {
                        baseRate = bookingIsOccasion 
                          ? (selectedRoom.occasionBookingPrice || 1000) 
                          : (selectedRoom.normalBookingPrice || 600);
                      }
                      let totalCost = bookingIsMonthly ? baseRate : (baseRate * days);
                      let fivePercentDiscount = (isFivePercentDiscount && days >= 10) ? (totalCost * 0.05) : 0;
                      totalCost -= fivePercentDiscount;
                      totalCost -= manualDiscountAmount;
                      return (
                        <div className="space-y-4">
                          <div className={`p-4 rounded-2xl border font-mono text-[11px] space-y-2 ${isDarkMode ? 'bg-zinc-950 border-zinc-850 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                            <div className="flex justify-between font-sans text-xs font-bold pb-1.5 border-b border-dashed border-zinc-200 dark:border-zinc-800">
                              <span>Rate Calculation Summary</span>
                              <span className="text-blue-500">GH₵{baseRate.toFixed(2)}{bookingIsMonthly ? '/month' : '/night'}</span>
                            </div>
                            {bookingIsMonthly && bookingSelectedMonth && (
                              <div className="flex justify-between text-purple-600 dark:text-purple-400 font-semibold">
                                <span>Package Month:</span>
                                <span>{bookingSelectedMonth}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>Duration (Nights):</span>
                              <span>x {days}</span>
                            </div>
                            <div className="flex justify-between font-bold text-zinc-950 dark:text-white">
                              <span>Total Stay Invoice:</span>
                              <span>GH₵{totalCost.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'} space-y-3`}>
                            <label className={`block text-xs font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                              Initial Payment Option *
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() => setInitialPaymentMode('full')}
                                className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                                  initialPaymentMode === 'full' 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-850' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Full
                              </button>
                              <button
                                type="button"
                                onClick={() => setInitialPaymentMode('partial')}
                                className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                                  initialPaymentMode === 'partial' 
                                    ? 'bg-amber-600 text-white shadow-sm' 
                                    : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-850' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Partial
                              </button>
                              <button
                                type="button"
                                onClick={() => setInitialPaymentMode('split')}
                                className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                                  initialPaymentMode === 'split' 
                                    ? 'bg-purple-600 text-white shadow-sm' 
                                    : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-850' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Split
                              </button>
                              <button
                                type="button"
                                onClick={() => setInitialPaymentMode('unpaid')}
                                className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                                  initialPaymentMode === 'unpaid' 
                                    ? 'bg-blue-600 text-white shadow-sm' 
                                    : isDarkMode ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-850' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Unpaid
                              </button>
                            </div>

                            {initialPaymentMode === 'partial' && (
                              <div className="pt-2">
                                <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                  Enter Partial Amount (GH₵) *
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={totalCost}
                                  value={initialPartialAmount || ''}
                                  onChange={(e) => setInitialPartialAmount(Number(e.target.value))}
                                  placeholder="e.g. 200"
                                  className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors font-mono ${theme.input}`}
                                />
                              </div>
                            )}

                            {initialPaymentMode === 'split' && (
                              <div className="pt-2 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                      Cash (GH₵)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={splitCashAmount || ''}
                                      onChange={(e) => setSplitCashAmount(Number(e.target.value))}
                                      placeholder="0"
                                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors font-mono ${theme.input}`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                      MoMo (GH₵)
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={splitMomoAmount || ''}
                                      onChange={(e) => setSplitMomoAmount(Number(e.target.value))}
                                      placeholder="0"
                                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors font-mono ${theme.input}`}
                                    />
                                  </div>
                                </div>
                                <div className="text-[10px] font-bold text-zinc-500">
                                  Total Split: GH₵{(splitCashAmount + splitMomoAmount).toFixed(2)} / GH₵{totalCost.toFixed(2)}
                                </div>
                              </div>
                            )}

                            {initialPaymentMode !== 'unpaid' && initialPaymentMode !== 'split' && (
                              <div className="pt-2">
                                <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                  Payment Method *
                                </label>
                                <select
                                  value={bookingPaymentMethod}
                                  onChange={(e) => setBookingPaymentMethod(e.target.value as any)}
                                  className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors font-mono ${theme.input}`}
                                >
                                  <option value="Cash">Cash (Physical Cash)</option>
                                  <option value="Mobile Money">Mobile Money (Momo)</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                </div>
              </div>

              <div className="p-6 shrink-0 border-t border-dashed border-zinc-150 dark:border-zinc-800">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowBookingModal(false)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      isDarkMode ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 text-zinc-400' : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-xs'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCheckingIn}
                    onClick={handleLockStay}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isCheckingIn ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Confirm Check-In'
                    )}
                  </button>
                </div>

                <div className="pt-4 text-center">
                  <span className={`text-[9px] font-mono tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    Web app developed by SUALAH TELLEM (0553189032)
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- INVOICE CHECKOUT MODAL --- */}
      <AnimatePresence>
        {showInvoiceModal && selectedBooking && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="p-6 pb-0 shrink-0 relative">
                <button
                  onClick={() => setShowInvoiceModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">

              {checkoutSuccess ? (
                <div className="flex flex-col items-center justify-center text-center py-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Checkout Complete</h3>
                  <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Room {selectedBooking.roomNumber} is now set to {checkoutNextStatus}.
                  </p>

                  {/* Beautiful Receipt Layout to render into PDF */}
                  <div 
                    id="checkout-receipt-card" 
                    className={`w-full border rounded-2xl p-5 mb-5 text-left font-sans space-y-4 border-dashed ${
                      isDarkMode ? 'bg-black border-zinc-850 text-zinc-100' : 'bg-white border-slate-300 text-slate-850'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b pb-3 border-dashed border-zinc-800/20 dark:border-zinc-800">
                      <div className="flex flex-row items-center gap-2">
                        <NabsLodgeLogo size="sm" />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider">NABSLODGE</h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Official Guest Invoice & Checkout Folio</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 font-mono block">Room {selectedBooking.roomNumber}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">GUEST NAME</span>
                        <span className="font-bold">{selectedBooking.guestName}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">ROOM NUMBER</span>
                        <span className="font-bold">{selectedBooking.roomNumber} ({selectedBooking.branch} Branch)</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">CHECK-IN</span>
                        <span className="font-bold">{selectedBooking.checkInDate}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[9px] uppercase">CHECK-OUT</span>
                        <span className="font-bold">{selectedBooking.checkOutDate}</span>
                      </div>
                    </div>

                    <div className="border-t border-b border-dashed py-3 border-zinc-800/20 dark:border-zinc-800 space-y-1.5 font-mono text-[11px]">
                      {Boolean(selectedBooking.discountType && selectedBooking.discountType !== 'None' && (selectedBooking.discountAmount || 0) > 0) ? (
                        <>
                          <div className="flex justify-between text-zinc-500">
                            <span>Original Lodge Stay Charge</span>
                            <span className="line-through">GH₵{(selectedBooking.totalPrice + (selectedBooking.discountAmount || 0) - Number((selectedBooking as any).lateCheckOutFeeApplied || 0)).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-blue-500 font-bold">
                            <span>✨ Discount ({selectedBooking.discountType})</span>
                            <span>- GH₵{(selectedBooking.discountAmount || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>Discounted Lodge Stay Charge</span>
                            <span>GH₵{(selectedBooking.totalPrice - Number((selectedBooking as any).lateCheckOutFeeApplied || 0)).toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span>Lodge Stay Charge</span>
                          <span>GH₵{(selectedBooking.totalPrice - Number((selectedBooking as any).lateCheckOutFeeApplied || 0)).toFixed(2)}</span>
                        </div>
                      )}
                      {Number((selectedBooking as any).lateCheckOutFeeApplied || 0) > 0 && (
                        <div className="flex justify-between text-amber-500">
                          <span>Late Check-Out Fee</span>
                          <span>GH₵{Number((selectedBooking as any).lateCheckOutFeeApplied).toFixed(2)}</span>
                        </div>
                      )}
                      {checkoutUnpaidDrinksTotal > 0 && (
                        <>
                          <div className="flex justify-between text-purple-500 font-bold pt-1 border-t border-dashed border-zinc-800/20 dark:border-zinc-800 mt-1">
                            <span>Drinks Tab (Settled)</span>
                            <span>GH₵{checkoutUnpaidDrinksTotal.toFixed(2)}</span>
                          </div>
                          <div className="pl-2 space-y-0.5 text-[10px] text-zinc-500">
                            {checkoutUnpaidDrinks.map((sale, idx) => (
                              <div key={`sale-${sale.id}-${idx}`} className="flex justify-between">
                                <span>• {sale.items ? sale.drinkName : `${sale.drinkName} (x${sale.quantity})`}</span>
                                <span>GH₵{getDrinkUnpaidAmount(sale).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {(() => {
                        const lateFee = Number((selectedBooking as any).lateCheckOutFeeApplied || 0);
                        const initialRoomPaid = Math.max(0, selectedBooking.totalPrice - lateFee);
                        const totalCheckoutDue = lateFee + checkoutUnpaidDrinksTotal;
                        return (
                          <>
                            <div className="flex justify-between font-bold text-emerald-500 pt-1 border-t border-dashed border-zinc-800/20 dark:border-zinc-800">
                              <span>Room Stay Paid</span>
                              <span>GH₵{initialRoomPaid.toFixed(2)}</span>
                            </div>
                            {totalCheckoutDue > 0 ? (
                              <div className="flex justify-between font-bold text-amber-500 pt-1">
                                <span>Balance Due (Late Fee / Drinks)</span>
                                <span>GH₵{totalCheckoutDue.toFixed(2)}</span>
                              </div>
                            ) : (
                              <div className="flex justify-between font-bold text-emerald-500 pt-1">
                                <span>Total Paid & Cleared</span>
                                <span>GH₵{(selectedBooking.totalPrice + checkoutUnpaidDrinksTotal).toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-zinc-500 text-[10px]">
                              <span>Payment Status</span>
                              <span className={totalCheckoutDue > 0 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                                {totalCheckoutDue > 0 ? 'PENDING CHECKOUT SETTLEMENT' : 'SUCCESS / FULLY COMPLETED'}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="text-center pt-2">
                      <p className="text-[9px] text-zinc-400">Thank you for staying with Nabslodge!</p>
                      <p className="text-[8px] text-zinc-500 font-mono mt-0.5">Receipt Ref: #{selectedBooking.id}</p>
                    </div>

                    <div className="mt-8 pt-4 border-t border-dashed border-zinc-200 text-center text-[10px] text-zinc-400 font-medium tracking-wide printable-footer">
                      Web app developed by SUALAH TELLEM (0553189032)
                    </div>
                  </div>
                  
                  <div className="flex flex-col w-full gap-2">
                    <div className="flex w-full gap-2">
                      <button
                        onClick={() => openPrintPreview({
                          elementId: 'checkout-receipt-card',
                          title: `Checkout Receipt - Room ${selectedBooking.roomNumber}`,
                          documentType: 'Receipt',
                          invoiceNum: selectedBooking.id,
                          guestName: selectedBooking.guestName,
                          roomNumber: selectedBooking.roomNumber,
                          checkInDate: selectedBooking.checkInDate,
                          checkOutDate: selectedBooking.checkOutDate,
                          numberOfNights: Math.max(1, Math.ceil(Math.abs((parseSafeDate(selectedBooking.checkOutDate)?.getTime() || 0) - (parseSafeDate(selectedBooking.checkInDate)?.getTime() || 0)) / (1000 * 3600 * 24))),
                          totalPrice: selectedBooking.totalPrice,
                          paymentStatus: selectedBooking.paymentStatus || 'Paid',
                          bookingObj: selectedBooking
                        })}
                        className={`flex-1 py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                          isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        <Printer className="w-3.5 h-3.5" /> Print Receipt
                      </button>
                      <button
                        onClick={handleDownloadReceipt}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
                      >
                        <Receipt className="w-3.5 h-3.5" /> Save PDF
                      </button>
                    </div>
                    <button
                      onClick={() => setShowInvoiceModal(false)}
                      className={`w-full py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer ${
                        isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      Close Window
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`flex items-center gap-2 mb-1.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    <Receipt className="w-5 h-5" />
                    <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Check-Out Invoice Folio
                    </h3>
                  </div>
                  <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Calculate total dues and clear guest occupancy.
                  </p>

                  {/* Guest Invoice Summary Card */}
                  <div className={`border rounded-2xl p-5 space-y-4 text-xs font-sans ${
                    isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-200'
                  }`}>
                    
                    <div className={`border-b pb-3 ${isDarkMode ? 'border-zinc-900' : 'border-slate-200'}`}>
                      <span className={`text-[10px] font-mono uppercase block ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>GUEST</span>
                      <div className={`text-sm font-bold mt-0.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{selectedBooking.guestName}</div>
                      <span className={`text-[10px] font-mono mt-1 block ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Contact: {selectedBooking.guestContact}</span>
                    </div>

                    <div className={`grid grid-cols-2 gap-4 border-b pb-3 ${isDarkMode ? 'border-zinc-900' : 'border-slate-200'}`}>
                      <div>
                        <span className={`text-[10px] font-mono uppercase block ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>CHECK-IN</span>
                        <span className={`font-mono text-[11px] font-bold block mt-0.5 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>{selectedBooking.checkInDate}</span>
                      </div>
                      <div>
                        <span className={`text-[10px] font-mono uppercase block ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>CHECK-OUT</span>
                        <span className={`font-mono text-[11px] font-bold block mt-0.5 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>{selectedBooking.checkOutDate}</span>
                      </div>
                    </div>

                    <div className={`space-y-2 border-b pb-3 font-mono ${isDarkMode ? 'border-zinc-900' : 'border-slate-200'}`}>
                      <div className="flex justify-between text-[11px]">
                        <span className={isDarkMode ? 'text-zinc-500' : 'text-slate-500'}>Room {selectedBooking.roomNumber} Rate</span>
                        <span className={isDarkMode ? 'text-zinc-300' : 'text-slate-700'}>GH₵{(selectedBooking.totalPrice / Math.max(1, Math.ceil(((parseSafeDate(selectedBooking.checkOutDate)?.getTime() || 0) - (parseSafeDate(selectedBooking.checkInDate)?.getTime() || 0)) / (1000 * 60 * 60 * 24)))).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className={isDarkMode ? 'text-zinc-500' : 'text-slate-500'}>Duration (Nights)</span>
                        <span className={isDarkMode ? 'text-zinc-300' : 'text-slate-700'}>x {Math.max(1, Math.ceil(((parseSafeDate(selectedBooking.checkOutDate)?.getTime() || 0) - (parseSafeDate(selectedBooking.checkInDate)?.getTime() || 0)) / (1000 * 60 * 60 * 24)))}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className={isDarkMode ? 'text-zinc-500' : 'text-slate-500'}>Initial Payment ({selectedBooking.paymentStatus})</span>
                        <span className={`uppercase font-bold text-[10px] ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                          GH₵{getActualPaidAmount(selectedBooking).toFixed(2)}
                        </span>
                      </div>
                      {applyLateCheckOutFee && (
                        <div className="flex justify-between text-[11px] text-amber-500 font-bold">
                          <span>Late Check-Out Fee</span>
                          <span>+ GH₵{lateCheckOutFee.toFixed(2)}</span>
                        </div>
                      )}
                      {checkoutUnpaidDrinksTotal > 0 && (
                        <>
                          <div className="flex justify-between text-[11px] text-purple-500 font-bold border-t border-dashed border-purple-500/20 pt-1.5 mt-1.5">
                            <span>Unpaid Drinks (Room Bill)</span>
                            <span>+ GH₵{checkoutUnpaidDrinksTotal.toFixed(2)}</span>
                          </div>
                          <div className={`text-[9px] leading-relaxed pl-2 border-l border-purple-500/30 space-y-0.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                            {checkoutUnpaidDrinks.map((sale, idx) => (
                              <div key={`sale-${sale.id}-${idx}`} className="flex justify-between">
                                <span>• {sale.items ? sale.drinkName : `${sale.drinkName} (x${sale.quantity})`}</span>
                                <span>GH₵{getDrinkUnpaidAmount(sale).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-1 font-mono">
                      <span className={`text-xs font-sans font-semibold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Remaining Balance to Settle</span>
                      <span className="text-base font-black text-emerald-500">
                        GH₵{(() => {
                          const isFivePercentAlready = selectedBooking.discountType === '5% Long-Stay';
                          const noPreviousDiscount = !selectedBooking.discountType || selectedBooking.discountType === 'None' || !(selectedBooking.discountAmount || 0);

                          const activeCheckoutDiscount = (noPreviousDiscount && checkoutIsFivePercent)
                            ? (selectedBooking.totalPrice * 0.05) + (checkoutManualDiscount || 0)
                            : (checkoutManualDiscount || 0);

                          const discountedStayPrice = Math.max(0, selectedBooking.totalPrice - activeCheckoutDiscount);
                          const initialPaid = getActualPaidAmount(selectedBooking);
                          const baseDues = discountedStayPrice + (applyLateCheckOutFee ? lateCheckOutFee : 0);
                          const totalDues = baseDues + checkoutUnpaidDrinksTotal;
                          return Math.max(0, totalDues - initialPaid).toFixed(2);
                        })()}
                      </span>
                    </div>

                  </div>

                  {/* Checkout Discount Section */}
                  {(() => {
                    const originalDiscountAmt = Number(selectedBooking.discountAmount || 0);
                    const originalDiscountType = selectedBooking.discountType || 'None';
                    const hasPreviousDiscount = originalDiscountAmt > 0 && originalDiscountType !== 'None';
                    const isFivePercentAlready = originalDiscountType === '5% Long-Stay';
                    const checkoutNights = Math.max(1, Math.ceil(((parseSafeDate(selectedBooking.checkOutDate)?.getTime() || 0) - (parseSafeDate(selectedBooking.checkInDate)?.getTime() || 0)) / (1000 * 3600 * 24)));

                    return (
                      <div className="space-y-3 mb-4">
                        {hasPreviousDiscount && (
                          <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${isDarkMode ? 'bg-blue-950/30 border-blue-800/50 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                            <span className="font-bold">✨ Previous Discount Applied ({originalDiscountType}):</span>
                            <span className="font-mono font-bold">-GH₵{originalDiscountAmt.toFixed(2)}</span>
                          </div>
                        )}

                        <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-200'}`}>
                          {/* 5% Checkbox */}
                          <div className="flex items-center justify-between">
                            <label className={`text-xs font-bold flex items-center gap-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                              <span>5% Long-Stay Discount</span>
                              {isFivePercentAlready ? (
                                <span className="text-[10px] text-amber-500 font-mono font-normal">(Already Applied - Frozen)</span>
                              ) : hasPreviousDiscount ? (
                                <span className="text-[10px] text-amber-500 font-mono font-normal">(Unavailable - Previous Discount Applied)</span>
                              ) : checkoutNights < 10 ? (
                                <span className="text-[10px] text-amber-500 font-mono font-normal">(Requires 10+ nights)</span>
                              ) : null}
                            </label>
                            <input
                              type="checkbox"
                              checked={isFivePercentAlready || (!hasPreviousDiscount && checkoutNights >= 10 && checkoutIsFivePercent)}
                              disabled={isFivePercentAlready || hasPreviousDiscount || checkoutNights < 10}
                              onChange={(e) => setCheckoutIsFivePercent(e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Manual Discount Input (ALWAYS fully enabled and editable) */}
                          <div>
                            <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {hasPreviousDiscount ? 'Additional Manual Discount at Checkout (GH₵)' : 'Manual Discount at Checkout (GH₵)'}
                            </label>
                            <input
                              type="number"
                              value={checkoutManualDiscount || ''}
                              onChange={(e) => setCheckoutManualDiscount(Number(e.target.value))}
                              className={`w-full px-3 py-2 rounded-xl text-xs border ${theme.input}`}
                              placeholder={hasPreviousDiscount ? "Enter additional checkout discount (0.00)" : "0.00"}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Late Check-Out Toggle Option */}
                  <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-200'} mb-4`}>
                    <div className="flex items-center justify-between">
                      <div className="pr-4">
                        <span className={`text-xs font-bold block ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Apply Late Check-Out Fee</span>
                        <p className={`text-[10px] mt-0.5 leading-relaxed ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                          Apply an operational late check-out fee of GH₵{lateCheckOutFee} if checkout is requested after {globalCheckOutTime}.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={applyLateCheckOutFee}
                        onChange={(e) => setApplyLateCheckOutFee(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-350 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Secure Receipt declaration */}
                  <div className={`p-3 rounded-2xl flex gap-2.5 text-[11px] my-4 leading-normal ${
                    isDarkMode ? 'bg-emerald-950/30 border border-emerald-900/60 text-zinc-400' : 'bg-emerald-50 border border-emerald-100 text-slate-600'
                  }`}>
                    <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-500'}`} />
                    <div>
                      <span className={`font-bold block mb-0.5 ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>Clearing Occupancy Policy</span>
                      By clicking "Process checkout", you confirm that the total amount has been paid in full.
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Payment Method *
                    </label>
                    <select
                      value={checkoutPaymentMethod}
                      onChange={(e) => setCheckoutPaymentMethod(e.target.value as any)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    >
                      <option value="Cash">Cash (Physical Cash)</option>
                      <option value="Mobile Money">Mobile Money (Momo)</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Post-Checkout Room Status
                    </label>
                    <select
                      value={checkoutNextStatus}
                      onChange={(e) => setCheckoutNextStatus(e.target.value as RoomStatus)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    >
                      <option value="Cleaning">Cleaning / Readying Needed</option>
                      <option value="Available">Available</option>
                      <option value="Maintenance">Under Maintenance</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowInvoiceModal(false)}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        isDarkMode 
                          ? 'bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 text-zinc-400' 
                          : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-xs'
                      }`}
                    >
                      Cancel Checkout
                    </button>
                    <button
                      type="button"
                      disabled={isCheckingOut}
                      onClick={handleConfirmCheckout}
                      className={`flex-1 py-2.5 bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-500/20 ${
                        isCheckingOut ? 'opacity-60 cursor-not-allowed' : 'hover:bg-emerald-600 cursor-pointer'
                      }`}
                    >
                      {isCheckingOut ? 'Processing...' : 'Confirm Checkout & Paid'}
                    </button>
                  </div>
                </>
              )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- BOOK FUTURE STAY MODAL --- */}
      <AnimatePresence>
        {showFutureStayModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="p-6 pb-0 shrink-0 relative">
                <button
                  type="button"
                  onClick={() => setShowFutureStayModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  <h3 className={`text-base font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Book Future Stay (Nights Locked)
                  </h3>
                </div>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Reserve a future room in advance with a mandatory minimum 50% deposit.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-thin scroll-smooth">
                <form onSubmit={handleBookFutureStaySubmit} className="space-y-4">
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Guest Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Kofi Annan"
                    value={futureGuestName}
                    onChange={(e) => setFutureGuestName(e.target.value)}
                    className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Phone Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="0241234567"
                      value={futureGuestPhone}
                      onChange={(e) => setFutureGuestPhone(e.target.value)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="guest@domain.com"
                      value={futureGuestEmail}
                      onChange={(e) => setFutureGuestEmail(e.target.value)}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Select Room *
                  </label>
                  <select
                    required
                    value={futureRoomId}
                    onChange={(e) => setFutureRoomId(e.target.value)}
                    className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                  >
                    <option value="">-- Choose Room --</option>
                    {rooms.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        Room {rm.roomNumber} - {rm.roomType} (GH₵{rm.price}/night)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 relative">
                  {/* Check-In Date Field */}
                  <div className="relative">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Check-In Date *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        required
                        placeholder="Select check-in date"
                        value={formatDisplayDate(futureCheckIn)}
                        onClick={handleCheckInClick}
                        className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border cursor-pointer ${theme.input}`}
                      />
                      {showRoomWarning === 'checkin' && (
                        <div className="absolute bottom-full left-0 mb-2 z-50 whitespace-nowrap bg-rose-950 text-rose-200 text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-2xl border border-rose-900 animate-bounce">
                          ⚠️ Please select a room first.
                        </div>
                      )}

                      {activePopover === 'checkin' && futureRoomId && (
                        <div className={`absolute top-full left-0 mt-2 z-50 w-[300px] shadow-2xl rounded-2xl p-1 border ${isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                          <div className="flex justify-end p-1">
                            <button
                              type="button"
                              onClick={() => setActivePopover(null)}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                            >
                              ✕ Close
                            </button>
                          </div>
                          <FutureStayCalendar
                            selectedRoom={futureRoomId}
                            bookings={bookings}
                            futureCheckIn={futureCheckIn}
                            futureCheckOut={futureCheckOut}
                            isDarkMode={isDarkMode}
                            onClearSelection={() => {
                              setFutureCheckIn('');
                              setFutureCheckOut('');
                              setFutureStayError('');
                            }}
                            onSelectDate={(dateStr) => {
                              setFutureCheckIn(dateStr);
                              if (futureCheckOut && dateStr >= futureCheckOut) {
                                setFutureCheckOut('');
                              }
                              setFutureStayError('');
                              setActivePopover(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Check-Out Date Field */}
                  <div className="relative">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Check-Out Date *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        required
                        placeholder="Select check-out date"
                        value={formatDisplayDate(futureCheckOut)}
                        onClick={handleCheckOutClick}
                        className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border cursor-pointer ${theme.input}`}
                      />
                      {showRoomWarning === 'checkout' && (
                        <div className="absolute bottom-full right-0 mb-2 z-50 whitespace-nowrap bg-rose-950 text-rose-200 text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-2xl border border-rose-900 animate-bounce">
                          ⚠️ Please select a room first.
                        </div>
                      )}

                      {activePopover === 'checkout' && futureRoomId && (
                        <div className={`absolute top-full right-0 mt-2 z-50 w-[300px] shadow-2xl rounded-2xl p-1 border ${isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                          <div className="flex justify-end p-1">
                            <button
                              type="button"
                              onClick={() => setActivePopover(null)}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                            >
                              ✕ Close
                            </button>
                          </div>
                          <FutureStayCalendar
                            selectedRoom={futureRoomId}
                            bookings={bookings}
                            futureCheckIn={futureCheckIn}
                            futureCheckOut={futureCheckOut}
                            isDarkMode={isDarkMode}
                            onClearSelection={() => {
                              setFutureCheckIn('');
                              setFutureCheckOut('');
                              setFutureStayError('');
                            }}
                            onSelectDate={(dateStr) => {
                              if (futureCheckIn && dateStr <= futureCheckIn) {
                                setFutureStayError('❌ Check-out date must occur after check-in date.');
                                return;
                              }
                              const blockedDates = getBlockedDatesForRoom(futureRoomId);
                              let hasOverlap = false;
                              if (futureCheckIn) {
                                const startD = new Date(futureCheckIn);
                                const endD = new Date(dateStr);
                                const temp = new Date(startD);
                                while (temp < endD) {
                                  const y = temp.getFullYear();
                                  const m = String(temp.getMonth() + 1).padStart(2, '0');
                                  const d = String(temp.getDate()).padStart(2, '0');
                                  const checkDate = `${y}-${m}-${d}`;
                                  if (blockedDates[checkDate]) {
                                    hasOverlap = true;
                                    break;
                                  }
                                  temp.setDate(temp.getDate() + 1);
                                }
                              }
                              if (hasOverlap) {
                                setFutureStayError('❌ Selected range overlaps with an existing booking.');
                                return;
                              }
                              setFutureCheckOut(dateStr);
                              setFutureStayError('');
                              setActivePopover(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                                         {/* Occasion Booking Toggle and Guest Count selection for Future stays */}
                {(() => {
                  const r = rooms.find(rm => rm.id === futureRoomId);
                  if (!r) return null;
                  return (
                    <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'} space-y-4`}>
                      {/* Occasion Booking Mode (Only for Apartments) */}
                      {(r.roomType === '2 Bedroom Apartment' || r.roomType === '3 Bedroom Apartment') && (
                        <div className="flex items-center justify-between pb-3.5 border-b border-zinc-200 dark:border-zinc-850">
                          <div className="pr-4">
                            <span className={`text-xs font-bold block ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Occasion Booking Mode</span>
                            <span className={`text-[10px] block leading-normal ${isDarkMode ? 'text-zinc-500' : 'text-slate-550'} mt-0.5`}>
                              Weddings, parties, or social gatherings (Premium rates apply).
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={futureIsOccasion}
                            onChange={(e) => {
                              setFutureIsOccasion(e.target.checked);
                              setFutureIsMonthly(false);
                              setFutureGuestCount('1');
                            }}
                            className="w-4.5 h-4.5 rounded-lg text-blue-600 border-zinc-300 dark:border-zinc-700 focus:ring-blue-500 cursor-pointer shrink-0"
                          />
                        </div>
                      )}

                      {/* Monthly Premium Package (For ALL rooms) */}
                      <div className="flex items-center justify-between">
                        <div className="pr-4">
                          <span className={`text-xs font-bold block ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Monthly Premium Package</span>
                          <span className={`text-[10px] block leading-normal ${isDarkMode ? 'text-zinc-500' : 'text-slate-550'} mt-0.5`}>
                            Long-term stay (Special discounted rates).
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={futureIsMonthly}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFutureIsMonthly(checked);
                            setFutureIsOccasion(false);
                            setFutureGuestCount('1');
                            if (checked && !futureSelectedMonth) {
                              setFutureSelectedMonth(upcomingMonths[0]);
                            }
                          }}
                          className="w-4.5 h-4.5 rounded-lg text-purple-600 border-zinc-300 dark:border-zinc-700 focus:ring-purple-500 cursor-pointer shrink-0"
                        />
                      </div>

                      {/* Specify Month Dropdown (Shown only if Monthly Premium Package is checked) */}
                      {futureIsMonthly && (
                        <div className="space-y-1.5 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-850">
                          <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            Specify Booking Month *
                          </label>
                          <select
                            value={futureSelectedMonth}
                            onChange={(e) => setFutureSelectedMonth(e.target.value)}
                            className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                          >
                            {upcomingMonths.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Guest Count */}
                      <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-850">
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Number of Guests (Max {
                            (r.roomType === '2 Bedroom Apartment' || r.roomType === '3 Bedroom Apartment')
                              ? (futureIsOccasion ? (r.occasionBookingMaxGuests || 8) : (r.normalBookingMaxGuests || 4))
                              : (r.maxGuests || 2)
                          })
                        </label>
                        <select
                          value={futureGuestCount}
                          onChange={(e) => setFutureGuestCount(e.target.value)}
                          className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none font-mono transition-colors ${theme.input}`}
                        >
                          {Array.from(
                            { length: (r.roomType === '2 Bedroom Apartment' || r.roomType === '3 Bedroom Apartment')
                              ? (futureIsOccasion ? (r.occasionBookingMaxGuests || 8) : (r.normalBookingMaxGuests || 4))
                              : (r.maxGuests || 2)
                            },
                            (_, i) => (i + 1).toString()
                          ).map(num => (
                            <option key={num} value={num}>{num} {num === '1' ? 'Guest' : 'Guests'}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}

                {/* Live pricing estimation card */}
                {(() => {
                  const r = rooms.find(rm => rm.id === futureRoomId);
                  if (!r) return null;
                  const n = getModalNights();
                  let baseRate = r.price;
                  if (futureIsMonthly) {
                    baseRate = r.monthlyPremiumPrice || r.price;
                  } else if (r.roomType === '2 Bedroom Apartment' || r.roomType === '3 Bedroom Apartment') {
                    baseRate = futureIsOccasion ? (r.occasionBookingPrice || 1000) : (r.normalBookingPrice || 600);
                  }
                  let tot = futureIsMonthly ? baseRate : (baseRate * n);
                  if (futureIsFivePercentDiscount && n >= 10) tot -= (tot * 0.05);
                  tot -= (futureManualDiscountAmount || 0);
                  tot = Math.max(0, tot);
                  const dep = tot * 0.5;

                  return (
                    <div className="space-y-3">
                      {/* Discount Controls */}
                      {n >= 10 && (
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-850">
                          <label className={`text-xs font-bold ${isDarkMode ? 'text-zinc-100' : 'text-slate-800'}`}>Apply 5% Long-Stay Discount</label>
                          <input 
                            type="checkbox" 
                            checked={futureIsFivePercentDiscount} 
                            onChange={(e) => setFutureIsFivePercentDiscount(e.target.checked)} 
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-850">
                        <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Manual Discount (GH₵)</label>
                        <input 
                          type="number" 
                          value={futureManualDiscountAmount || ''} 
                          onChange={(e) => setFutureManualDiscountAmount(Number(e.target.value))} 
                          className={`w-full px-3 py-2 rounded-xl text-xs border ${theme.input}`}
                          placeholder="0.00"
                        />
                      </div>

                      <div className={`p-4 rounded-2xl border text-xs font-mono space-y-1 ${
                        isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}>
                      {futureIsMonthly && futureSelectedMonth && (
                        <div className="flex justify-between text-purple-600 dark:text-purple-400 font-semibold">
                          <span>Package Month:</span>
                          <span>{futureSelectedMonth}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Nights:</span>
                        <span className="font-bold">{n} nights</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Stay Cost:</span>
                        <span className="font-bold text-blue-500">GH₵{tot.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-500">
                        <span>Min Deposit (50%):</span>
                        <span className="font-bold">GH₵{dep.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {(() => {
                  const r = rooms.find(rm => rm.id === futureRoomId);
                  if (!r || !futureCheckIn || !futureCheckOut) return null;
                  const d1 = new Date(futureCheckIn);
                  const d2 = new Date(futureCheckOut);
                  const diffDays = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)));
                  let baseRate = r.price;
                  if (futureIsMonthly) {
                    baseRate = r.monthlyPremiumPrice || r.price;
                  } else if (r.roomType === '2 Bedroom Apartment' || r.roomType === '3 Bedroom Apartment') {
                    baseRate = futureIsOccasion ? (r.occasionBookingPrice || 1000) : (r.normalBookingPrice || 600);
                  }
                  let tot = futureIsMonthly ? baseRate : (baseRate * diffDays);
                  if (futureIsFivePercentDiscount && diffDays >= 10) tot -= (tot * 0.05);
                  tot -= (futureManualDiscountAmount || 0);
                  tot = Math.max(0, tot);
                  const dep = tot * 0.5;

                  return (
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                          Payment Status / Option *
                        </label>
                        <select
                          value={resPayment}
                          onChange={(e) => {
                            const mode = e.target.value as any;
                            setResPayment(mode);
                            if (mode === 'Paid') {
                              setFutureAmountPaid(tot);
                            } else if (mode === 'Partial') {
                              setFutureAmountPaid(dep);
                            }
                          }}
                          className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                        >
                          <option value="Partial">Custom Deposit / Initial Payment</option>
                          <option value="Split">Split Payment (Cash + Momo)</option>
                          <option value="Paid">Paid In Full (100%)</option>
                        </select>
                      </div>

                      {(resPayment as string) === 'Split' && (
                        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                                Cash Amount (GH₵)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={splitCashAmount || ''}
                                onChange={(e) => setSplitCashAmount(Number(e.target.value))}
                                placeholder="0.00"
                                className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                                Mobile Money (GH₵)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={splitMomoAmount || ''}
                                onChange={(e) => setSplitMomoAmount(Number(e.target.value))}
                                placeholder="0.00"
                                className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                              />
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-[11px] font-bold text-blue-600 dark:text-blue-400 pt-1">
                            <span>Total Split Received:</span>
                            <span>GH₵{(splitCashAmount + splitMomoAmount).toFixed(2)} / GH₵{tot.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {resPayment === 'Partial' && (
                        <div className="space-y-1.5 p-3 rounded-xl border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
                          <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>
                            Initial Payment / Deposit Received (GH₵) *
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            max={tot}
                            step="0.01"
                            placeholder="Enter initial deposit received (e.g. 100.00)"
                            value={futureAmountPaid || ''}
                            onChange={(e) => setFutureAmountPaid(parseFloat(e.target.value) || 0)}
                            className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                          />
                          <div className="flex justify-between items-center text-[11px] font-bold text-amber-600 dark:text-amber-400 pt-1">
                            <span>Remaining Balance Due:</span>
                            <span>GH₵{Math.max(0, tot - Math.min(futureAmountPaid || 0, tot)).toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {resPayment !== 'Unpaid' && (resPayment as string) !== 'Split' && (
                        <div>
                          <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            Payment Method *
                          </label>
                          <select
                            value={resPaymentMethod}
                            onChange={(e) => setResPaymentMethod(e.target.value as any)}
                            className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                          >
                            <option value="Cash">Cash (Physical Cash)</option>
                            <option value="Mobile Money">Mobile Money (Momo)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {futureStayError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono">
                    ⚠ {futureStayError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFutureStayModal(false)}
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
                    disabled={isProcessingAction}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isProcessingAction ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Lock Stay'
                    )}
                  </button>
                </div>
              </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- ARRIVAL WALK-IN BALANCE MODAL --- */}
      <AnimatePresence>
        {showArrivalModal && arrivalBooking && (() => {
          const selectedBooking = arrivalBooking;
          const depositPaid = getActualPaidAmount(selectedBooking);
          const totalPrice = Number(selectedBooking.totalPrice ?? 0);
          const balanceDue = totalPrice - depositPaid;

          return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`border rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden ${
                  isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="p-6 pb-0 shrink-0 relative">
                  <button
                    type="button"
                    onClick={() => setShowArrivalModal(false)}
                    className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer z-10 ${
                      isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="w-5 h-5 text-emerald-500" />
                    <h3 className={`text-base font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      Process Arrival Check-In
                    </h3>
                  </div>
                  <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Collect remaining balance to convert the future reservation into active check-in.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-thin scroll-smooth">

                <div className={`p-4 rounded-2xl border text-xs font-mono space-y-2 mb-4 ${
                  isDarkMode ? 'bg-zinc-950 border-zinc-850 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block">Guest Name</span>
                    <strong className="text-sm text-zinc-900 dark:text-white">{selectedBooking.guestName}</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/10 dark:border-zinc-850">
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase block">Room</span>
                      <span className="font-bold">Room {selectedBooking.roomNumber}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase block">Total Price</span>
                      <span className="font-bold">GH₵{totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/10 dark:border-zinc-850">
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase block">Deposit Paid</span>
                      <span className="font-bold text-amber-500">GH₵{depositPaid.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] uppercase block">Balance Due</span>
                      <span className="font-bold text-blue-500">GH₵{balanceDue.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={`block text-[10px] font-mono uppercase tracking-wider mb-2 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Check-In Billing Pathway
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setArrivalPaymentPathway('payNow');
                          setArrivalAmountReceived(balanceDue);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          arrivalPaymentPathway === 'payNow'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        <div className="text-xs font-extrabold">Pay Balance Now</div>
                        <div className="text-[10px] opacity-80 mt-0.5">Collect GH₵{balanceDue.toFixed(2)} right now</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setArrivalPaymentPathway('payLater');
                          setArrivalAmountReceived(0);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          arrivalPaymentPathway === 'payLater'
                            ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        <div className="text-xs font-extrabold">Pay on Check-Out</div>
                        <div className="text-[10px] opacity-80 mt-0.5 font-sans">Collect GH₵{balanceDue.toFixed(2)} at checkout</div>
                      </button>
                    </div>
                  </div>

                  {arrivalPaymentPathway === 'payNow' && (
                    <div>
                      <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Amount Received (Balance Cleared)
                      </label>
                      <input
                        type="number"
                        disabled
                        value={balanceDue}
                        className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border opacity-70 bg-zinc-100 dark:bg-zinc-950 ${theme.input}`}
                      />
                    </div>
                  )}

                  </div>
                </div>

                <div className="p-6 shrink-0 border-t border-dashed border-zinc-150 dark:border-zinc-800">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowArrivalModal(false)}
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
                      disabled={isProcessingAction}
                      onClick={handleConfirmArrivalCheckIn}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10"
                    >
                      {isProcessingAction ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Completing...
                        </>
                      ) : (
                        'Confirm Check-In'
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* --- AUTOMATED PRINT INVOICE MODAL --- */}
      <AnimatePresence>
        {showPrintInvoiceModal && invoiceBooking && (() => {
          const start = new Date(invoiceBooking.checkInDate);
          const end = new Date(invoiceBooking.checkOutDate);
          const diffTime = Math.max(0, end.getTime() - start.getTime());
          const numberOfNights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

          const matchingRoom = rooms.find(r => r.id === invoiceBooking.roomId);
          const roomType = matchingRoom?.roomType || 'Standard Room';
          
          // Fetch ALL drinks added to this room bill (including those settled at checkout)
          const unpaidDrinksList = invoiceType === 'CheckIn' ? [] : drinkSales.filter(s =>
            s.bookingId === invoiceBooking.id &&
            (s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentMethod === 'Split (Paid & Unpaid)' || s.paymentStatus === 'Unpaid')
          );
          const unpaidDrinksTotal = unpaidDrinksList.reduce((sum, s) => {
            // Include their full total price if they were billed to the room, since they are being invoiced here
            const isSplit = s.paymentMethod === 'Split (Paid & Unpaid)' || s.paymentStatus === 'Split';
            return sum + (isSplit ? (s.unpaidAmount || (s.totalPrice - (s.paidAmount || 0))) : s.totalPrice);
          }, 0);

          let roomStayTotal = invoiceBooking.totalPrice;
          const lateCheckOutFeeApplied = Number((invoiceBooking as any).lateCheckOutFeeApplied || 0);
          
          // If the booking is already checked out, the totalPrice already includes the fee, so subtract it to avoid double-counting in the itemized view
          if (invoiceBooking.status === 'CheckedOut' || invoiceType === 'CheckOut') {
            roomStayTotal -= lateCheckOutFeeApplied;
          }

          const invDiscountType = invoiceBooking.discountType;
          const invDiscountAmount = Number(invoiceBooking.discountAmount || 0);
          const hasInvDiscount = Boolean(invDiscountType && invDiscountType !== 'None' && invDiscountAmount > 0);
          const origRoomTotal = roomStayTotal + (hasInvDiscount ? invDiscountAmount : 0);
          const origNightlyRate = origRoomTotal / numberOfNights;

          let totalGross = roomStayTotal + lateCheckOutFeeApplied + unpaidDrinksTotal;
          const roomTotal = roomStayTotal;
          const total = totalGross;

          const nightlyRate = roomStayTotal / numberOfNights;

          let paymentsMade = getActualPaidAmount(invoiceBooking);
          const hasLateFee = Number((invoiceBooking as any).lateCheckOutFeeApplied || 0) > 0;
          if (hasLateFee) {
            const priorVal = Number((invoiceBooking as any).priorAmountPaid || 0);
            const directPaid = Number(invoiceBooking.amountPaid || invoiceBooking.deposit || 0);
            if (directPaid >= totalGross || invoiceBooking.paymentStatus === 'Paid') {
              paymentsMade = totalGross;
            } else {
              paymentsMade = priorVal > 0 ? priorVal : Math.max(0, totalGross - lateCheckOutFeeApplied - unpaidDrinksTotal);
            }
          } else if (invoiceBooking.paymentStatus === 'Paid' || invoiceBooking.status === 'CheckedOut' || invoiceType === 'CheckOut') {
            paymentsMade = totalGross;
          }
          const balanceDue = Math.max(0, totalGross - paymentsMade);
          const isReceipt = balanceDue <= 0;
          const documentLabel = isReceipt ? 'Receipt' : 'Invoice';
          const invoiceNum = `${isReceipt ? 'REC' : 'INV'}-${invoiceBooking.id.replace('book_', '').toUpperCase()}`;
          const dateOfIssue = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
          const currentTime = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
              <style>{`
                @media print {
                  @page {
                    size: 80mm auto;
                    margin: 0;
                  }
                  body {
                    background: white !important;
                    color: black !important;
                  }
                  body * {
                    display: none !important;
                  }
                  .printable-invoice-modal {
                     display: block !important;
                   }
                  .printable-invoice-modal {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 76mm !important;
                    padding: 8px !important;
                    background: white !important;
                    color: black !important;
                    box-shadow: none !important;
                    font-size: 11px !important;
                  }
                  .printable-invoice-modal h1 {
                    font-size: 16px !important;
                    margin-bottom: 2px !important;
                  }
                  .printable-invoice-modal h3 {
                    font-size: 10px !important;
                    margin-bottom: 2px !important;
                    border-bottom: 1px dashed #ccc !important;
                    padding-bottom: 2px !important;
                  }
                  .printable-invoice-modal table {
                    display: table !important;
                    width: 100% !important;
                    font-size: 10px !important;
                    border-collapse: collapse !important;
                  }
                  .printable-invoice-modal thead {
                    display: table-header-group !important;
                  }
                  .printable-invoice-modal tbody {
                    display: table-row-group !important;
                  }
                  .printable-invoice-modal tr {
                    display: table-row !important;
                    border-bottom: 1px solid #eee !important;
                  }
                  .printable-invoice-modal th, .printable-invoice-modal td {
                    display: table-cell !important;
                    padding: 4px !important;
                  }
                  .printable-invoice-modal .grid {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 4px !important;
                  }
                  .printable-invoice-modal .flex-row {
                     display: flex !important;
                     flex-direction: row !important;
                     gap: 12px !important;
                     align-items: center !important;
                   }
                   .printable-invoice-modal .grid-cols-2 {
                     display: flex !important;
                     flex-direction: column !important;
                     gap: 2px !important;
                   }
                  .no-print, button, .no-print *, [data-html2canvas-ignore] {
                    display: none !important;
                  }
                  .printable-footer {
                    display: block !important;
                    border-top: 1px dashed #000 !important;
                    margin-top: 8px !important;
                    padding-top: 4px !important;
                    font-size: 9px !important;
                    font-weight: bold !important;
                    color: black !important;
                    text-align: center !important;
                  }
                }
              `}</style>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`border w-full max-w-5xl shadow-2xl rounded-2xl p-6 relative max-h-[95vh] overflow-y-auto ${
                  isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
                }`}
              >
                {/* Close modal button */}
                <button
                  onClick={() => setShowPrintInvoiceModal(false)}
                  className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer no-print ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                  
                  {/* Left Column: Interactive Customization Controls */}
                  <div className="lg:col-span-2 space-y-5 no-print border-r border-zinc-200 dark:border-zinc-800 pr-0 lg:pr-6">
                    <div className="space-y-1">
                      <h2 className="text-lg font-black tracking-tight text-blue-600 dark:text-blue-400">Print Options</h2>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Configure parameters before printing or saving.</p>
                    </div>

                    {/* Paper Size / Layout Toggle */}
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase font-mono font-bold tracking-wider text-zinc-400">Paper Format</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setInvoicePrintPaperSize('thermal')}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            invoicePrintPaperSize === 'thermal'
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                              : isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          Thermal (80mm POS)
                        </button>
                        <button
                          type="button"
                          onClick={() => setInvoicePrintPaperSize('a4')}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                            invoicePrintPaperSize === 'a4'
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                              : isDarkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          Standard A4 Paper
                        </button>
                      </div>
                    </div>

                    {/* Document Header Visibility */}
                    <div className="space-y-3.5 pt-1">
                      <label className="text-[11px] uppercase font-mono font-bold tracking-wider text-zinc-400">Show / Hide Fields</label>
                      
                      <div className="space-y-2 text-xs">
                        {/* Branding */}
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoicePrintShowBranding}
                            onChange={(e) => setInvoicePrintShowBranding(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Show Brand Letterhead / Logo</span>
                        </label>

                        {/* Staff */}
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoicePrintShowStaff}
                            onChange={(e) => setInvoicePrintShowStaff(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Show Operator Name & Staff ID</span>
                        </label>

                        {/* Signatures */}
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoicePrintShowSignature}
                            onChange={(e) => setInvoicePrintShowSignature(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">Include Approved Signature Lines</span>
                        </label>
                      </div>
                    </div>

                    {/* Custom Memo Message */}
                    <div className="space-y-2 pt-1">
                      <label className="text-[11px] uppercase font-mono font-bold tracking-wider text-zinc-400 block">Custom Memo / Thank-You Note</label>
                      <textarea
                        rows={3}
                        value={invoicePrintMemo}
                        onChange={(e) => setInvoicePrintMemo(e.target.value)}
                        placeholder="Add a personalized note..."
                        className={`block w-full text-xs p-3 rounded-xl focus:outline-none transition-colors border ${
                          isDarkMode ? 'bg-zinc-850 border-zinc-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    {/* Actions Panel inside Print Settings */}
                    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <button
                        onClick={() => openPrintPreview({
                          elementId: 'print-invoice-sheet',
                          title: `Invoice Ref: INV-${invoiceBooking.id.replace('book_', '').toUpperCase()}`,
                          documentType: 'Invoice',
                          invoiceNum: `INV-${invoiceBooking.id.replace('book_', '').toUpperCase()}`,
                          guestName: invoiceBooking.guestName,
                          roomNumber: invoiceBooking.roomNumber,
                          checkInDate: invoiceBooking.checkInDate,
                          checkOutDate: invoiceBooking.checkOutDate,
                          numberOfNights: numberOfNights,
                          totalPrice: invoiceBooking.totalPrice,
                          paymentStatus: invoiceBooking.paymentStatus || 'Paid',
                          bookingObj: invoiceBooking
                        })}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md text-xs"
                      >
                        <Printer className="w-4 h-4" /> Open System Print Dialogue
                      </button>
                      <button
                        onClick={handleDownloadInvoicePDF}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md text-xs"
                      >
                        <Receipt className="w-4 h-4" /> Save as Verified PDF
                      </button>
                      <button
                        onClick={() => setShowPrintInvoiceModal(false)}
                        className={`w-full py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer border text-center ${
                          isDarkMode 
                            ? 'bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border-zinc-750' 
                            : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        Close & Return to Dashboard
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Live Document Preview Sheet */}
                  <div className="lg:col-span-3 space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono block no-print">
                      Live Document Sheet Preview
                    </span>

                    {/* Document simulation card */}
                    <div className={`p-6 rounded-2xl border bg-white text-zinc-900 shadow-xl overflow-y-auto ${
                      invoicePrintPaperSize === 'thermal' 
                        ? 'max-w-[390px] mx-auto border-dashed border-zinc-300 font-mono text-[11px]' 
                        : 'w-full border-zinc-300 font-sans text-xs'
                    }`}>
                      <div id="print-invoice-sheet" className="printable-invoice-modal space-y-6 print:w-[76mm] print:p-2 print:text-xs print:shadow-none print:space-y-3">
                        
                        {/* Letterhead Logo / Branding Header */}
                        {invoicePrintShowBranding && (
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-zinc-200 print:flex-row print:items-center print:gap-4 print:pb-2 print:border-b-dashed print:border-zinc-300">
                            <table style={{ width: '100%', marginBottom: '16px', border: 'none', tableLayout: 'fixed' }} className="logo-header-row">
      <tbody>
        <tr>
          <td style={{ width: '64px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="lg" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 print:text-base" style={{ margin: 0 }}>NABS LODGE</h1>
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest print:text-[10px] print:tracking-normal print:mt-0">
                                  Nabslodge {branch}
                                </p>
                                <p className="text-[10px] text-zinc-400 font-mono mt-0.5 print:text-[8px] print:mt-0">
                                  Official {invoiceType === 'CheckIn' ? 'Check-In Booking' : 'Check-Out Settlement'} {documentLabel}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                            <div className="text-left sm:text-right font-mono text-xs space-y-1 print:text-[10px] print:space-y-0.5 print:text-left">
                              <div><span className="text-zinc-500">{documentLabel} No:</span> <strong className="font-bold">{invoiceNum}</strong></div>
                              <div><span className="text-zinc-500">Date of Issue:</span> <span>{dateOfIssue}</span></div>
                              <div><span className="text-zinc-500">Current Time:</span> <span>{currentTime}</span></div>
                              <div className="print:hidden">
                                <span className="text-zinc-500">Status:</span> 
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  balanceDue > 0 ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : (invoiceType === 'CheckOut' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20')
                                }`}>{balanceDue > 0 ? 'PENDING SETTLEMENT' : (invoiceType === 'CheckOut' ? 'SETTLED' : 'ISSUED')}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Guest and Lodging details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2 print:flex print:flex-col print:gap-2 print:py-1">
                          <div>
                            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400 mb-2 print:text-[10px] print:mb-0.5">Guest Information</h3>
                            <div className="space-y-1 text-sm print:text-xs print:space-y-0.5">
                              <div className="font-bold print:text-[11px]">{invoiceBooking.guestName}</div>
                              <div className="text-zinc-500 font-mono text-xs print:text-[10px]">Contact: {invoiceBooking.guestContact}</div>
                              {invoicePrintShowStaff && (
                                <div className="text-zinc-400 text-xs print:text-[10px]">Processed by: {invoiceBooking.receptionistName} (Staff ID: {invoiceBooking.receptionistId})</div>
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400 mb-2 print:text-[10px] print:mb-0.5">Stay Schedule</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono print:flex print:flex-col print:gap-0.5">
                              <div>
                                <span className="text-zinc-500 block text-[9px] uppercase print:inline print:mr-1">Check-In:</span>
                                <span className="font-bold print:text-[10px]">{invoiceBooking.checkInDate}</span>
                              </div>
                              <div>
                                <span className="text-zinc-500 block text-[9px] uppercase print:inline print:mr-1">Check-Out:</span>
                                <span className="font-bold print:text-[10px]">{invoiceBooking.checkOutDate}</span>
                              </div>
                              <div className="col-span-2 pt-1 print:pt-0">
                                <span className="text-zinc-500 block text-[9px] uppercase print:inline print:mr-1">Total Stay Duration:</span>
                                <span className="font-bold print:text-[10px]">{numberOfNights} {numberOfNights === 1 ? 'Night' : 'Nights'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Clean itemized grid table */}
                        <div>
                          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400 mb-2.5 print:text-[10px] print:mb-0.5">Billing Itemization</h3>
                          <div className="border border-zinc-200 rounded-lg overflow-hidden print:border-zinc-300">
                            <table className="w-full text-left text-xs font-mono print:text-[10px]">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200 print:bg-zinc-100 print:border-zinc-300">
                                  <th className="p-3 font-bold text-zinc-500 print:p-1.5 print:text-[10px]">Accommodation Item</th>
                                  <th className="p-3 font-bold text-zinc-500 text-center print:p-1.5 print:text-[10px]">Nights</th>
                                  <th className="p-3 font-bold text-zinc-500 text-right print:p-1.5 print:text-[10px]">Rate</th>
                                  <th className="p-3 font-bold text-zinc-500 text-right print:p-1.5 print:text-[10px]">Total Price</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-200 print:divide-zinc-300">
                                <tr>
                                  <td className="p-3 print:p-1.5">
                                    <span className="font-bold block print:text-[10px]">Room {invoiceBooking.roomNumber}</span>
                                    <span className="text-[10px] text-zinc-400 print:text-[8px]">{roomType}</span>
                                  </td>
                                  <td className="p-3 text-center print:p-1.5">{numberOfNights}</td>
                                  <td className="p-3 text-right print:p-1.5">GH₵{(hasInvDiscount ? origNightlyRate : nightlyRate).toFixed(2)}</td>
                                  <td className="p-3 text-right font-bold print:p-1.5">GH₵{(hasInvDiscount ? origRoomTotal : roomTotal).toFixed(2)}</td>
                                </tr>
                                {hasInvDiscount && (
                                  <tr className="bg-blue-50/60 print:bg-slate-50">
                                    <td className="p-3 print:p-1.5 text-blue-700 dark:text-blue-400">
                                      <span className="font-bold block print:text-[10px]">✨ Discount Applied ({invDiscountType})</span>
                                      <span className="text-[10px] text-zinc-500 print:text-[8px]">Approved promotional stay discount</span>
                                    </td>
                                    <td className="p-3 text-center print:p-1.5">-</td>
                                    <td className="p-3 text-right print:p-1.5 text-blue-700 dark:text-blue-400 font-bold">-GH₵{invDiscountAmount.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold text-blue-700 dark:text-blue-400 print:p-1.5">-GH₵{invDiscountAmount.toFixed(2)}</td>
                                  </tr>
                                )}
                                {lateCheckOutFeeApplied > 0 && (
                                  <tr>
                                    <td className="p-3 print:p-1.5">
                                      <span className="font-bold block print:text-[10px]">Late Check-Out Fee</span>
                                      <span className="text-[10px] text-zinc-400 print:text-[8px]">Late checkout extension fee applied</span>
                                    </td>
                                    <td className="p-3 text-center print:p-1.5">-</td>
                                    <td className="p-3 text-right print:p-1.5">GH₵{lateCheckOutFeeApplied.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold print:p-1.5">GH₵{lateCheckOutFeeApplied.toFixed(2)}</td>
                                  </tr>
                                )}
                                {unpaidDrinksList.length > 0 && (
                                  <tr>
                                    <td className="p-3 print:p-1.5">
                                      <span className="font-bold block print:text-[10px]">Drinks & Refreshments</span>
                                      <ul className="text-[9px] text-zinc-400 list-disc ml-4 print:text-[8px]">
                                        {unpaidDrinksList.map((s, idx) => (
                                          <li key={idx}>{s.drinkName} (x{s.quantity})</li>
                                        ))}
                                      </ul>
                                    </td>
                                    <td className="p-3 text-center print:p-1.5">{unpaidDrinksList.reduce((sum, s) => sum + s.quantity, 0)}</td>
                                    <td className="p-3 text-right print:p-1.5">-</td>
                                    <td className="p-3 text-right font-bold print:p-1.5">GH₵{unpaidDrinksTotal.toFixed(2)}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Financial Breakdown Summary */}
                        <div className="flex justify-end pt-2 print:pt-1 print:w-full">
                          <div className="w-full sm:w-80 space-y-2.5 font-mono text-xs print:w-full print:space-y-1 print:text-[10px]">
                            {hasInvDiscount && (
                              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 space-y-1 text-xs print:p-1.5">
                                <div className="flex justify-between text-zinc-600">
                                  <span>Original Accommodation Total:</span>
                                  <span className="line-through">GH₵{origRoomTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-blue-700 font-bold">
                                  <span>✨ Discount ({invDiscountType}):</span>
                                  <span>- GH₵{invDiscountAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-zinc-900 border-t border-dashed border-blue-200 pt-1">
                                  <span>Discounted Room Charge:</span>
                                  <span>GH₵{roomStayTotal.toFixed(2)}</span>
                                </div>
                              </div>
                            )}
                            <div className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 py-2.5 rounded-lg text-center">
                              All charges are flat and tax-exempt
                            </div>
                            <div className="border-t border-zinc-200 pt-2 flex justify-between font-bold text-sm print:pt-1 print:border-t-dashed print:border-zinc-300">
                              <span>Total Gross Charges:</span>
                              <span>GH₵{total.toFixed(2)}</span>
                            </div>
                            
                            {/* Explicit Payment Breakdown */}
                            <div className="pt-1 space-y-1 text-emerald-600 font-semibold print:text-black">
                              {hasLateFee && Number(invoiceBooking?.priorAmountPaid || 0) > 0 ? (
                                <>
                                  <div className="flex justify-between text-xs print:text-[10px]">
                                    <span>Initial Room Payment:</span>
                                    <span>- GH₵{Number(invoiceBooking.priorAmountPaid || 0).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs print:text-[10px]">
                                    <span>Checkout Settlement:</span>
                                    <span>- GH₵{Math.max(0, paymentsMade - Number(invoiceBooking.priorAmountPaid || 0)).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-emerald-200/50 pt-1 mt-1 print:border-dashed">
                                    <span>Total Payments Made:</span>
                                    <span>- GH₵{paymentsMade.toFixed(2)}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex justify-between">
                                  <span>Payments Made:</span>
                                  <span>- GH₵{paymentsMade.toFixed(2)}</span>
                                </div>
                              )}
                            </div>

                            <div className="border-t border-double border-zinc-300 pt-2.5 flex justify-between font-black text-base text-blue-600 print:pt-1 print:border-t-dashed print:border-zinc-300 print:text-black print:text-xs">
                              <span>{isReceipt ? 'Balance Remaining:' : 'Total Balance Due:'}</span>
                              <span>GH₵{balanceDue.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Signature block (Optional) */}
                        {invoicePrintShowSignature && (
                          <div className="grid grid-cols-2 gap-6 pt-8 border-t border-dashed border-zinc-200 mt-6 print:pt-4 print:mt-4">
                            <div className="text-center">
                              <div className="h-10 border-b border-zinc-200 mx-auto w-40"></div>
                              <span className="text-[10px] text-zinc-500 uppercase mt-1 block font-mono">Guest Signature</span>
                            </div>
                            <div className="text-center">
                              <div className="h-10 border-b border-zinc-200 mx-auto w-40 flex items-end justify-center">
                                <span className="font-mono text-[9px] text-zinc-400 italic mb-1">{invoiceBooking.receptionistName}</span>
                              </div>
                              <span className="text-[10px] text-zinc-500 uppercase mt-1 block font-mono">Approved Operator</span>
                            </div>
                          </div>
                        )}

                        {/* Thank you and custom memo disclaimer footer */}
                        <div className="text-center pt-8 border-t border-zinc-100 space-y-1 print:pt-4 print:border-t-dashed print:border-zinc-300">
                          <p className="text-[10px] text-zinc-500 italic print:text-[8px]">
                            "{invoicePrintMemo}"
                          </p>
                          <p className="text-[9px] text-zinc-400 print:text-[8px]">
                            Nabslodge © 2026. All rights reserved.
                          </p>
                        </div>

                        <div className="mt-8 pt-4 border-t border-dashed border-zinc-200 text-center text-[10px] text-zinc-400 font-medium tracking-wide printable-footer print:mt-4 print:pt-2 print:text-[9px] print:text-black">
                          Web app developed by SUALAH TELLEM (0553189032)
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* --- PRINT PREVIEW & DATE RANGE CONFIRMATION MODAL --- */}
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
                    <h2 className="text-lg font-bold tracking-tight">Print Preview & Date Range Verification</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Verify the invoice stay period and billing totals before launching the printer dialog.
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

              {/* Scrollable Content */}
              <div className="overflow-y-auto py-4 space-y-4 flex-1">
                {/* Date Range & Invoice Period Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/20 dark:border-blue-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Verified Invoice Stay Period
                    </span>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
                      {printPreviewConfig.numberOfNights || 1} {(printPreviewConfig.numberOfNights || 1) === 1 ? 'Night' : 'Nights'} Duration
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 bg-white/70 dark:bg-zinc-800/70 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono block">Check-In Date</span>
                      <span className="text-sm font-bold font-mono">{printPreviewConfig.checkInDate || 'N/A'}</span>
                    </div>
                    <div className="p-2.5 bg-white/70 dark:bg-zinc-800/70 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-mono block">Check-Out Date</span>
                      <span className="text-sm font-bold font-mono">{printPreviewConfig.checkOutDate || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-blue-500/20 flex flex-wrap justify-between items-center text-xs gap-2">
                    <div>
                      <span className="text-zinc-500">Guest:</span> <strong className="font-semibold">{printPreviewConfig.guestName || 'Valued Guest'}</strong>
                      <span className="mx-2 text-zinc-400">|</span>
                      <span className="text-zinc-500">Room:</span> <strong className="font-semibold">{printPreviewConfig.roomNumber || 'N/A'}</strong>
                    </div>
                    <div className="font-mono">
                      <span className="text-zinc-500">Total Billed:</span> <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">GH₵ {printPreviewConfig.totalPrice?.toFixed(2) || '0.00'}</strong>
                    </div>
                  </div>
                </div>

                {/* Date Range Confirmation Checkbox */}
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
                    <span className="font-bold block text-sm mb-0.5">Confirm Selected Invoice Date Range & Stay Period</span>
                    <span className="text-[11px] opacity-80 leading-relaxed block">
                      I have reviewed and confirmed that the stay schedule ({printPreviewConfig.checkInDate} to {printPreviewConfig.checkOutDate}) and itemized billing charges are accurate.
                    </span>
                  </div>
                </label>

                {/* Visual Document Miniature Frame */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono mb-2 block">
                    Document Layout Preview
                  </span>
                  <div className="p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white text-zinc-900 shadow-inner max-h-56 overflow-y-auto font-sans text-xs space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
                      <div>
                        <h4 className="font-black text-base text-blue-600 tracking-tight">NABSLODGE</h4>
                        <p className="text-[10px] text-zinc-500 uppercase">{branch} Branch</p>
                      </div>
                      <div className="text-right font-mono text-[10px] text-zinc-600">
                        <div>Ref: {printPreviewConfig.invoiceNum || printPreviewConfig.title}</div>
                        <div>Issued: {new Date().toLocaleDateString()}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] py-1 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
                      <div>
                        <span className="text-zinc-500 text-[10px] block">GUEST NAME</span>
                        <strong className="text-zinc-800">{printPreviewConfig.guestName || 'Valued Guest'}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block">ACCOMMODATION</span>
                        <strong className="text-zinc-800">Room {printPreviewConfig.roomNumber || 'N/A'}</strong>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-zinc-200">
                        <span className="text-zinc-500 text-[10px] block">INVOICE PERIOD</span>
                        <strong className="text-blue-700">{printPreviewConfig.checkInDate} ➔ {printPreviewConfig.checkOutDate} ({printPreviewConfig.numberOfNights || 1} Nights)</strong>
                      </div>
                    </div>

                    <div className="flex justify-between items-center font-bold text-sm pt-1">
                      <span>Total Amount Billed:</span>
                      <span className="text-emerald-700">GH₵ {printPreviewConfig.totalPrice?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => setShowPrintPreviewModal(false)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer border flex-1 ${
                    isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  Cancel / Edit Range
                </button>
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      // 1. Immediately close the modal state to restore the background screen
                      setShowPrintPreviewModal(false);
                      
                      // 2. Trigger programmatic PDF generation and download
                      if (printPreviewConfig.documentType === 'Invoice') {
                        handleDownloadInvoicePDF();
                      } else {
                        handleDownloadReceipt();
                      }
                      
                      // 3. Workspace focus restoration safely back to the main container
                      setTimeout(() => {
                        const container = document.getElementById('receptionist-dashboard-container');
                        if (container) {
                          container.focus();
                        }
                      }, 100);
                    }
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex-1 flex items-center justify-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" /> Save Verified PDF
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
                        const container = document.getElementById('receptionist-dashboard-container');
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

      {/* --- FAB MENU --- */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isFabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.9 }}
              className="flex flex-col items-end gap-3"
            >
              <button
                onClick={() => { setIsFabOpen(false); setActiveTab('history'); }}
                className="flex items-center gap-3 group"
              >
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-md ${isDarkMode ? 'bg-zinc-800 text-zinc-200' : 'bg-white text-slate-700'}`}>Guest Lookup</span>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-hover:scale-105 cursor-pointer ${isDarkMode ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white'}`}>
                  <Search className="w-5 h-5" />
                </div>
              </button>

              <button
                onClick={() => { setIsFabOpen(false); setShowMaintenanceModal(true); }}
                className="flex items-center gap-3 group"
              >
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-md ${isDarkMode ? 'bg-zinc-800 text-zinc-200' : 'bg-white text-slate-700'}`}>Maintenance Report</span>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-hover:scale-105 cursor-pointer ${isDarkMode ? 'bg-amber-600 text-white' : 'bg-amber-600 text-white'}`}>
                  <Wrench className="w-5 h-5" />
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  setShowQuickCheckInModal(true);
                }}
                className="flex items-center gap-3 group"
              >
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-md ${isDarkMode ? 'bg-zinc-800 text-zinc-200' : 'bg-white text-slate-700'}`}>New Check-In</span>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-hover:scale-105 cursor-pointer ${isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}>
                  <UserPlus className="w-5 h-5" />
                </div>
              </button>

              <button
                onClick={() => {
                  setIsFabOpen(false);
                  if (activityCatalog.length > 0) {
                    setWalkInServiceType(activityCatalog[0].name);
                    setWalkInTotalCharged(activityCatalog[0].price.toString());
                    setWalkInAmountPaid(activityCatalog[0].price.toString());
                  } else {
                    setWalkInServiceType('Photography Session');
                    setWalkInTotalCharged('200');
                    setWalkInAmountPaid('200');
                  }
                  setWalkInGuestName('');
                  setWalkInGuestPhone('');
                  setWalkInPaymentStatus('Paid');
                  setWalkInError('');
                  setShowWalkInModal(true);
                }}
                className="flex items-center gap-3 group"
              >
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-md ${isDarkMode ? 'bg-zinc-800 text-zinc-200' : 'bg-white text-slate-700'}`}>New Walk-In Activity</span>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform group-hover:scale-105 cursor-pointer ${isDarkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white'}`}>
                  <Receipt className="w-5 h-5" />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform z-50 cursor-pointer ${
            isFabOpen 
              ? 'bg-slate-700 hover:bg-slate-600 text-white rotate-45' 
              : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 shadow-blue-500/20'
          }`}
          aria-label="Open Actions Menu"
        >
          <Plus className="w-6 h-6 transition-transform" />
        </button>
      </div>

      <AnimatePresence>
        {showQuickCheckInModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => setShowQuickCheckInModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Quick Check-In
              </h3>
              <p className={`text-xs mb-4 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Rapidly assign a guest to any available room.
              </p>

              <form onSubmit={(e) => { handleInlineReservationSubmit(e); if (!resError) setShowQuickCheckInModal(false); }} className="space-y-4 text-xs">
                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Available Room
                  </label>
                  <select
                    required
                    value={resRoomId}
                    onChange={(e) => setResRoomId(e.target.value)}
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  >
                    <option value="" disabled>Select an available room</option>
                    {dynamicRooms.filter(r => r.status === 'Available').map(r => (
                      <option key={r.id} value={r.id}>Room {r.roomNumber} - {r.roomType} (GH₵{r.price}/night)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Guest Name (Full Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={resGuestName}
                    onChange={(e) => setResGuestName(e.target.value)}
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Contact Phone Number
                  </label>
                  <input
                    type="text"
                    required
                    value={resGuestContact}
                    onChange={(e) => setResGuestContact(e.target.value)}
                    placeholder="e.g. 0245556789"
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  />
                </div>

                <div className="relative">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                        Check-In Date & Time *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCalendarPopover(!showQuickCalendarPopover)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                          showQuickCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                        } ${theme.input}`}
                      >
                        <span className={resCheckIn ? "" : "text-zinc-400 dark:text-zinc-550"}>
                          {resCheckIn ? formatReadableDateTime(resCheckIn) : "Select check-in date"}
                        </span>
                        <Calendar className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 font-bold">
                        Check-Out Date & Time *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCalendarPopover(!showQuickCalendarPopover)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs text-left cursor-pointer focus:outline-none transition-colors border ${
                          showQuickCalendarPopover ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-zinc-200 dark:border-zinc-800'
                        } ${theme.input}`}
                      >
                        <span className={resCheckOut ? "" : "text-zinc-400 dark:text-zinc-550"}>
                          {resCheckOut ? formatReadableDateTime(resCheckOut) : "Select check-out date"}
                        </span>
                        <Calendar className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {showQuickCalendarPopover && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
                      {/* Dark Backdrop dimming layer */}
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowQuickCalendarPopover(false)} />
                      
                      {/* Active Calendar Content Box */}
                      <div className="relative z-50 w-[95%] max-w-sm rounded-2xl p-4 shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {!resRoomId ? (
                              <span className="text-amber-500 font-bold">⚠ Select a room above to show live availability</span>
                            ) : (
                              <span className="text-emerald-500 font-bold">✓ Showing live room availability</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowQuickCalendarPopover(false)}
                            className="px-2 py-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-blue-500 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>

                        <RoomBookingCalendar
                          roomId={resRoomId}
                          bookings={bookings}
                          checkInDate={resCheckIn}
                          checkOutDate={resCheckOut}
                          onDatesChange={(inDate, outDate) => {
                            let finalIn = inDate;
                            let finalOut = outDate;
                            
                            if (inDate) {
                              finalIn = `${inDate.split('T')[0]}T${globalCheckInTime}`;
                            }
                            if (outDate) {
                              finalOut = `${outDate.split('T')[0]}T${globalCheckOutTime}`;
                            }

                            setResCheckIn(finalIn);
                            setResCheckOut(finalOut);
                          }}
                          isDarkMode={isDarkMode}
                        />

                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 font-bold flex items-center gap-1">
                              Check-In Time <span className="text-zinc-400 dark:text-zinc-550">(Locked)</span>
                            </label>
                            <input
                              type="time"
                              disabled={true}
                              value={globalCheckInTime}
                              className={`block w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none transition-colors border opacity-60 cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-zinc-950 border-zinc-850 text-zinc-400' 
                                  : 'bg-slate-100 border-slate-200 text-slate-500 shadow-xs'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 font-bold flex items-center gap-1">
                              Check-Out Time <span className="text-zinc-400 dark:text-zinc-550">(Locked)</span>
                            </label>
                            <input
                              type="time"
                              disabled={true}
                              value={globalCheckOutTime}
                              className={`block w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none transition-colors border opacity-60 cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-zinc-950 border-zinc-850 text-zinc-400' 
                                  : 'bg-slate-100 border-slate-200 text-slate-500 shadow-xs'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Payment Status
                  </label>
                  <select
                    value={resPayment}
                    onChange={(e) => setResPayment(e.target.value as any)}
                    className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                  >
                    <option value="Paid">Paid In Full</option>
                    <option value="Partial">Partial Deposit Paid</option>
                    <option value="Split">Split Payment (Cash + Momo)</option>
                    <option value="Unpaid">Unpaid / Cash on Checkout</option>
                  </select>

                  {(resPayment as string) === 'Split' && (
                    <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                            Cash Amount (GH₵)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={splitCashAmount || ''}
                            onChange={(e) => setSplitCashAmount(Number(e.target.value))}
                            placeholder="0.00"
                            className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold mb-1">
                            Mobile Money (GH₵)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={splitMomoAmount || ''}
                            onChange={(e) => setSplitMomoAmount(Number(e.target.value))}
                            placeholder="0.00"
                            className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                          />
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        Total Split Paid: GH₵{(splitCashAmount + splitMomoAmount).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {resPayment !== 'Unpaid' && (resPayment as string) !== 'Split' && (
                    <div className="mt-3">
                      <label className={`block text-xs font-mono uppercase tracking-wider mb-1.5 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Payment Method *
                      </label>
                      <select
                        value={resPaymentMethod}
                        onChange={(e) => setResPaymentMethod(e.target.value as any)}
                        className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                      >
                        <option value="Cash">Cash (Physical Cash)</option>
                        <option value="Mobile Money">Mobile Money (Momo)</option>
                      </select>
                    </div>
                  )}
                </div>

                {resError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono">
                    ⚠ {resError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickCheckInModal(false)}
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
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" /> Initialize
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- GUEST PROFILE QUICK-VIEW MODAL --- */}
      <AnimatePresence>
        {showGuestModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => setShowGuestModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <UserCheck className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Guest Profile
                </h3>
              </div>

              {(() => {
                const allBookings = getBookings().filter(b => b.guestName === selectedGuestName);
                const latestContact = allBookings.length > 0 ? allBookings[0].guestContact : 'Unknown';
                const totalStays = allBookings.length;
                const lifetimeSpend = allBookings.reduce((sum, b) => sum + b.totalPrice, 0);

                return (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-slate-50 border-slate-200'}`}>
                      <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>{selectedGuestName}</h4>
                      <p className={`text-xs font-mono mb-3 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>{latestContact}</p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className={`block text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Lifetime Stays</span>
                          <span className={`block text-lg font-bold font-mono ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>{totalStays}</span>
                        </div>
                        <div>
                          <span className={`block text-[10px] font-mono uppercase ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Lifetime Spend</span>
                          <span className={`block text-lg font-bold font-mono text-emerald-500`}>GH₵{lifetimeSpend.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className={`text-xs font-mono uppercase tracking-widest mb-2 font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Multi-Lodge History
                      </h4>
                      <div className="space-y-2">
                        {allBookings.map((b, idx) => (
                          <div key={`${b.id}-${idx}`} className={`p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-white border-slate-100 shadow-xs'}`}>
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${b.branch === 'Annex' ? 'bg-blue-500/10 text-blue-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                  {b.branch}
                                </span>
                                <span className={`text-xs font-bold ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>Room {b.roomNumber}</span>
                              </div>
                              <div className={`text-[10px] font-mono ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                                {b.checkInDate && typeof b.checkInDate === 'string' ? b.checkInDate.split('T')[0] : 'N/A'} - {b.checkOutDate && typeof b.checkOutDate === 'string' ? b.checkOutDate.split('T')[0] : 'N/A'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`block text-xs font-bold font-mono ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>GH₵{b.totalPrice.toFixed(2)}</span>
                              <span className={`text-[9px] font-bold font-mono uppercase ${b.status === 'CheckedOut' ? 'text-emerald-500' : b.status === 'CheckedIn' ? 'text-blue-500' : 'text-red-500'}`}>{b.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MAINTENANCE REPORT MODAL --- */}
      <AnimatePresence>
        {showMaintenanceModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => setShowMaintenanceModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className={`flex items-center gap-2 mb-1.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                <Wrench className="w-5 h-5" />
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Maintenance Report
                </h3>
              </div>
              <p className={`text-xs mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Rooms currently marked as "Under Maintenance" and their reported issues.
              </p>

              {rooms.filter(r => r.status === 'Maintenance').length === 0 ? (
                <div className={`border rounded-2xl p-8 flex flex-col items-center justify-center text-center ${isDarkMode ? 'bg-zinc-950/50 border-zinc-800/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-slate-300 shadow-sm'}`}>
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h4 className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>All Clear</h4>
                  <p className={`text-xs max-w-[250px] ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>There are currently no rooms under maintenance. Everything is fully operational.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rooms.filter(r => r.status === 'Maintenance').map(room => (
                    <div key={room.id} className={`border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${isDarkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-mono font-bold text-lg shrink-0 ${isDarkMode ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                          {room.roomNumber}
                        </div>
                        <div>
                          <div className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Room {room.roomNumber} ({room.roomType})</div>
                          <div className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            Reported Issue: {room.description && room.description !== '' ? room.description : 'Pending inspection. General maintenance block applied.'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => handleUpdateRoomStatus(room, 'Available')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${isDarkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                        >
                          Mark Available
                        </button>
                        <button 
                          onClick={() => handleUpdateRoomStatus(room, 'Cleaning')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${isDarkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
                        >
                          Send to Cleaning
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- HISTORY SECURE PIN MODAL --- */}
      <AnimatePresence>
        {showHistoryPinModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl relative ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => {
                  setShowHistoryPinModal(false);
                  setPinError('');
                  setHistoryPinInput('');
                }}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
                  isDarkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <h2 className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Manager / Receptionist PIN Required
                </h2>
                <p className={`text-xs mb-6 px-2 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Booking history contains sensitive guest information. Enter authorized PIN to view.
                </p>

                <input
                  type="password"
                  autoFocus
                  placeholder="Enter 4-digit PIN (e.g. 1234)"
                  value={historyPinInput}
                  onChange={(e) => {
                    setHistoryPinInput(e.target.value);
                    setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // simple hardcoded pin for demonstration, matching original app behavior for similar things if needed
                      // In a real app this would be checked against user profile
                      if (historyPinInput === '1234' || historyPinInput === '0000') {
                        setIsHistoryUnlocked(true);
                        setShowHistoryPinModal(false);
                        setActiveTab('history');
                        setHistoryPinInput('');
                      } else {
                        setPinError('Invalid PIN entered.');
                      }
                    }
                  }}
                  className={`w-full text-center tracking-[0.5em] font-mono text-xl py-3 px-4 rounded-xl mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                    isDarkMode ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  } border`}
                  maxLength={6}
                />
                
                {pinError && (
                  <p className="text-red-500 text-xs font-bold mb-4">{pinError}</p>
                )}

                <div className="w-full flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setShowHistoryPinModal(false);
                      setPinError('');
                      setHistoryPinInput('');
                    }}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isDarkMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (historyPinInput === '1234' || historyPinInput === '0000') {
                        setIsHistoryUnlocked(true);
                        setShowHistoryPinModal(false);
                        setActiveTab('history');
                        setHistoryPinInput('');
                      } else {
                        setPinError('Invalid PIN entered.');
                      }
                    }}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20`}
                  >
                    Unlock History
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
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
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
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Mandatory Shift Handover
                </h3>
              </div>
              
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Direct sign out is locked. You must complete your shift audit and handover before signing out (even if collections are GH₵0.00).
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
                    handleOpenHandoverModal();
                  }}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-purple-500/20 flex items-center justify-center gap-1.5"
                >
                  <Shield className="w-4 h-4" />
                  Proceed to Handover
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- HANDOVER MODAL --- */}
      <AnimatePresence>
        {showHandoverModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh] ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <button
                onClick={() => setShowHandoverModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Shift Handover Protocol
                </h3>
              </div>

              <p className={`text-xs mb-4 flex-shrink-0 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Verify and log the exact amounts collected during your shift before handing over the funds to the manager. Completing this will log the handover and sign you out of your shift.
              </p>

              <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Handed Over Cash (GH₵)
                  </label>
                  <input
                    type="number"
                    value={handoverCashInput}
                    onChange={(e) => setHandoverCashInput(e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-xl font-mono border transition-all ${
                      isDarkMode 
                        ? 'bg-zinc-950 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                        : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                    }`}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Handed Over Mobile Money (GH₵)
                  </label>
                  <input
                    type="number"
                    value={handoverMomoInput}
                    onChange={(e) => setHandoverMomoInput(e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-xl font-mono border transition-all ${
                      isDarkMode 
                        ? 'bg-zinc-950 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                        : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                    }`}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div className={`p-3 rounded-2xl border border-dashed ${
                  isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/50 border-amber-200'
                }`}>
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className={isDarkMode ? 'text-zinc-300' : 'text-slate-700'}>Calculated Total Handover:</span>
                    <span className="font-mono text-sm text-amber-500">
                      GH₵ {((parseFloat(handoverCashInput) || 0) + (parseFloat(handoverMomoInput) || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Handover Notes (Optional)
                  </label>
                  <textarea
                    value={handoverNotes}
                    onChange={(e) => setHandoverNotes(e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition-all ${
                      isDarkMode 
                        ? 'bg-zinc-950 border-zinc-800 text-white focus:border-amber-500 focus:outline-none' 
                        : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-amber-500 focus:outline-none'
                    }`}
                    placeholder="e.g. All cash matches exactly. Handed over to morning team."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
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
                  onClick={handleCompleteShiftHandover}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-amber-500/20"
                >
                  Submit & End Shift
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- WALK-IN ACTIVITY BILLING MODAL --- */}
      <AnimatePresence>
        {showWalkInModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin scroll-smooth ${
                theme.tableContainer
              }`}
            >
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-1">
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  <Receipt className="w-5 h-5" />
                </div>
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Walk-In Activity Billing
                </h3>
              </div>
              <p className={`text-xs mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Fast-track billing console for non-resident activities. All charges are flat and tax-exempt.
              </p>

              <form onSubmit={handleSaveWalkIn} className="space-y-6 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Guest Full Name */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Guest Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={walkInGuestName}
                      onChange={(e) => setWalkInGuestName(e.target.value)}
                      placeholder="e.g. John Mahama"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  {/* Guest Phone Number */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Guest Phone Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={walkInGuestPhone}
                      onChange={(e) => setWalkInGuestPhone(e.target.value)}
                      placeholder="e.g. +233..."
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${theme.input}`}
                    />
                  </div>

                  {/* Service / Activity selection */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Service / Activity *
                    </label>
                    <select
                      value={walkInServiceType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWalkInServiceType(val);
                        // find item in catalog
                        const matched = activityCatalog.find(item => item.name === val);
                        if (matched) {
                          setWalkInTotalCharged(matched.price.toString());
                          if (walkInPaymentStatus === 'Paid') {
                            setWalkInAmountPaid(matched.price.toString());
                          } else {
                            setWalkInAmountPaid((matched.price / 2).toString());
                          }
                        } else {
                          // Fallback pricing if catalog item not found
                          if (val === 'Photography Session') {
                            setWalkInTotalCharged('200');
                            setWalkInAmountPaid(walkInPaymentStatus === 'Paid' ? '200' : '100');
                          } else if (val === 'Pool Pass Daily') {
                            setWalkInTotalCharged('50');
                            setWalkInAmountPaid(walkInPaymentStatus === 'Paid' ? '50' : '25');
                          } else if (val === 'Events Space Daily') {
                            setWalkInTotalCharged('500');
                            setWalkInAmountPaid(walkInPaymentStatus === 'Paid' ? '500' : '250');
                          } else {
                            setWalkInTotalCharged('100');
                            setWalkInAmountPaid(walkInPaymentStatus === 'Paid' ? '100' : '50');
                          }
                        }
                      }}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border cursor-pointer ${theme.input}`}
                    >
                      {activityCatalog.length > 0 ? (
                        activityCatalog.map((item) => (
                          <option key={item.id || item.name} value={item.name}>
                            {item.name} (₵{item.price.toFixed(2)})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Photography Session">Photography Session (₵200)</option>
                          <option value="Pool Pass Daily">Pool Pass Daily (₵50)</option>
                          <option value="Events Space Daily">Events Space Daily (₵500)</option>
                          <option value="Auxiliary Services">Auxiliary Services (₵100)</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Payment Method *
                    </label>
                    <select
                      value={walkInPaymentMethod}
                      onChange={(e) => setWalkInPaymentMethod(e.target.value as 'Cash' | 'Mobile Money')}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border cursor-pointer ${theme.input}`}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Mobile Money">Mobile Money</option>
                    </select>
                  </div>

                  {/* Payment Status */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Payment Status *
                    </label>
                    <select
                      value={walkInPaymentStatus}
                      onChange={(e) => {
                        const val = e.target.value as 'Paid' | 'Partial';
                        setWalkInPaymentStatus(val);
                        if (val === 'Paid') {
                          setWalkInAmountPaid(walkInTotalCharged);
                        } else {
                          setWalkInAmountPaid((Number(walkInTotalCharged) / 2).toString());
                        }
                      }}
                      className={`block w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border cursor-pointer ${theme.input}`}
                    >
                      <option value="Paid">Fully Paid</option>
                      <option value="Partial">Partial Deposit</option>
                    </select>
                  </div>

                  {/* Total Price (GH₵) */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Total Price (GH₵) [Catalog Standard Price]
                    </label>
                    <input
                      type="number"
                      required
                      disabled
                      readOnly
                      value={walkInTotalCharged}
                      placeholder="200"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors opacity-60 bg-zinc-100 dark:bg-zinc-800 ${theme.input}`}
                    />
                  </div>

                  {/* Amount Paid (GH₵) */}
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Amount Paid (GH₵) [Catalog Standard Price]
                    </label>
                    <input
                      type="number"
                      required
                      disabled
                      readOnly
                      value={walkInAmountPaid}
                      placeholder="200"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors opacity-60 bg-zinc-100 dark:bg-zinc-800 ${theme.input}`}
                    />
                  </div>
                </div>

                <div className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 py-2.5 rounded-lg text-center dark:bg-zinc-900/40 dark:border-zinc-800">
                  All charges are flat and tax-exempt
                </div>

                {walkInError && (
                  <div className="p-3 bg-red-950/40 border border-red-900 text-xs text-red-400 rounded-xl font-mono whitespace-pre-line">
                    ⚠ {walkInError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowWalkInModal(false)}
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
                    disabled={isSavingWalkIn}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isSavingWalkIn ? 'Saving Entry...' : 'Process Transaction'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Walk-In Activity Invoice & Receipt Modal */}
      {showWalkInReceiptModal && walkInReceiptData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={`border rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto ${
              theme.tableContainer
            }`}
          >
            <button
              type="button"
              onClick={() => setShowWalkInReceiptModal(false)}
              className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            <div
              id="walkin-invoice-card"
              className={`p-6 md:p-8 rounded-2xl border shadow-xl relative ${
                isDarkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <div className="flex items-start justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <table style={{ width: '100%', marginBottom: '16px', border: 'none', tableLayout: 'fixed' }} className="logo-header-row">
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h2 className="text-xl font-black tracking-tight text-blue-600 dark:text-blue-400" style={{ margin: 0 }}>NABSLODGE</h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mt-0.5">
                      Walk-In Activity Revenue Invoice & Receipt
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold block text-amber-500">
                    {walkInReceiptData.serialNumber || 'ACT-2026'}
                  </span>
                  <span className="text-[10px] text-zinc-400 block">{walkInReceiptData.timestamp}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 py-6 border-b border-zinc-200 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">Guest Details</span>
                  <p className="font-bold text-sm">{walkInReceiptData.guestName}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">Phone: {walkInReceiptData.guestPhone || 'N/A'}</p>
                  {walkInReceiptData.guestEmail && (
                    <p className="text-zinc-500 dark:text-zinc-400">Email: {walkInReceiptData.guestEmail}</p>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">Processed By</span>
                  <p className="font-bold text-sm">{walkInReceiptData.receptionistName}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">Branch: {walkInReceiptData.lodgeBranch || walkInReceiptData.branch}</p>
                  <p className="text-emerald-500 font-bold mt-1">Status: {walkInReceiptData.paymentStatus}</p>
                </div>
              </div>

              <div className="py-6 space-y-4">
                <h4 className="text-xs font-mono uppercase tracking-wider font-bold">Itemized Breakdown</h4>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${isDarkMode ? 'border-zinc-800 text-zinc-400' : 'border-slate-200 text-slate-500'}`}>
                      <th className="pb-2">Activity / Service Item</th>
                      <th className="pb-2 text-center">Payment Method</th>
                      <th className="pb-2 text-right">Total (GH₵)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <tr>
                      <td className="py-3 font-medium">{walkInReceiptData.serviceType}</td>
                      <td className="py-3 text-center">{walkInReceiptData.paymentMethod || 'Cash'}</td>
                      <td className="py-3 text-right font-mono font-bold">
                        GH₵ {Number(walkInReceiptData.amountPaid || walkInReceiptData.totalPrice).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={`p-4 rounded-2xl flex items-center justify-between border ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-xs font-bold uppercase tracking-wider">Total Amount Paid</span>
                <span className="text-xl font-mono font-black text-emerald-500">
                  GH₵ {Number(walkInReceiptData.amountPaid || walkInReceiptData.totalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Developer Credit */}
              <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                  Web app developed by SUALAH TELLEM (0553189032)
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={handlePrintWalkInReceipt}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-amber-500/20"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={handleDownloadWalkInPDF}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setShowWalkInReceiptModal(false)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  isDarkMode ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit / Rectify Booking Modal */}
      {showEditBookingModal && editingBookingTarget && (
        <EditBookingModal
          booking={editingBookingTarget}
          rooms={rooms}
          isDarkMode={isDarkMode}
          currentUser={currentUser}
          onClose={() => {
            setShowEditBookingModal(false);
            setEditingBookingTarget(null);
          }}
          onSuccess={() => {
            const updated = getBookings().filter(b => b.branch === branch);
            setBookings(updated);
          }}
        />
      )}

      {/* --- DRINK / BAR SALE RECORDING MODAL --- */}
      <AnimatePresence>
        {showDrinkOrderModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-3xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin ${
                theme.tableContainer
              }`}
            >
              <button
                type="button"
                onClick={() => setShowDrinkOrderModal(false)}
                className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all cursor-pointer ${
                  isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-1">
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                  <Wine className="w-5 h-5" />
                </div>
                <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Record Drink & Bar Sale
                </h3>
              </div>
              <p className={`text-xs mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Select a drink item, specify quantity, assign to a guest room or walk-in, and record instant payment.
              </p>

              <form onSubmit={handleProcessDrinkSale} className="space-y-4 text-xs">
                  {/* Order Items */}
                <div className={`space-y-3 p-3 rounded-xl border border-dashed ${isDarkMode ? 'border-zinc-700' : 'border-zinc-300'}`}>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1.5">
                      <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Add Drink Item
                      </label>
                      <select
                        value={selectedDrinkId}
                        onChange={(e) => setSelectedDrinkId(e.target.value)}
                        className={`block w-full px-3 py-2 rounded-lg text-xs font-medium focus:outline-none transition-colors border ${theme.input}`}
                      >
                        <option value="">-- Choose --</option>
                        {drinks.filter(d => d.inStock !== false).map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name} - GH₵{d.price.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20 space-y-1.5">
                      <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={drinkQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDrinkQty(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                        }}
                        className={`block w-full px-3 py-2 rounded-lg text-xs focus:outline-none transition-colors border ${theme.input}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  
                  {drinkCart.length > 0 && (
                    <div className={`space-y-2 mt-3 pt-3 border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                      {drinkCart.map((item, idx) => (
                        <div key={idx} className={`flex justify-between items-center p-2 rounded-lg ${isDarkMode ? 'bg-zinc-900/50' : 'bg-zinc-50'}`}>
                          <span className={`font-semibold ${isDarkMode ? 'text-zinc-300' : 'text-slate-700'}`}>{item.drinkName} (x{item.quantity})</span>
                          <div className="flex items-center gap-3">
                            <span className={`font-mono ${isDarkMode ? 'text-zinc-500' : 'text-slate-500'}`}>GH₵{item.subtotal.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => setDrinkCart(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className={`flex justify-between items-center font-bold pt-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        <span>Total:</span>
                        <span className="text-purple-600 dark:text-purple-400 text-sm">
                          GH₵{drinkCart.reduce((s, i) => s + i.subtotal, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Select Existing Checked-In Guest / Booking */}
                <div className="space-y-1.5">
                  <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Link to Checked-In Guest / Booking (Optional)
                  </label>
                  <select
                    value={drinkBookingId}
                    onChange={(e) => {
                      const bId = e.target.value;
                      setDrinkBookingId(bId);
                      const bookingObj = bookings.find(b => b.id === bId);
                      if (bookingObj) {
                        setDrinkRoomNumber(bookingObj.roomNumber);
                        setDrinkGuestName(bookingObj.guestName);
                      } else {
                        setDrinkRoomNumber('');
                        setDrinkGuestName('');
                      }
                    }}
                    className={`block w-full px-3.5 py-2.5 rounded-xl text-xs font-medium focus:outline-none transition-colors border ${theme.input}`}
                  >
                    <option value="">-- None (Walk-in or Manual Room) --</option>
                    {bookings.filter(b => b.status === 'CheckedIn' && b.branch === branch).map(b => (
                      <option key={b.id} value={b.id}>
                        Room {b.roomNumber} - {b.guestName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Guest & Room Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Guest Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={drinkGuestName}
                      onChange={(e) => setDrinkGuestName(e.target.value)}
                      placeholder="e.g. Kwame Mensah"
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors border ${theme.input}`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Room Number (Optional)
                    </label>
                    <select
                      value={drinkRoomNumber}
                      onChange={(e) => {
                        setDrinkRoomNumber(e.target.value);
                        // Auto prefill guest name if selecting checked-in room
                        const roomObj = rooms.find(r => r.roomNumber === e.target.value);
                        if (roomObj && roomObj.guestName) {
                          setDrinkGuestName(roomObj.guestName);
                        }
                      }}
                      className={`block w-full px-3.5 py-2.5 rounded-xl text-xs font-medium focus:outline-none transition-colors border ${theme.input}`}
                    >
                      <option value="">-- Non-Resident / Walk-In --</option>
                      {dynamicRooms.filter(r => r.status === 'Occupied' || r.guestName).map(r => (
                        <option key={r.roomNumber} value={r.roomNumber}>
                          Room {r.roomNumber} ({r.guestName || 'Occupied'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <label className={`block text-[10px] font-mono uppercase tracking-wider font-bold ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Payment Method *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDrinkPaymentMethod('Cash')}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        drinkPaymentMethod === 'Cash'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600')
                      }`}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrinkPaymentMethod('Mobile Money')}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        drinkPaymentMethod === 'Mobile Money'
                          ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                          : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600')
                      }`}
                    >
                      MoMo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrinkPaymentMethod('Split (Cash + Momo)');
                        const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                        setDrinkSplitCashAmount(total);
                        setDrinkSplitMomoAmount(0);
                      }}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        drinkPaymentMethod === 'Split (Cash + Momo)'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600')
                      }`}
                    >
                      Split Cash+MoMo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrinkPaymentMethod('Unpaid (Add to Room Bill)')}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        drinkPaymentMethod === 'Unpaid (Add to Room Bill)'
                          ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                          : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600')
                      }`}
                    >
                      Unpaid (Room Bill)
                    </button>
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDrinkPaymentMethod('Split (Paid & Unpaid)');
                        const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                        setDrinkSplitPaidAmount(total);
                        setDrinkSplitUnpaidAmount(0);
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        drinkPaymentMethod === 'Split (Paid & Unpaid)'
                          ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                          : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600')
                      }`}
                    >
                      Split (Paid & Unpaid / Room Bill)
                    </button>
                  </div>

                  {drinkPaymentMethod === 'Split (Cash + Momo)' && (
                    <div className={`grid grid-cols-2 gap-3 mt-3 p-3 rounded-xl border ${isDarkMode ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'}`}>
                      <div className="flex flex-col justify-end">
                        <label className={`block text-[10px] font-mono mb-1 leading-tight ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Cash Amount (GH₵)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={drinkSplitCashAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setDrinkSplitCashAmount(val);
                            const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                            setDrinkSplitMomoAmount(Math.max(0, total - val));
                          }}
                          className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <label className={`block text-[10px] font-mono mb-1 leading-tight ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>MoMo Amount (GH₵)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={drinkSplitMomoAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setDrinkSplitMomoAmount(val);
                            const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                            setDrinkSplitCashAmount(Math.max(0, total - val));
                          }}
                          className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                        />
                      </div>
                    </div>
                  )}

                  {drinkPaymentMethod === 'Split (Paid & Unpaid)' && (
                    <div className={`mt-3 p-3.5 rounded-xl border space-y-3 ${isDarkMode ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50 border-purple-100'}`}>
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-purple-200/40 dark:border-purple-800/30">
                        <span className={`text-[11px] font-bold ${isDarkMode ? 'text-purple-300' : 'text-purple-900'}`}>
                          Payment Method for Paid Portion:
                        </span>
                        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 dark:bg-zinc-800 border border-slate-300/80 dark:border-zinc-700">
                          <button
                            type="button"
                            onClick={() => setDrinkSplitPaidMethod('Cash')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              drinkSplitPaidMethod === 'Cash'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            💵 Cash
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrinkSplitPaidMethod('Mobile Money')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              drinkSplitPaidMethod === 'Mobile Money'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            📱 MoMo
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col justify-end">
                          <label className={`block text-[10px] font-mono mb-1 leading-tight ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            Paid Amount ({drinkSplitPaidMethod}) (GH₵)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={drinkSplitPaidAmount}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setDrinkSplitPaidAmount(val);
                              const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                              setDrinkSplitUnpaidAmount(Math.max(0, total - val));
                            }}
                            className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <label className={`block text-[10px] font-mono mb-1 leading-tight ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            Unpaid / Room Bill (GH₵)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={drinkSplitUnpaidAmount}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setDrinkSplitUnpaidAmount(val);
                              const total = drinkCart.reduce((sum, item) => sum + item.subtotal, 0);
                              setDrinkSplitPaidAmount(Math.max(0, total - val));
                            }}
                            className={`block w-full px-3 py-2 rounded-lg text-xs border ${theme.input}`}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDrinkOrderModal(false)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessingDrinkSale || drinkCart.length === 0}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-purple-600/20 flex items-center gap-2"
                  >
                    <Wine className="w-4 h-4" />
                    Record Sale (GH₵ {drinkCart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)})
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      </AnimatePresence>

      {/* --- EDIT DRINK SALE MODAL --- */}
      <AnimatePresence mode="wait">
        {showEditDrinkSaleModal && saleToEdit && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm"
            onClick={() => setShowEditDrinkSaleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative ${theme.tableContainer} max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent cursor-default`}
            >
              <div className="absolute top-5 right-5 flex items-center gap-2">
                <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-700/50">
                  <button
                    type="button"
                    disabled={!hasPrevSale}
                    onClick={() => handleOpenEditDrinkSale(activeShiftDrinkSales[currentSaleIndex + 1])}
                    className={`p-1.5 rounded-md transition-all ${hasPrevSale ? 'hover:bg-zinc-700 text-zinc-300' : 'text-zinc-600 opacity-30 cursor-not-allowed'}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="w-[1px] h-3 bg-zinc-700 mx-1" />
                  <button
                    type="button"
                    disabled={!hasNextSale}
                    onClick={() => handleOpenEditDrinkSale(activeShiftDrinkSales[currentSaleIndex - 1])}
                    className={`p-1.5 rounded-md transition-all ${hasNextSale ? 'hover:bg-zinc-700 text-zinc-300' : 'text-zinc-600 opacity-30 cursor-not-allowed'}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEditDrinkSaleModal(false)}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    isDarkMode ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-slate-100 text-slate-500'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-6 select-none cursor-grab active:cursor-grabbing">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Edit Drink Sale
                  </h3>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">
                    {saleToEdit.serialNumber || saleToEdit.id.slice(0, 8)} • {currentSaleIndex + 1} of {activeShiftDrinkSales.length}
                  </p>
                </div>
              </div>

              <form onSubmit={handleEditDrinkSaleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    Drink Item
                  </label>
                  <select
                    value={editDrinkSaleDrinkId}
                    onChange={(e) => setEditDrinkSaleDrinkId(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${theme.input}`}
                  >
                    <option value="">-- Select Drink --</option>
                    {drinks.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} (GH₵ {d.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={editDrinkSaleQty}
                      onChange={(e) => setEditDrinkSaleQty(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${theme.input}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                      Unit Price
                    </label>
                    <div className={`px-3 py-2 rounded-xl border text-xs ${isDarkMode ? 'bg-zinc-900/50 border-zinc-800 text-zinc-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                      GH₵ {(saleToEdit.unitPrice || (saleToEdit.items?.[0]?.unitPrice) || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    Guest Name
                  </label>
                  <input
                    type="text"
                    value={editDrinkSaleGuestName}
                    onChange={(e) => setEditDrinkSaleGuestName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${theme.input}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    Room Number
                  </label>
                  <select
                    value={editDrinkSaleRoomNumber}
                    onChange={(e) => setEditDrinkSaleRoomNumber(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${theme.input}`}
                  >
                    <option value="">-- Non-Resident / Walk-In --</option>
                    {dynamicRooms.filter(r => r.status === 'Occupied').map(r => (
                      <option key={r.roomNumber} value={r.roomNumber}>
                        Room {r.roomNumber} ({r.guestName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                    Payment Method
                  </label>
                  <select
                    value={editDrinkSalePaymentMethod}
                    onChange={(e) => setEditDrinkSalePaymentMethod(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${theme.input}`}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Split (Cash + Momo)">Split (Cash + Momo)</option>
                    <option value="Unpaid (Add to Room Bill)">Unpaid (Add to Room Bill)</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-zinc-800/50 flex justify-between items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">New Total</span>
                    <span className="text-sm font-black text-purple-400 font-mono">
                      GH₵ {( (Number(editDrinkSaleQty) || 0) * (saleToEdit.unitPrice || (saleToEdit.items?.[0]?.unitPrice) || 0) ).toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessingEditSale}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    {isProcessingEditSale ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- DELETE SALE CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {showDeleteSaleConfirm && saleToDelete && (
          <div 
            className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[70] backdrop-blur-md overflow-y-auto"
            onClick={() => setShowDeleteSaleConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className={`border rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center ${theme.tableContainer} relative`}
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Delete Sale?
              </h3>
              <p className={`text-sm mb-8 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Are you sure you want to permanently delete the sale for <strong className="text-zinc-300">{saleToDelete.items ? saleToDelete.items.map(i => i.drinkName).join(', ') : (saleToDelete.drinkName || 'Unknown Drink')}</strong>? This action will remove the revenue record and cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteSaleConfirm(false)}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600'} cursor-pointer active:scale-95`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDrinkSale}
                  disabled={isProcessingEditSale}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-rose-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isProcessingEditSale ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
