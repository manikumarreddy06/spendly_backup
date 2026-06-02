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
    if (index === 6382) {
      console.log(JSON.stringify(JSON.parse(line), null, 2));
      break;
    }
  }
}

main();
