const fs = require('fs');
let content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

content = content.replace(
`      // EXCLUDE drink sales that were settled at checkout to avoid double counting with RoomRevenue DrinkSettlement
      if (s.settledPaymentMethod) return;`,
`      // DO NOT blindly exclude settled drinks, because they might have a partially paid amount at the bar (Split Paid & Unpaid)
      // The unpaid portion was settled at checkout (DrinkSettlement), but the bar paid portion MUST still be counted in the bar drawer!
      // if (s.settledPaymentMethod) return; // <-- REMOVED`
);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', content);
