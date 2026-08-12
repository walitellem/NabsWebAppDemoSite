const fs = require('fs');

let content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');

// Fix the table-layout issue
content = content.replace(
  /style=\{\{\s*width:\s*'100%',\s*marginBottom:\s*'16px',\s*border:\s*'none'\s*\}\}/g,
  "style={{ width: '100%', marginBottom: '16px', border: 'none', tableLayout: 'fixed' }}"
);

fs.writeFileSync('src/components/ReceptionistDashboard.tsx', content, 'utf8');
console.log('Fixed tables.');
