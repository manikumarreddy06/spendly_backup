const fs = require('fs');
const path = 'C:/s/app/(tabs)/split.tsx';
let f = fs.readFileSync(path, 'utf8');

// 1. Add formatTable/formatKeyValue import
f = f.replace(
  'import { useColors } from "@/hooks/useColors";',
  'import { useColors } from "@/hooks/useColors";\r\nimport { ErrorBoundary } from "@/components/ErrorBoundary";\r\nimport { formatTable, formatKeyValue } from "@/lib/tableFormatter";'
);

// 2. Wrap export with ErrorBoundary
f = f.replace(
  'export default function SplitScreen() {',
  'function SplitScreen() {'
);

// 3. Add wrapper at the end
// Find the styles section end and the last line
const stylesEnd = '  });';
const lastStylesEnd = f.lastIndexOf(stylesEnd);
if (lastStylesEnd !== -1) {
  // Find the end of file after styles
  const wrapper = '\r\n\r\nexport default function SplitScreenWithErrorBoundary() {\r\n  return (\r\n    <ErrorBoundary>\r\n      <SplitScreen />\r\n    </ErrorBoundary>\r\n  );\r\n}\r\n';
  f = f.slice(0, lastStylesEnd + stylesEnd.length) + wrapper + f.slice(lastStylesEnd + stylesEnd.length + f.slice(lastStylesEnd + stylesEnd.length).length);
}

// Need a different approach - just append at end
// The file doesn't end with anything after StyleSheet.create
// Let me check what's after the styles
const afterStyles = f.slice(lastStylesEnd + stylesEnd.length);
console.log('After styles:', JSON.stringify(afterStyles.slice(0, 100)));

fs.writeFileSync(path, f);
console.log('split.tsx updated');
