const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:/Users/manikumar reddy/.gemini/antigravity-ide/brain/18ea7ac7-3634-45e7-9bcc-05f4fcf5640f/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    index++;
    if (index < 6300 && (line.includes('split.tsx') || line.includes('[id].tsx'))) {
      try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            if (tc.name && (tc.name.includes('replace') || tc.name.includes('write'))) {
              console.log(`Line ${index}: Tool Call: ${tc.name}, Target: ${tc.args.TargetFile || tc.args.Target}`);
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
}

main();
