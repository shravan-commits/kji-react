import { readFileSync, writeFileSync } from 'fs';
const files = ['src/App.tsx', 'src/portalProfile.ts'];
for (const f of files) {
  let c = readFileSync(f, 'utf8');
  c = c.replace(/‘|’/g, "'").replace(/“|”/g, '"');
  writeFileSync(f, c, 'utf8');
  console.log('fixed', f);
}
