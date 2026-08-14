const fs = require('fs');
let content = fs.readFileSync('src/components/ManagerDashboard.tsx', 'utf8');

content = content.replace(
`      // SKIP drinks that were settled at checkout to avoid double counting with RoomRevenue DrinkSettlement entries
      if (s.settledPaymentMethod) return;`,
`      // DO NOT blindly skip settled drinks. Only skip if nothing was paid at the bar.
      // if (s.settledPaymentMethod) return; // REMOVED
      if (paidAmount <= 0) return; // Wait, let's just make sure we only push if paidAmount > 0
`
);

content = content.replace(
`      // EXCLUDE drink sales that were settled at checkout to avoid double counting
      if (s.settledPaymentMethod) return;

      // Only count the PAID portion
      const paid = Number(s.paidAmount || (s.paymentStatus === 'Paid' ? s.totalPrice : 0));`,
`      // DO NOT blindly skip settled drinks because the original bar-paid portion must be counted in the active shift
      // if (s.settledPaymentMethod) return; // REMOVED

      // Only count the PAID portion
      const paid = Number(s.paidAmount !== undefined && s.paidAmount !== null ? s.paidAmount : (s.paymentStatus === 'Paid' ? s.totalPrice : 0));`
);

fs.writeFileSync('src/components/ManagerDashboard.tsx', content);
