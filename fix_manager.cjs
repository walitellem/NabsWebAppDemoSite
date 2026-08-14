const fs = require('fs');
let content = fs.readFileSync('src/components/ManagerDashboard.tsx', 'utf8');

// Replace getDrinkPaidAmount
content = content.replace(
`  const getDrinkPaidAmount = (s: any) => {
    if (s.paymentStatus === 'Paid') return Number(s.totalPrice || 0);
    if (s.paymentStatus === 'Unpaid') return 0;
    if (s.paymentStatus === 'Split') return Number(s.paidAmount || 0);
    const isUnpaid = s.paymentMethod === 'Unpaid (Add to Room Bill)';
    const isSplit = s.paymentMethod === 'Split (Paid & Unpaid)';
    return isUnpaid ? 0 : (isSplit ? (Number(s.paidAmount) || 0) : Number(s.totalPrice || 0));
  };`,
`  const getDrinkPaidAmount = (s: any) => {
    // If it was settled at checkout, we must look at what was ORIGINALLY paid at the bar (if any)
    if (s.settledPaymentMethod) {
       if (s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid') return 0;
       return Number(s.paidAmount !== undefined && s.paidAmount !== null ? s.paidAmount : (s.paymentStatus === 'Paid' ? s.totalPrice : 0));
    }
    
    if (s.paymentStatus === 'Paid') return Number(s.totalPrice || 0);
    if (s.paymentStatus === 'Unpaid') return 0;
    if (s.paymentStatus === 'Split') return Number(s.paidAmount || 0);
    const isUnpaid = s.paymentMethod === 'Unpaid (Add to Room Bill)';
    const isSplit = s.paymentMethod === 'Split (Paid & Unpaid)';
    return isUnpaid ? 0 : (isSplit ? (Number(s.paidAmount) || 0) : Number(s.totalPrice || 0));
  };`
);

// Remove `|| !!s.settledPaymentMethod` from isDrinkSettledToRoom
content = content.replace(
`  const isDrinkSettledToRoom = (s: any) => {
    return s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid' || !!s.settledPaymentMethod;
  };`,
`  const isDrinkSettledToRoom = (s: any) => {
    // We DO NOT blindly consider settledPaymentMethod as fully settled-to-room because 
    // it could be a Split (Paid & Unpaid) where a portion was paid at the bar!
    // The bar portion MUST still be counted in the bar ledger!
    return s.paymentMethod === 'Unpaid (Add to Room Bill)' || s.paymentStatus === 'Unpaid';
  };`
);

fs.writeFileSync('src/components/ManagerDashboard.tsx', content);
