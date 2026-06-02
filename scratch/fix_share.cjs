const fs = require('fs');
const path = 'C:/s/app/split/[id].tsx';
let f = fs.readFileSync(path, 'utf8');

// Find handleShare start and end markers
const shareStart = '  const handleShare = async () => {';
const shareEnd = '  const handleAddMember = async () => {';

const startIdx = f.indexOf(shareStart);
const endIdx = f.indexOf(shareEnd);

if (startIdx === -1 || endIdx === -1) {
  console.log('Could not find markers. startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

const newShareBody = `  const handleShare = async () => {
    const memberBalances = [];
    group.members.forEach((m) => {
      const bal = balances[m] ?? 0;
      if (bal > 0) memberBalances.push([m, "gets back", "\\u20b9" + bal.toFixed(0)]);
      else if (bal < 0) memberBalances.push([m, "owes", "\\u20b9" + Math.abs(bal).toFixed(0)]);
      else memberBalances.push([m, "settled", "0"]);
    });

    const balTable = formatTable("Balances", [
      { header: "Member", width: 14, align: "left" },
      { header: "Status", width: 12, align: "left" },
      { header: "Amount", width: 10, align: "right" },
    ], memberBalances);

    const summary = formatKeyValue([
      ["Group", cleanName],
      ["Members", String(group.members.length)],
      ["Invite Code", group.id],
    ]);

    const message = [
      summary,
      "",
      balTable,
      "",
      "Join via Spendly Split tab -> Join Group!",
    ].join("\\n");

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({ message });
  };

  const handleAddMember = async () => {`;

f = f.slice(0, startIdx) + newShareBody + f.slice(endIdx + shareEnd.length);

fs.writeFileSync(path, f);
console.log('handleShare replaced successfully');
