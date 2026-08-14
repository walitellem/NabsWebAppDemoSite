const fs = require('fs');
let content = fs.readFileSync('src/components/ManagerDashboard.tsx', 'utf8');

// 1. Add import
if (!content.includes('import { validateRevenueIntegrity')) {
  content = content.replace(
    "import { BestSellingDrinks } from './BestSellingDrinks';",
    "import { validateRevenueIntegrity, RevenueAnomaly } from '../utils/revenueValidator';\nimport { BestSellingDrinks } from './BestSellingDrinks';"
  );
}

// 2. Add the anomalies calculation
if (!content.includes('const anomalies = React.useMemo(() =>')) {
  content = content.replace(
    "const theme = getThemeClasses(isDarkMode);",
    `const anomalies = React.useMemo(() => {
    return validateRevenueIntegrity(bookings, roomRevenue, drinkSales);
  }, [bookings, roomRevenue, drinkSales]);

  const theme = getThemeClasses(isDarkMode);`
  );
}

// 3. Add the UI rendering inside <main>
const bannerCode = `
        {/* REVENUE INTEGRITY WARNINGS */}
        {anomalies.length > 0 && activeTab === 'overview' && (
          <div className="mb-6 space-y-3">
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-rose-200 dark:border-rose-900/50">
                <div className="bg-rose-100 dark:bg-rose-900/50 p-2 rounded-lg text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-rose-900 dark:text-rose-100 text-sm">Revenue Reconciliation Anomaly Detected</h3>
                  <p className="text-xs text-rose-700 dark:text-rose-300">The system auditor caught discrepancies between Raw Ledger Receipts and Categorized Expected Revenue. Double-counting may be occurring.</p>
                </div>
              </div>
              <div className="space-y-2">
                {anomalies.map(anomaly => (
                  <div key={anomaly.id} className="bg-white/60 dark:bg-zinc-900/40 p-3 rounded-lg flex items-start gap-3 border border-rose-100 dark:border-rose-900/30">
                    <div className="mt-0.5">
                      <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-rose-800 dark:text-rose-200 text-xs mb-1">{anomaly.title}</h4>
                      <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">{anomaly.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
`;

if (!content.includes('REVENUE INTEGRITY WARNINGS')) {
  content = content.replace(
    "{/* Mobile Header (only visible on md-) */}",
    bannerCode + "\n        {/* Mobile Header (only visible on md-) */}"
  );
}

fs.writeFileSync('src/components/ManagerDashboard.tsx', content);
