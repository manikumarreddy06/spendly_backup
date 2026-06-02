const fs = require('fs');
const path = 'C:/s/app/split/[id].tsx';
let f = fs.readFileSync(path, 'utf8');

// 1. Add unodDelete, lastDeleted, clearLastDeleted, refreshGroup to destructure
f = f.replace(
  'deleteSplitExpense,\r\n    profile,\r\n    customCategories,',
  'deleteSplitExpense,\r\n    profile,\r\n    customCategories,\r\n    undoDelete,\r\n    lastDeleted,\r\n    clearLastDeleted,\r\n    refreshGroup,'
);

// 2. Add settlement validation (₹0 check) before handleSettleAll
f = f.replace(
  '  const handleSettleAll = async (from: string, to: string, amount: number) => {',
  '  const handleSettleAllWithValidation = async (from: string, to: string, amount: number) => {\r\n    if (amount <= 0) {\r\n      Alert.alert("Invalid Amount", "Settlement amount must be greater than ₹0.");\r\n      return;\r\n    }\r\n    await handleSettleAll(from, to, amount);\r\n  };\r\n\r\n  const handleSettleAll = async (from: string, to: string, amount: number) => {'
);

// 3. Replace handleShare with table-formatted version
const oldShare = `  const handleShare = async () => {\r\n    const lines: string[] = [];\r\n    lines.push(\`Spendly Split Group: \${cleanName}\`);\r\n    lines.push(\`Members: \${group.members.join(", ")}\`);\r\n    lines.push("");\r\n\r\n    lines.push("Balances:");\r\n    group.members.forEach((m) => {\r\n      const bal = balances[m] ?? 0;\r\n      if (bal > 0) lines.push(\`  \${m}: gets back \\u20b9\${bal.toFixed(0)}\`);\r\n      else if (bal < 0) lines.push(\`  \${m}: owes \\u20b9\${Math.abs(bal).toFixed(0)}\`);\r\n      else lines.push(\`  \${m}: settled\`);\r\n    });\r\n\r\n    lines.push("");\r\n    lines.push(\`Invite Code: \${group.id}\`);\r\n    lines.push("");\r\n    lines.push("Join via Spendly Split tab -> Join Group!");\r\n\r\n    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);\r\n    await Share.share({ message: lines.join("\\n") });`;
const newShare = `  const handleShare = async () => {\r\n    const memberBalances: string[][] = [];\r\n    group.members.forEach((m) => {\r\n      const bal = balances[m] ?? 0;\r\n      if (bal > 0) memberBalances.push([m, "gets back", \`\\u20b9\${bal.toFixed(0)}\`]);\r\n      else if (bal < 0) memberBalances.push([m, "owes", \`\\u20b9\${Math.abs(bal).toFixed(0)}\`]);\r\n      else memberBalances.push([m, "settled", "0"]);\r\n    });\r\n\r\n    const balTable = formatTable("Balances", [\r\n      { header: "Member", width: 14, align: "left" as const },\r\n      { header: "Status", width: 12, align: "left" as const },\r\n      { header: "Amount", width: 10, align: "right" as const },\r\n    ], memberBalances);\r\n\r\n    const summary = formatKeyValue([\r\n      ["Group", cleanName],\r\n      ["Members", \`\${group.members.length}\`],\r\n      ["Invite Code", group.id],\r\n    ]);\r\n\r\n    const message = [\r\n      summary,\r\n      \`\`,\r\n      balTable,\r\n      \`\`,\r\n      \`Join via Spendly Split tab -> Join Group!\`,\r\n    ].join("\\n");\r\n\r\n    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);\r\n    await Share.share({ message });`;

if (f.includes(oldShare)) {
  f = f.replace(oldShare, newShare);
} else {
  console.log('WARNING: Could not find handleShare to replace. The file may have different formatting.');
}

// 4. Add undo toast component at the end before StyleSheet
const undoToastEnd = `  if (!group) {`;
const undoToastInsert = `  // Undo delete toast\r\n  useEffect(() => {\r\n    if (lastDeleted) {\r\n      const timer = setTimeout(() => clearLastDeleted(), 5000);\r\n      return () => clearTimeout(timer);\r\n    }\r\n  }, [lastDeleted]);\r\n\r\n`;
f = f.replace(undoToastEnd, undoToastInsert + undoToastEnd);

fs.writeFileSync(path, f);
console.log('split/[id].tsx updated successfully');
