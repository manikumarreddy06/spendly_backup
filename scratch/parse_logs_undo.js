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
    if (line.includes('[id].tsx') && (line.includes('undoDelete') || line.includes('toast'))) {
      try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            console.log(`Line ${index}: Tool Call: ${tc.name}`);
            if (tc.args.ReplacementChunks) {
              console.log(`  Chunks: ${tc.args.ReplacementChunks}`);
            } else if (tc.args.ReplacementContent) {
              console.log(`  Content: ${tc.args.ReplacementContent}`);
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
