const fs = require('fs');
let content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

content = content.replace(
`          const updatedSale = {
            ...sale,
            paymentStatus: 'Paid' as const,
            paidAmount: sale.totalPrice,
            unpaidAmount: 0,
            settledPaymentMethod: bookingPaymentMethod
          };`,
`          const originalBarPaidAmount = sale.paymentMethod === 'Split (Paid & Unpaid)' || sale.paymentStatus === 'Split' ? (Number(sale.paidAmount) || 0) : 0;
          const updatedSale = {
            ...sale,
            paymentStatus: 'Paid' as const,
            paidAmount: originalBarPaidAmount, // DO NOT overwrite with totalPrice!
            unpaidAmount: 0,
            settledPaymentMethod: bookingPaymentMethod,
            settledAmount: getDrinkUnpaidAmount(sale)
          };`
);

content = content.replace(
`            return { 
               ...s,
               paymentStatus: 'Paid' as const,
               paidAmount: s.totalPrice,
               unpaidAmount: 0,
              settledPaymentMethod: bookingPaymentMethod
            };`,
`            const originalBarPaidAmount = s.paymentMethod === 'Split (Paid & Unpaid)' || s.paymentStatus === 'Split' ? (Number(s.paidAmount) || 0) : 0;
            return { 
               ...s,
               paymentStatus: 'Paid' as const,
               paidAmount: originalBarPaidAmount, // DO NOT overwrite with totalPrice!
               unpaidAmount: 0,
               settledPaymentMethod: bookingPaymentMethod,
               settledAmount: getDrinkUnpaidAmount(s)
            };`
);

// Oh wait, in checkout I also need to fix the updatedDrinkSalesList.map!
content = content.replace(
`              return { 
                 ...s,
                 paymentStatus: 'Paid' as const,
                 paidAmount: s.totalPrice,
                 unpaidAmount: 0,
                 settledPaymentMethod: checkoutPaymentMethod
              };`,
`              const originalBarPaidAmount = s.paymentMethod === 'Split (Paid & Unpaid)' || s.paymentStatus === 'Split' ? (Number(s.paidAmount) || 0) : 0;
              return { 
                 ...s,
                 paymentStatus: 'Paid' as const,
                 paidAmount: originalBarPaidAmount, // DO NOT overwrite with totalPrice!
                 unpaidAmount: 0,
                 settledPaymentMethod: checkoutPaymentMethod,
                 settledAmount: getDrinkUnpaidAmount(s)
              };`
);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', content);
