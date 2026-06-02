const fs = require('fs');
const path = 'C:/s/app/split/[id].tsx';
let f = fs.readFileSync(path, 'utf8');

// Find the first occurrence of handleSettleAllWithValidation
const firstIdx = f.indexOf('const handleSettleAllWithValidation');
if (firstIdx === -1) { console.log('not found'); process.exit(0); }

// Find the second occurrence
const secondIdx = f.indexOf('const handleSettleAllWithValidation', firstIdx + 10);
if (secondIdx === -1) { console.log('no duplicate'); process.exit(0); }

// Find where the second function body ends (the closing brace before 'const handleSettleAll')
const afterSecond = f.indexOf('const handleSettleAll = async', secondIdx);
if (afterSecond === -1) { console.log('could not find handleSettleAll'); process.exit(0); }

// Remove the second duplicate function
f = f.slice(0, secondIdx - 2) + f.slice(afterSecond); // -2 for the \r\n before the duplicate

fs.writeFileSync(path, f);
console.log('Removed duplicate handleSettleAllWithValidation');
