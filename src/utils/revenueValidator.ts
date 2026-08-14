export interface RevenueAnomaly {
  id: string;
  severity: 'high' | 'medium';
  title: string;
  description: string;
  bookingId?: string;
}

export const validateRevenueIntegrity = (
  bookings: any[],
  roomRevenue: any[],
  drinkSales: any[]
): RevenueAnomaly[] => {
  const anomalies: RevenueAnomaly[] = [];

  // Group room revenue by booking ID
  const revenueByBooking: Record<string, any[]> = {};
  roomRevenue.forEach(r => {
    if (r.bookingId) {
      if (!revenueByBooking[r.bookingId]) revenueByBooking[r.bookingId] = [];
      revenueByBooking[r.bookingId].push(r);
    }
  });

  // Group drink sales by booking ID
  const drinksByBooking: Record<string, any[]> = {};
  drinkSales.forEach(d => {
    if (d.bookingId) {
      if (!drinksByBooking[d.bookingId]) drinksByBooking[d.bookingId] = [];
      drinksByBooking[d.bookingId].push(d);
    }
  });

  // 1. Check for Identical Twins (Duplicate double-clicks)
  roomRevenue.forEach((r1, index1) => {
    roomRevenue.forEach((r2, index2) => {
      if (index1 >= index2) return; // avoid double counting self
      if (r1.bookingId === r2.bookingId && r1.revenueType === r2.revenueType && r1.amount === r2.amount && r1.amount > 0) {
        // Check time difference
        const t1 = new Date(r1.timestamp || r1.dateCreated || r1.createdAt).getTime();
        const t2 = new Date(r2.timestamp || r2.dateCreated || r2.createdAt).getTime();
        if (!isNaN(t1) && !isNaN(t2)) {
          const diffSecs = Math.abs(t1 - t2) / 1000;
          if (diffSecs <= 60 && r1.receptionistId === r2.receptionistId) {
             const b = bookings.find(b => b.id === r1.bookingId);
             const safeName = b?.guestName || 'Unknown';
             anomalies.push({
               id: `dup-${r1.id}-${r2.id}`,
               severity: 'high',
               title: 'Potential Duplicate Payment (Double-Click)',
               description: `Booking #${r1.bookingId.slice(-6)} (Guest: ${safeName}) has two identical "${r1.revenueType || 'Payment'}" receipts for GH₵${r1.amount} logged ${Math.round(diffSecs)} seconds apart by ${r1.receptionistName || 'the same receptionist'}. Please review and void the duplicate if it was accidental.`,
               bookingId: r1.bookingId
             });
          }
        }
      }
    });
  });

  // 2. Overpaid Room Rule & Drink Settlement Overlap
  bookings.forEach(b => {
    const revs = revenueByBooking[b.id] || [];
    const drinks = drinksByBooking[b.id] || [];

    // Room Rate Overpayment
    const roomPayments = revs.filter(r => r.revenueType !== 'DrinkSettlement' && r.revenueType !== 'ExtensionFee');
    const totalRoomPaid = roomPayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const roomPrice = Number(b.totalPrice || 0);

    if (totalRoomPaid > roomPrice && roomPrice > 0) {
       anomalies.push({
         id: `overpay-${b.id}`,
         severity: 'medium',
         title: 'Overpaid Room Rate Anomaly',
         description: `Booking #${b.id.slice(-6)} (${b.guestName}) has a base room rate of GH₵${roomPrice.toFixed(2)}, but their Room Payment receipts total GH₵${totalRoomPaid.toFixed(2)}. This guest may have been double-charged, or a deposit was recorded twice in the ledger.`,
         bookingId: b.id
       });
    }

    // Extension Fee Overpayment
    const extPayments = revs.filter(r => r.revenueType === 'ExtensionFee');
    const totalExtPaid = extPayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const expectedExt = Number(b.lateCheckOutFeeApplied || 0);

    if (totalExtPaid > expectedExt && expectedExt > 0) {
       anomalies.push({
         id: `ext-${b.id}`,
         severity: 'medium',
         title: 'Excess Late Fee Revenue',
         description: `Booking #${b.id.slice(-6)} has Late Fee receipts totaling GH₵${totalExtPaid.toFixed(2)}, but their expected Late Checkout Fee was only GH₵${expectedExt.toFixed(2)}.`,
         bookingId: b.id
       });
    }

    // Drink Settlement Mismatch
    const drinkSetPayments = revs.filter(r => r.revenueType === 'DrinkSettlement');
    const totalDrinkSetPaid = drinkSetPayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const unpaidDrinksExpectedTotal = drinks.filter(s => 
      s.paymentMethod === 'Unpaid (Add to Room Bill)' || 
      s.paymentStatus === 'Unpaid' || 
      s.paymentMethod === 'Split (Paid & Unpaid)' || 
      s.paymentStatus === 'Split' || 
      !!s.settledAmount
    ).reduce((sum, s) => {
      // If it has a recorded settled amount (from a previous checkout), use that absolute value
      if (s.settledAmount) return sum + Number(s.settledAmount);
      
      // Otherwise, calculate based on current state (for active stays)
      const isFullyUnpaid = s.paymentStatus === 'Unpaid' || s.paymentMethod === 'Unpaid (Add to Room Bill)';
      const unpaidVal = isFullyUnpaid ? (s.totalPrice || 0) : (Number(s.unpaidAmount) || 0);
      return sum + unpaidVal;
    }, 0);

    if (totalDrinkSetPaid > unpaidDrinksExpectedTotal + 1.5) { // Allowance for small rounding
       anomalies.push({
         id: `drinks-${b.id}`,
         severity: 'high',
         title: 'Drink Settlement Mismatch',
         description: `Booking #${b.id.slice(-6)} has Drink Settlement receipts of GH₵${totalDrinkSetPaid.toFixed(2)}, but their total unpaid bar tab was recorded as GH₵${unpaidDrinksExpectedTotal.toFixed(2)}. Drink settlements may have been accidentally double-counted.`,
         bookingId: b.id
       });
    }
  });

  return Array.from(new Map(anomalies.map(a => [a.id, a])).values());
};
