const fs = require('fs');
const path = 'C:/s/app/split/[id].tsx';
let f = fs.readFileSync(path, 'utf8');

// 1. Add adsManager.adShowIfReady to handleAdd
f = f.replace(
  'setModalVisible(false);\r\n  };\r\n\r\n  const handleShare',
  'setModalVisible(false);\r\n    setTimeout(() => {\r\n      adsManager.showAdIfReady();\r\n    }, 200);\r\n  };\r\n\r\n  const handleShare'
);

// 2. Add settlement validation 
// The handleSettleAllWithValidation function should check for ₹0 amount
const settleAllFn = 'const handleSettleAll = async (from: string, to: string, amount: number) => {';
const validateFn = `const handleSettleAllWithValidation = async (from: string, to: string, amount: number) => {
    if (amount <= 0) {
      Alert.alert("Invalid Amount", "Settlement amount must be greater than ₹0.");
      return;
    }
    await handleSettleAll(from, to, amount);
  };

  ${settleAllFn}`;

f = f.replace(settleAllFn, validateFn);

// 3. Add RefreshControl to the main ScrollView
f = f.replace(
  '<ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>',
  '<ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}\r\n        refreshControl={\r\n          SUPABASE_ENABLED ? (\r\n            <RefreshControl\r\n              refreshing={false}\r\n              onRefresh={() => refreshGroup(group.id)}\r\n              tintColor={colors.primary}\r\n            />\r\n          ) : undefined\r\n        }>'
);

// 4. Replace export at end with ErrorBoundary wrapper
// Find the function end: the last '}' before the styles
const lastFunctionExport = '}\r\n\r\nconst detailStyles';
const wrappedExport = '}\r\n\r\nexport default function SplitGroupDetailWithErrorBoundary() {\r\n  return (\r\n    <ErrorBoundary>\r\n      <SplitGroupDetail />\r\n    </ErrorBoundary>\r\n  );\r\n}\r\n\r\nconst detailStyles';

// The file currently has 'export default function SplitGroupDetail() {' at the top
// We need to remove the default export and add wrapper at bottom
// First, remove the default export from the function declaration
f = f.replace('export default function SplitGroupDetail() {', 'function SplitGroupDetail() {');

// Now add the wrapper at the end
f = f.replace(lastFunctionExport, wrappedExport);

// Also need to update settle sheet to use handleSettleAllWithValidation
// Find and replace the settle button call sites
f = f.replace(
  'handleSettleAll(settleFrom, settleTo, effectiveAmount);',
  'handleSettleAllWithValidation(settleFrom, settleTo, effectiveAmount);'
);

fs.writeFileSync(path, f);
console.log('split/[id].tsx updated with all changes');
