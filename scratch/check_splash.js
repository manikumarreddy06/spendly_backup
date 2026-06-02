const fs = require('fs');

try {
  const filePath = 'c:/s/assets/images/splash_image.png';
  if (!fs.existsSync(filePath)) {
    console.error(`File not found at: ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  console.log('File size:', buffer.length, 'bytes');
  
  const signature = buffer.slice(0, 8).toString('hex').toUpperCase();
  console.log('First 8 hex bytes:', signature);

  if (signature === '89504E470D0A1A0A') {
    console.log('SUCCESS: File is a valid PNG image.');
    
    // Let's do a basic structure check (read chunks)
    let offset = 8;
    let isCorrupted = false;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      const length = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
      
      if (offset + 12 + length > buffer.length) {
        console.log(`WARNING: Chunk ${type} at offset ${offset} indicates length ${length} which exceeds file boundary.`);
        isCorrupted = true;
        break;
      }
      offset += 12 + length;
    }
    if (isCorrupted) {
      console.log('WARNING: PNG structure might be corrupted.');
    } else {
      console.log('PNG structure looks complete.');
    }
  } else if (buffer.slice(0, 4).toString('utf8') === 'RIFF' && buffer.slice(8, 12).toString('utf8') === 'WEBP') {
    console.log('ERROR: This file is actually a WEBP image disguised as a PNG!');
    console.log('This will cause the native Android splash screen loader to crash on startup.');
  } else if (signature.startsWith('FFD8FF')) {
    console.log('ERROR: This file is actually a JPEG image disguised as a PNG!');
    console.log('This will cause the native Android splash screen loader to crash on startup.');
  } else {
    console.log('ERROR: Unknown file format. Signature is not a standard PNG.');
  }
} catch (e) {
  console.error('Error reading image:', e.message);
}
