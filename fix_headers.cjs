const fs = require('fs');

function replaceHeader(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // ReceptionistDashboard.tsx checkout
  content = content.replace(
    /<div className="flex flex-row items-center gap-4 mb-4 logo-header-row">\s*<NabsLodgeLogo size="lg" \/>\s*<div>\s*<h1 className="text-2xl font-extrabold tracking-tight text-slate-900 print:text-base">NABS LODGE<\/h1>/g,
    `<table style={{ width: '100%', marginBottom: '16px', border: 'none' }} className="logo-header-row">
      <tbody>
        <tr>
          <td style={{ width: '64px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="lg" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 print:text-base" style={{ margin: 0 }}>NABS LODGE</h1>`
  );
  // Need to fix the closing tags for ReceptionistDashboard checkout
  content = content.replace(
    /Official \{invoiceType === 'CheckIn' \? 'Check-In Booking' : 'Check-Out Settlement'\} \{documentLabel\}\s*<\/p>\s*<\/div>\s*<\/div>/g,
    `Official {invoiceType === 'CheckIn' ? 'Check-In Booking' : 'Check-Out Settlement'} {documentLabel}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>`
  );

  // ReceptionistDashboard.tsx walk-in
  content = content.replace(
    /<div className="flex flex-row items-center gap-4 mb-4 logo-header-row">\s*<NabsLodgeLogo size="sm" \/>\s*<div>\s*<h2 className="text-xl font-black tracking-tight text-blue-600 dark:text-blue-400">NABSLODGE<\/h2>/g,
    `<table style={{ width: '100%', marginBottom: '16px', border: 'none' }} className="logo-header-row">
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h2 className="text-xl font-black tracking-tight text-blue-600 dark:text-blue-400" style={{ margin: 0 }}>NABSLODGE</h2>`
  );
  content = content.replace(
    /Walk-In Activity Revenue Invoice & Receipt\s*<\/p>\s*<\/div>\s*<\/div>/g,
    `Walk-In Activity Revenue Invoice & Receipt
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>`
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

replaceHeader('src/components/ReceptionistDashboard.tsx');

let wial = fs.readFileSync('src/components/WalkInActivityLedger.tsx', 'utf8');
wial = wial.replace(
  /<div className="flex flex-row items-center gap-4 mb-4">\s*<NabsLodgeLogo size="sm" \/>\s*<div>\s*<h2 className="text-lg font-black tracking-tight text-blue-600 dark:text-blue-400">NABS LODGE<\/h2>/g,
  `<table style={{ border: 'none', marginBottom: '16px' }}>
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h2 className="text-lg font-black tracking-tight text-blue-600 dark:text-blue-400" style={{ margin: 0 }}>NABS LODGE</h2>`
);
wial = wial.replace(
  /Walk-In Activity Revenue Invoice & Receipt\s*<\/p>\s*<\/div>\s*<\/div>/g,
  `Walk-In Activity Revenue Invoice & Receipt
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>`
);
fs.writeFileSync('src/components/WalkInActivityLedger.tsx', wial, 'utf8');

let md = fs.readFileSync('src/components/ManagerDashboard.tsx', 'utf8');
md = md.replace(
  /<div className="flex flex-row items-center gap-4 mb-2">\s*<NabsLodgeLogo size="sm" \/>\s*<div>\s*<h1 className="text-2xl font-extrabold text-slate-900">NABS LODGE - Annual Report Reference Summary<\/h1>/g,
  `<table style={{ width: '100%', marginBottom: '8px', border: 'none' }}>
      <tbody>
        <tr>
          <td style={{ width: '48px', verticalAlign: 'middle', border: 'none', padding: '0 16px 0 0' }}>
            <NabsLodgeLogo size="sm" />
          </td>
          <td style={{ verticalAlign: 'middle', border: 'none', padding: '0' }}>
            <h1 className="text-2xl font-extrabold text-slate-900" style={{ margin: 0 }}>NABS LODGE - Annual Report Reference Summary</h1>`
);
md = md.replace(
  /Generated on \{new Date\(\)\.toLocaleDateString\('en-US', \{ dateStyle: 'full' \}\)\} \| Operator: \{currentUser\.name\} \(Manager\)\s*<\/p>\s*<\/div>\s*<\/div>/g,
  `Generated on {new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} | Operator: {currentUser.name} (Manager)
                                  </p>
                                </td>
                              </tr>
                            </tbody>
                          </table>`
);
fs.writeFileSync('src/components/ManagerDashboard.tsx', md, 'utf8');

console.log('Headers replaced with robust tables.');
