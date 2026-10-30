const fs = require('fs');
const path = require('path');

const root = 'c:/Users/Mduva/Documents/WEBSITES/Corridor Maintenance App';

function showFile(rel) {
  const full = path.join(root, rel);
  console.log('===== ' + rel + ' =====');
  if (!fs.existsSync(full)) {
    console.log('DOES NOT EXIST');
    return;
  }
  const b = fs.readFileSync(full);
  console.log('size=' + b.length + ' bytes');
  console.log('first3hex=' + b.slice(0, 3).toString('hex'));
  console.log('--- content (latin1) ---');
  process.stdout.write(b.toString('latin1'));
  console.log('--- end ---');
}

const args = process.argv.slice(2);
if (args.length === 0) {
  showFile('package.json');
  showFile('api.js');
} else {
  for (const a of args) showFile(a);
}
