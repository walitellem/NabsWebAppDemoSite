const fs = require('fs');
let content = fs.readFileSync('src/components/NabsLodgeLogo.tsx', 'utf8');

// Add inline styles for max-width to guarantee containment
content = content.replace(
  /className=\{`\$\{containerSize\}/g,
  "style={{ maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }} className={`\${containerSize}"
);

fs.writeFileSync('src/components/NabsLodgeLogo.tsx', content, 'utf8');
console.log('Fixed NabsLodgeLogo');
