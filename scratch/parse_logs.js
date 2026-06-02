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
    if (index === 6382 || index === 6388 || index === 6625 || index === 6645 || index === 6561) {
      console.log(`\n================= LINE ${index} =================`);
      try {
        const obj = JSON.parse(line);
        console.log(JSON.stringify(obj, null, 2));
      } catch (e) {
        console.log(`Failed to parse: ${e.message}`);
      }
    }
  }
}

main();
