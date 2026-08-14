const fs = require('fs');
let content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

const regex = /return\s*\{\s*\.\.\.s,\s*paymentStatus:\s*'Paid'\s*as\s*const,\s*paidAmount:\s*s\.totalPrice,\s*unpaidAmount:\s*0,\s*settledPaymentMethod:\s*bookingPaymentMethod\s*\};/g;

content = content.replace(regex, 
`              const originalBarPaidAmount = s.paymentMethod === 'Split (Paid & Unpaid)' || s.paymentStatus === 'Split' ? (Number(s.paidAmount) || 0) : 0;
              return { 
                 ...s,
                 paymentStatus: 'Paid' as const,
                 paidAmount: originalBarPaidAmount,
                 unpaidAmount: 0,
                 settledPaymentMethod: bookingPaymentMethod,
                 settledAmount: getDrinkUnpaidAmount(s)
              };`);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', content);
