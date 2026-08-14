const fs = require('fs');
let content = fs.readFileSync('src/components/ManagerDashboard.tsx', 'utf8');

content = content.replace(
`        // Only count drinks that are NOT settled as part of a room bill
        const isSettledToRoom = curr.paymentMethod === 'Unpaid (Add to Room Bill)' || curr.paymentStatus === 'Unpaid' || !!curr.settledPaymentMethod;
        if (isSettledToRoom) return acc;`,
`        // DO NOT unconditionally skip settled drinks! A settled drink might have a bar-paid portion (e.g. Split Paid & Unpaid)
        // The getDrinkPaidAmount function correctly isolates the bar-paid portion.
        const isCompletelyUnpaidAtBar = curr.paymentMethod === 'Unpaid (Add to Room Bill)' || curr.paymentStatus === 'Unpaid';
        if (isCompletelyUnpaidAtBar) return acc;`
);

fs.writeFileSync('src/components/ManagerDashboard.tsx', content);
