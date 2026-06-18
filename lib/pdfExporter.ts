import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { BUILTIN_CATEGORIES } from "@/constants/categories";

// Helper to resolve category label
function getCategoryLabel(catKey: string, customCategories: any[] = []): string {
  const builtin = BUILTIN_CATEGORIES.find((c) => c.key === catKey);
  if (builtin) return builtin.label;
  const custom = customCategories.find((c) => c.id === catKey);
  if (custom) return custom.name;
  return "Others";
}

// Format Date for PDF Statement
function formatPDFDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.split("T")[0];
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

interface ExportPDFOptions {
  html: string;
  filename: string;
  dialogTitle?: string;
}

// General PDF printer and sharer
async function printAndSharePDF({ html, filename, dialogTitle = "Export PDF" }: ExportPDFOptions): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // On web, open the print window dialog directly
      await Print.printAsync({ html });
    } else {
      // Verify sharing is available on mobile
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        throw new Error("Sharing is not available on this device");
      }

      // Generate the PDF file on the native cache
      const { uri } = await Print.printToFileAsync({ html });

      // Share the file
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle,
        UTI: "com.adobe.pdf",
      });
    }
  } catch (e: any) {
    throw new Error(`PDF export failed: ${e.message}`);
  }
}

/**
 * Exports personal expenses as a clean PDF statement
 */
export async function exportPersonalExpensesPDF(
  expenses: any[],
  customCategories: any[],
  userName: string,
  title: string = "Personal Expense Statement",
  currency: string = "₹"
): Promise<void> {
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const count = expenses.length;

  const tableRowsHtml = sortedExpenses
    .map((e) => {
      const catLabel = getCategoryLabel(e.category, customCategories);
      const desc = e.description || catLabel;
      const formattedDate = formatPDFDate(e.date);
      const amtStr = `${currency}${Math.round(e.amount).toLocaleString()}`;

      return `
        <tr>
          <td>${formattedDate}</td>
          <td><span class="badge category-${e.category || "others"}">${catLabel}</span></td>
          <td>${desc}</td>
          <td class="amount">${amtStr}</td>
        </tr>
      `;
    })
    .join("");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 40px;
            font-size: 13px;
            line-height: 1.5;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #10b981;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #10b981;
            letter-spacing: -0.5px;
          }
          .title-area {
            text-align: right;
          }
          h1 {
            font-size: 18px;
            margin: 0;
            color: #0f172a;
          }
          .meta-text {
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
          }
          .summary-grid {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
          }
          .summary-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
          }
          .summary-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            margin-bottom: 4px;
          }
          .summary-value {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background-color: #f1f5f9;
            color: #475569;
            font-weight: 600;
            text-align: left;
            padding: 10px 12px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #cbd5e1;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .amount {
            font-weight: 700;
            text-align: right;
          }
          .amount-header {
            text-align: right;
          }
          .badge {
            display: inline-block;
            padding: 3px 8px;
            font-size: 10px;
            font-weight: 600;
            border-radius: 4px;
            background-color: #e2e8f0;
            color: #475569;
          }
          .category-food { background-color: #ffedd5; color: #ea580c; }
          .category-travel { background-color: #d1fae5; color: #047857; }
          .category-shopping { background-color: #f3e8ff; color: #7c3aed; }
          .category-entertainment { background-color: #fef3c7; color: #d97706; }
          .category-healthcare { background-color: #e0f2fe; color: #0284c7; }
          .category-others { background-color: #f1f5f9; color: #4b5563; }
          footer {
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 50px;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <header>
          <div class="logo">Spendly</div>
          <div class="title-area">
            <h1>${title}</h1>
            <div class="meta-text">Generated on ${formatPDFDate(new Date().toISOString())}</div>
          </div>
        </header>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Account Owner</div>
            <div class="summary-value">${userName}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Spends</div>
            <div class="summary-value">${currency}${Math.round(totalSpent).toLocaleString()}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Transactions Count</div>
            <div class="summary-value">${count} entries</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Date</th>
              <th style="width: 20%;">Category</th>
              <th style="width: 45%;">Description</th>
              <th style="width: 20%;" class="amount-header">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No transactions found</td></tr>'}
          </tbody>
        </table>

        <footer>
          This expense statement was generated automatically by Spendly.
        </footer>
      </body>
    </html>
  `;

  await printAndSharePDF({
    html: htmlContent,
    filename: `spendly_expenses_${new Date().toISOString().split("T")[0]}.pdf`,
    dialogTitle: "Export Personal Expense Statement",
  });
}

/**
 * Exports split group ledger details as a clean PDF statement
 */
export async function exportGroupLedgerPDF(
  group: any,
  balances: Record<string, number>,
  cleanGroupName: string,
  currency: string = "₹"
): Promise<void> {
  const totalGroupSpend = (group.expenses || [])
    .filter((e: any) => e.category !== "settlement")
    .reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0);

  // Members lists
  const membersHtml = group.members.join(", ");

  // Balances lists
  const balanceRowsHtml = group.members
    .map((m: string) => {
      const bal = balances[m] ?? 0;
      let statusClass = "balance-settled";
      let statusText = "Settled";
      let displayAmt = `${currency}0`;

      if (bal > 0.01) {
        statusClass = "balance-gets-back";
        statusText = "Gets back";
        displayAmt = `${currency}${Math.round(bal).toLocaleString()}`;
      } else if (bal < -0.01) {
        statusClass = "balance-owes";
        statusText = "Owes";
        displayAmt = `${currency}${Math.round(Math.abs(bal)).toLocaleString()}`;
      }

      return `
        <tr>
          <td><strong>${m}</strong></td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td class="amount ${bal > 0.01 ? "gets-back-amt" : bal < -0.01 ? "owes-amt" : ""}">
            ${displayAmt}
          </td>
        </tr>
      `;
    })
    .join("");

  // Detailed Expense Log Rows
  const sortedExpenses = [...(group.expenses || [])].sort(
    (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const expenseRowsHtml = sortedExpenses
    .map((e: any) => {
      const formattedDate = formatPDFDate(e.date);
      const isSettlement = e.category === "settlement";
      const catLabel = isSettlement ? "Settlement" : getCategoryLabel(e.category || "others");
      const desc = e.description || catLabel;
      const splitModeLabel = isSettlement ? "Settle Up" : (e.splitMode || "equal");
      const amtStr = `${currency}${Math.round(e.totalAmount).toLocaleString()}`;

      return `
        <tr>
          <td>${formattedDate}</td>
          <td>${desc}</td>
          <td><span class="badge ${isSettlement ? "category-others" : `category-${e.category || "others"}`}">${catLabel}</span></td>
          <td>${e.paidBy}</td>
          <td><span class="split-mode-label">${splitModeLabel}</span></td>
          <td class="amount">${amtStr}</td>
        </tr>
      `;
    })
    .join("");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 40px;
            font-size: 12px;
            line-height: 1.5;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #a855f7;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #a855f7;
            letter-spacing: -0.5px;
          }
          .title-area {
            text-align: right;
          }
          h1 {
            font-size: 18px;
            margin: 0;
            color: #0f172a;
          }
          .meta-text {
            font-size: 10px;
            color: #64748b;
            margin-top: 4px;
          }
          h2 {
            font-size: 14px;
            color: #0f172a;
            border-left: 3px solid #a855f7;
            padding-left: 8px;
            margin-top: 25px;
            margin-bottom: 12px;
          }
          .summary-card {
            background-color: #faf5ff;
            border: 1px solid #f3e8ff;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 25px;
          }
          .summary-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
          }
          .summary-item {
            flex: 1;
            min-width: 150px;
          }
          .summary-label {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #701a75;
            margin-bottom: 4px;
          }
          .summary-value {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 600;
            text-align: left;
            padding: 8px 10px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #cbd5e1;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          .amount {
            font-weight: 700;
            text-align: right;
          }
          .amount-header {
            text-align: right;
          }
          .status-badge {
            display: inline-block;
            padding: 2px 6px;
            font-size: 9px;
            font-weight: 600;
            border-radius: 4px;
          }
          .balance-gets-back {
            background-color: #d1fae5;
            color: #047857;
          }
          .balance-owes {
            background-color: #fee2e2;
            color: #b91c1c;
          }
          .balance-settled {
            background-color: #f1f5f9;
            color: #64748b;
          }
          .gets-back-amt { color: #047857; }
          .owes-amt { color: #b91c1c; }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            font-size: 9px;
            font-weight: 600;
            border-radius: 4px;
            background-color: #e2e8f0;
            color: #475569;
          }
          .category-food { background-color: #ffedd5; color: #ea580c; }
          .category-travel { background-color: #d1fae5; color: #047857; }
          .category-shopping { background-color: #f3e8ff; color: #7c3aed; }
          .category-entertainment { background-color: #fef3c7; color: #d97706; }
          .category-healthcare { background-color: #e0f2fe; color: #0284c7; }
          .category-others { background-color: #f1f5f9; color: #4b5563; }
          .split-mode-label {
            font-size: 10px;
            color: #64748b;
            text-transform: capitalize;
          }
          footer {
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            margin-top: 40px;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
          }
        </style>
      </head>
      <body>
        <header>
          <div class="logo">Spendly</div>
          <div class="title-area">
            <h1>Group Split Ledger</h1>
            <div class="meta-text">Generated on ${formatPDFDate(new Date().toISOString())}</div>
          </div>
        </header>

        <div class="summary-card">
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Group Name</div>
              <div class="summary-value">${cleanGroupName}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Group Spend</div>
              <div class="summary-value">${currency}${Math.round(totalGroupSpend).toLocaleString()}</div>
            </div>
            <div class="summary-item" style="flex: 2; min-width: 250px;">
              <div class="summary-label">Members</div>
              <div class="summary-value" style="font-size:12px; font-weight:normal; color:#475569;">${membersHtml}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Invite Code / ID</div>
              <div class="summary-value" style="font-family:monospace; font-size:11px;">${group.id}</div>
            </div>
          </div>
        </div>

        <h2>Member Balances</h2>
        <table style="max-width: 500px;">
          <thead>
            <tr>
              <th style="width: 50%;">Member</th>
              <th style="width: 25%;">Status</th>
              <th style="width: 25%;" class="amount-header">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${balanceRowsHtml}
          </tbody>
        </table>

        <h2>Shared Expense Log</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Date</th>
              <th style="width: 32%;">Description</th>
              <th style="width: 18%;">Category</th>
              <th style="width: 16%;">Paid By</th>
              <th style="width: 12%;">Split Mode</th>
              <th style="width: 10%;" class="amount-header">Total</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRowsHtml || '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No expenses logged yet</td></tr>'}
          </tbody>
        </table>

        <footer>
          This group statement was generated automatically by Spendly.
        </footer>
      </body>
    </html>
  `;

  const safeName = cleanGroupName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  await printAndSharePDF({
    html: htmlContent,
    filename: `spendly_group_${safeName}_ledger_${new Date().toISOString().split("T")[0]}.pdf`,
    dialogTitle: `Export Ledger - ${cleanGroupName}`,
  });
}
