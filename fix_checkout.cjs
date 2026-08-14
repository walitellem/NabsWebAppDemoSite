const fs = require('fs');
const content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

// Replace the updatedSale object in handleConfirmCheckout
let newContent = content.replace(
`            const updatedSale = {
              ...sale,
              paymentStatus: 'Paid' as const,
              paidAmount: sale.totalPrice,
              unpaidAmount: 0,
              settledPaymentMethod: checkoutPaymentMethod
            };`,
`            // Preserve the original amount paid at the bar (if any) to prevent double counting
            const originalBarPaidAmount = sale.paymentMethod === 'Split (Paid & Unpaid)' || sale.paymentStatus === 'Split' ? (Number(sale.paidAmount) || 0) : 0;
            const updatedSale = {
              ...sale,
              paymentStatus: 'Paid' as const,
              paidAmount: originalBarPaidAmount, // DO NOT overwrite with totalPrice, preserve actual bar payment
              unpaidAmount: 0,
              settledPaymentMethod: checkoutPaymentMethod,
              settledAmount: getDrinkUnpaidAmount(sale) // Track how much was settled via room checkout
            };`
);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', newContent);
