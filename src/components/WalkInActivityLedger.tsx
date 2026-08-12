import React, { useState, useEffect } from 'react';
import { NabsLodgeLogo } from './NabsLodgeLogo';
import { db } from '../firebase';
import { doc, setDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Zap, Plus, Search, Calendar, Filter, Printer, Download, Mail, CheckCircle2, User, Phone, DollarSign, Clock, Receipt } from 'lucide-react';
import { sendActivityInvoiceViaGmail, parseSafeDate } from '../utils/formatters';
import { useToast } from './ToastContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { EmptyState } from './EmptyState';
import { WalkInActivityInput } from '../types';

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

interface WalkInActivityLedgerProps {
  currentUser: {
    id: string;
    name: string;
    role: string;
    assignedBranch?: string;
    branch?: string;
  };
  isDarkMode: boolean;
  branch: string;
  activityCatalog: Array<{ id: string; name: string; price: number; description?: string }>;
  onOpenNewWalkInModal?: () => void;
  onOpenHandoverModal?: () => void;
}

export const WalkInActivityLedger: React.FC<WalkInActivityLedgerProps> = ({
  currentUser,
  isDarkMode,
  branch,
  activityCatalog,
  onOpenNewWalkInModal,
  onOpenHandoverModal
}) => {
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('nabslodge_activity_ledger');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [totalCharged, setTotalCharged] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Receipt / Invoice Modal states
  const [generatedReceipt, setGeneratedReceipt] = useState<any | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Manager Master Filters
  const [managerBranchFilter, setManagerBranchFilter] = useState('All');
  const [managerStaffFilter, setManagerStaffFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const isManager = (currentUser?.role || '').toLowerCase() === 'manager';
  const activeBranch = currentUser.assignedBranch || currentUser.branch || branch;

  useEffect(() => {
    if (activityCatalog.length > 0 && !selectedService) {
      setSelectedService(activityCatalog[0].name);
      setTotalCharged(activityCatalog[0].price.toString());
      setAmountPaid(activityCatalog[0].price.toString());
    }
  }, [activityCatalog]);

  // Real-time listener for ActivityLedger
  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    
    // Real-time listener for ActivityLedger
    const q = collection(db, 'ActivityLedger');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort descending by dateCreated / timestamp
      list.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.dateCreated || 0).getTime();
        const timeB = new Date(b.timestamp || b.dateCreated || 0).getTime();
        return timeB - timeA;
      });
      setTransactions(list);
      
      // Update local storage for redundancy
      try {
        localStorage.setItem('nabslodge_activity_ledger', JSON.stringify(list));
      } catch {}
      
      setLoading(false);
    }, (error) => {
      console.error("Ledger Subscription Error:", error);
      setErrorMsg("Failed to connect to real-time ledger.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleServiceChange = (serviceName: string) => {
    setSelectedService(serviceName);
    const found = activityCatalog.find(item => item.name === serviceName);
    if (found) {
      setTotalCharged(found.price.toString());
      setAmountPaid(found.price.toString());
    }
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      window.alert("Ledger Error: Please provide guest name.");
      return;
    }
    const totalNum = Number(totalCharged);
    const paidNum = Number(amountPaid);
    if (isNaN(totalNum) || isNaN(paidNum)) {
      window.alert("Ledger Error: Total charged and amount paid must be valid numbers.");
      return;
    }

    setIsSubmitting(true);
    try {
      const transactionId = `act_${Math.random().toString(36).substring(2, 11)}`;
      const serialNumber = `ACT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

      const payload: WalkInActivityInput = {
        id: transactionId,
        serialNumber,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || 'N/A',
        guestEmail: guestEmail.trim() || 'guest@nabslodge.com',
        serviceType: selectedService || 'Photoshoot Session',
        totalPrice: totalNum,
        amountPaid: paidNum,
        paymentMethod,
        paymentStatus,
        receptionistId: currentUser.id,
        receptionistName: currentUser.name,
        lodgeBranch: activeBranch,
        branch: branch,
        dateCreated: timestamp,
        timestamp: timestamp
      };

      // Save to local transactions state & localStorage first
      setTransactions((prev) => {
        const list = [payload, ...prev];
        try {
          localStorage.setItem('nabslodge_activity_ledger', JSON.stringify(list));
        } catch {}
        return list;
      });

      // Save to Firestore
      await setDoc(doc(db, 'ActivityLedger', transactionId), {
        ...payload,
        dateCreated: serverTimestamp(),
        timestamp: timestamp // Keep for backwards compatibility with local sort
      });

      // Generate invoice HTML for Gmail automation
      const invoiceHtml = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; max-width: 600px; margin: auto;">
          <h2>NABSLODGE - WALK-IN ACTIVITY RECEIPT</h2>
          <p><strong>Serial:</strong> ${serialNumber}</p>
          <p><strong>Guest:</strong> ${payload.guestName} (${payload.guestPhone})</p>
          <p><strong>Activity:</strong> ${payload.serviceType}</p>
          <p><strong>Total Paid:</strong> GH₵ ${paidNum.toFixed(2)} (${paymentMethod})</p>
          <p>Thank you for visiting Nabslodge!</p>
          <p style="font-size: 10px; color: #888;">Web app developed by SUALAH TELLEM (0553189032)</p>
        </div>
      `;

      sendActivityInvoiceViaGmail(payload.guestEmail, invoiceHtml);

      // Exact millisecond write resolves successfully: close modal, reset states completely
      setGeneratedReceipt(payload);
      setShowAddModal(false);
      setGuestName('');
      setGuestPhone('');
      setGuestEmail('');
      if (activityCatalog.length > 0) {
        setSelectedService(activityCatalog[0].name);
        setTotalCharged(activityCatalog[0].price.toString());
        setAmountPaid(activityCatalog[0].price.toString());
      }
      setPaymentMethod('Cash');
      setPaymentStatus('Paid');

      window.alert("Activity Logged and Invoice Generated Successfully!");
      setShowReceiptModal(true);
    } catch (err: any) {
      console.error("Activity logging failed:", err);
      // On error, abort state clearing and alert exact error
      window.alert(`Ledger Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtering transactions
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let filteredTransactions = transactions.filter((t) => {
    // If receptionist, restrict to assigned branch, today's date, and post-shift-reset
    if (!isManager) {
      const isMyUser = !t.receptionistId || t.receptionistId === currentUser.id || t.createdBy === currentUser.id || (t.receptionistName && t.receptionistName.toLowerCase() === currentUser.name.toLowerCase());
      
      const rawTs = t.timestamp || t.dateCreated || t.createdAt;
      const parsedDate = parseSafeDate(rawTs);

      let isToday = false;
      if (parsedDate) {
        isToday = (
          parsedDate.getFullYear() === now.getFullYear() &&
          parsedDate.getMonth() === now.getMonth() &&
          parsedDate.getDate() === now.getDate()
        );
      } else if (rawTs && typeof rawTs === 'string') {
        const tDateStr = rawTs.substring(0, 10);
        isToday = tDateStr === todayISO || tDateStr === todayLocal;
      }

      const shiftResetKey = `nabslodge_shift_reset_${currentUser.id}_${todayISO}`;
      const shiftResetTime = localStorage.getItem(shiftResetKey);
      let isAfterReset = true;
      if (shiftResetTime) {
        const resetTime = Number(shiftResetTime);
        if (resetTime > 0) {
          const tTime = parsedDate ? parsedDate.getTime() : new Date((rawTs || '').replace(' ', 'T')).getTime();
          if (!isNaN(tTime)) {
            isAfterReset = tTime > resetTime;
          }
        }
      }

      return isMyUser && isToday && isAfterReset;
    } else {
      // Manager master filters
      let matchBranch = true;
      if (managerBranchFilter !== 'All') {
        matchBranch = (t.lodgeBranch || '').toLowerCase() === managerBranchFilter.toLowerCase() || (t.branch || '').toLowerCase() === managerBranchFilter.toLowerCase();
      }
      let matchStaff = true;
      if (managerStaffFilter !== 'All') {
        matchStaff = t.receptionistId === managerStaffFilter || (t.receptionistName || '').toLowerCase().includes(managerStaffFilter.toLowerCase());
      }
      let matchSearch = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        matchSearch = (t.guestName || '').toLowerCase().includes(q) || (t.serviceType || '').toLowerCase().includes(q) || (t.serialNumber || '').toLowerCase().includes(q);
      }
      let matchDate = true;
      if (dateFilter) {
        const tDate = (t.timestamp || t.dateCreated || '').substring(0, 10);
        matchDate = tDate === dateFilter;
      }
      return matchBranch && matchStaff && matchSearch && matchDate;
    }
  });

  // Sort descending by dateCreated / timestamp
  filteredTransactions.sort((a, b) => {
    const timeA = new Date(a.timestamp || a.dateCreated || 0).getTime();
    const timeB = new Date(b.timestamp || b.dateCreated || 0).getTime();
    return timeB - timeA;
  });

  // Sum active shift revenue
  const activeShiftRevenue = filteredTransactions.reduce((acc, curr) => acc + Number(curr.amountPaid || curr.totalPrice || 0), 0);

  const handleDownloadPDF = async () => {
    const element = document.getElementById('walkin-receipt-card');
    addToast('Generating PDF Receipt...', 'info', 'Please wait while the receipt is generated.', 3000);

    if (element) {
      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: isDarkMode ? '#18181b' : '#ffffff'
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Activity_Receipt_${generatedReceipt?.serialNumber || 'Receipt'}.pdf`);
        addToast('Download Successful', 'success', 'PDF receipt downloaded.', 3000);
        return;
      } catch (err) {
        console.warn("Canvas PDF generation failed, using jsPDF text fallback:", err);
      }
    }

    try {
      const pdf = new jsPDF();
      pdf.setFontSize(20);
      pdf.text(cleanPdfText("NABSLODGE"), 14, 20);
      pdf.setFontSize(14);
      pdf.text(cleanPdfText(`ACTIVITY RECEIPT - ${generatedReceipt?.serialNumber || 'ACT-2026'}`), 14, 28);
      pdf.setLineWidth(0.5);
      pdf.line(14, 32, 196, 32);

      pdf.setFontSize(11);
      pdf.text(cleanPdfText(`Guest Name: ${generatedReceipt?.guestName || 'N/A'}`), 14, 42);
      pdf.text(cleanPdfText(`Phone: ${generatedReceipt?.guestPhone || 'N/A'}`), 14, 50);
      pdf.text(cleanPdfText(`Email: ${generatedReceipt?.guestEmail || 'N/A'}`), 14, 58);
      pdf.text(cleanPdfText(`Activity / Service: ${generatedReceipt?.serviceType || 'N/A'}`), 14, 66);
      pdf.text(cleanPdfText(`Payment Method: ${generatedReceipt?.paymentMethod || 'Cash'}`), 14, 74);
      pdf.text(cleanPdfText(`Status: ${generatedReceipt?.paymentStatus || 'Paid'}`), 14, 82);

      pdf.line(14, 90, 196, 90);
      pdf.setFontSize(12);
      pdf.text(cleanPdfText(`Total Amount Paid: GH₵ ${(generatedReceipt?.amountPaid || 0).toLocaleString()}`), 14, 102);

      pdf.setLineWidth(0.25);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, 112, 196, 112);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(cleanPdfText("Web app developed by SUALAH TELLEM (0553189032)"), 14, 120);

      pdf.save(`Activity_Receipt_${generatedReceipt?.serialNumber || 'Receipt'}.pdf`);
      addToast('Download Successful', 'success', 'PDF receipt downloaded.', 3000);
    } catch (e: any) {
      console.error("PDF fallback failed:", e);
      addToast('Download Failed', 'error', 'Could not generate PDF receipt.');
    }
  };

  const handlePrintReceipt = () => {
    const element = document.getElementById('walkin-receipt-card');
    if (!element) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Walk-In Receipt - ${generatedReceipt?.serialNumber || 'Receipt'}</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111; background: #fff; }
              .no-print, button { display: none !important; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 16px; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
              th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #666; }
              .flex { display: flex; }
              .flex-row { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 16px !important; }
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

  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${isDarkMode ? 'text-zinc-100' : 'text-slate-900'}`}>
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Walk-In Activity Ledger</h1>
              <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                {isManager ? 'Master audit history for all walk-in services and facility passes.' : `My Active Shift History & Today's Log (${activeBranch} Branch)`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isManager && (
            <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 font-mono text-xs font-bold ${
              isDarkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              My Active Shift Revenue: GH₵{activeShiftRevenue.toFixed(2)}
            </div>
          )}
          {!isManager && (
            <button
              onClick={() => {
                if (onOpenHandoverModal) {
                  onOpenHandoverModal();
                } else if (window.confirm("Complete shift handover and reset your active shift revenue to zero for the next staff member?")) {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const shiftResetKey = `nabslodge_shift_reset_${currentUser.id}_${todayStr}`;
                  const resetTime = Date.now();
                  localStorage.setItem(shiftResetKey, resetTime.toString());
                  setTransactions([...transactions]);
                  window.dispatchEvent(new Event('shiftHandoverCompleted'));
                  
                  // Save to Firestore users collection
                  setDoc(doc(db, 'users', currentUser.id), {
                    lastShiftReset: resetTime
                  }, { merge: true }).catch(err => console.error(err));

                  addToast('Shift Handover Completed', 'success', 'Active shift revenue reset to zero for handover.');
                }
              }}
              className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-amber-400 hover:bg-zinc-800' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
              title="Complete shift handover & reset revenue"
            >
              End Shift / Handover
            </button>
          )}
          {!isManager && (
            <button
              onClick={() => {
                if (onOpenNewWalkInModal) {
                  onOpenNewWalkInModal();
                } else {
                  setShowAddModal(true);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Walk-In Activity
            </button>
          )}
        </div>
      </div>

      {/* Manager Master Filters Grid */}
      {isManager && (
        <div className={`p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${isDarkMode ? 'bg-zinc-900/50 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
              Lodge Branch
            </label>
            <select
              value={managerBranchFilter}
              onChange={(e) => setManagerBranchFilter(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs border font-medium outline-none ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="All">All Branches</option>
              <option value="Annex">Nabslodge Annex</option>
              <option value="Ayigya">Nabslodge Ayigya</option>
            </select>
          </div>

          <div>
            <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
              Search Guest / Service
            </label>
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3 top-2.5 ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`} />
              <input
                type="text"
                placeholder="Guest name, serial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border font-medium outline-none ${
                  isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
              Date Filter
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs border font-medium outline-none ${
                isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setManagerBranchFilter('All');
                setManagerStaffFilter('All');
                setSearchQuery('');
                setDateFilter('');
              }}
              className={`w-full py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isDarkMode ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Transactions Data Table */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDarkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-200'}`}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDarkMode ? 'border-zinc-800 bg-zinc-900/60' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-mono uppercase tracking-wider font-bold">
              {isManager ? `Master Activity Records (${filteredTransactions.length})` : `My Active Shift History (${filteredTransactions.length})`}
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            Branch: {activeBranch}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400 animate-pulse">
            Loading walk-in activity records from secure ledger...
          </div>
        ) : errorMsg ? (
          <div className="p-6 text-center text-xs text-red-500">
            Error loading activity ledger: {errorMsg}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Zap className="w-5 h-5 text-zinc-400" />}
            title="No activity transactions recorded"
            description='Click "New Walk-In Activity" above to log a new service or facility pass.'
            isDarkMode={isDarkMode}
            actionLabel={!isManager ? "New Walk-In Activity" : undefined}
            onAction={!isManager ? () => {
              if (onOpenNewWalkInModal) {
                onOpenNewWalkInModal();
              } else {
                setShowAddModal(true);
              }
            } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b text-[10px] font-mono uppercase tracking-wider ${isDarkMode ? 'border-zinc-800 text-zinc-400 bg-zinc-900/20' : 'border-slate-200 text-slate-500 bg-slate-50/50'}`}>
                  <th className="p-3.5 pl-5">Serial / Time</th>
                  <th className="p-3.5">Guest Details</th>
                  <th className="p-3.5">Activity Type</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5 text-right">Amount Paid</th>
                  <th className="p-3.5 text-center pr-5">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id || Math.random()} className={`transition-colors ${isDarkMode ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50'}`}>
                    <td className="p-3.5 pl-5 font-mono">
                      <span className="font-bold text-blue-500 block">{tx.serialNumber || 'ACT-2026'}</span>
                      <span className="text-[10px] text-zinc-400">{tx.timestamp || tx.dateCreated}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-bold block">{tx.guestName}</span>
                      <span className="text-[10px] text-zinc-400">{tx.guestPhone} | {tx.guestEmail}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {tx.serviceType}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-medium">{tx.paymentMethod || 'Cash'}</span>
                      <span className={`block text-[10px] font-bold ${tx.paymentStatus === 'Paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {tx.paymentStatus || 'Paid'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-500 text-sm">
                      GH₵{(tx.amountPaid || tx.totalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-center pr-5">
                      <span className="font-medium text-xs">
                        {tx.receptionistName || tx.createdBy || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Walk-In Activity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${isDarkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDarkMode ? 'border-zinc-800 bg-zinc-900/80' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm">Log New Walk-In Activity</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-100 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              <div>
                <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Select Service / Activity *
                </label>
                <select
                  value={selectedService}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                    isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  required
                >
                  {activityCatalog.map((item) => (
                    <option key={item.id || Math.random()} value={item.name}>
                      {item.name} (GH₵ {item.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Guest Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ama Serwaa"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0241234567"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Guest Email (for digital receipt dispatch)
                </label>
                <input
                  type="email"
                  placeholder="guest@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                    isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Total Charged (GH₵) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={totalCharged}
                    disabled
                    readOnly
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none opacity-70 ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Amount Paid (GH₵) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amountPaid}
                    disabled
                    readOnly
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none opacity-70 ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Mobile Money">Mobile Money (MoMo)</option>
                    <option value="POS Card">POS Card</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border font-medium outline-none ${
                      isDarkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="Paid">Paid in Full</option>
                    <option value="Partial">Partial Deposit</option>
                  </select>
                </div>
              </div>

              </div>

              <div className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isDarkMode ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Logging & Dispatching...' : 'Save & Dispatch Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Receipt/Invoice Modal (Mirrors primary room booking invoice template) */}
      {showReceiptModal && generatedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl my-8">
            <div
              id="walkin-receipt-card"
              className={`p-8 rounded-3xl border shadow-2xl relative ${
                isDarkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <div className="flex items-start justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <table style={{ border: 'none', marginBottom: '16px' }}>
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h2 className="text-lg font-black tracking-tight text-blue-600 dark:text-blue-400" style={{ margin: 0 }}>NABS LODGE</h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mt-0.5">
                      Walk-In Activity Revenue Invoice & Receipt
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold block text-amber-500">{generatedReceipt.serialNumber}</span>
                  <span className="text-[10px] text-zinc-400 block">{generatedReceipt.timestamp}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 py-6 border-b border-zinc-200 dark:border-zinc-800 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">Guest Details</span>
                  <p className="font-bold text-sm">{generatedReceipt.guestName}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">{generatedReceipt.guestPhone}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">{generatedReceipt.guestEmail}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">Processed By</span>
                  <p className="font-bold text-sm">{generatedReceipt.receptionistName}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">Branch: {generatedReceipt.lodgeBranch}</p>
                  <p className="text-emerald-500 font-bold mt-1">Status: {generatedReceipt.paymentStatus}</p>
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
                      <td className="py-3 font-medium">{generatedReceipt.serviceType}</td>
                      <td className="py-3 text-center">{generatedReceipt.paymentMethod}</td>
                      <td className="py-3 text-right font-mono font-bold">GH₵ {Number(generatedReceipt.amountPaid || generatedReceipt.totalPrice).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={`p-4 rounded-2xl flex items-center justify-between border ${isDarkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-xs font-bold uppercase tracking-wider">Total Amount Paid</span>
                <span className="text-xl font-mono font-black text-emerald-500">
                  GH₵ {Number(generatedReceipt.amountPaid || generatedReceipt.totalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Developer Credit Signature */}
              <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                  Web app developed by SUALAH TELLEM (0553189032)
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 print:hidden">
                <button
                  onClick={handlePrintReceipt}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Printer className="w-4 h-4" />
                  Print Receipt
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <Download className="w-4 h-4" />
                  Download PDF Receipt
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    isDarkMode ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300' : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Engineering Signature */}
      <div className="pt-8 pb-4 text-center border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          Web app developed by SUALAH TELLEM (0553189032)
        </p>
      </div>
    </div>
  );
};
