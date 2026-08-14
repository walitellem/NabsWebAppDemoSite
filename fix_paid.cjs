const fs = require('fs');
let content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

content = content.replace(
`      // Only count the PAID portion of a sale
      const paid = Number(s.paidAmount || (s.paymentStatus === 'Paid' ? s.totalPrice : 0));`,
`      // Only count the PAID portion of a sale, safely handling 0 amounts
      const paid = Number(s.paidAmount !== undefined && s.paidAmount !== null ? s.paidAmount : (s.paymentStatus === 'Paid' ? s.totalPrice : 0));`
);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', content);
