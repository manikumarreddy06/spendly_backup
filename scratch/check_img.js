const fs = require('fs');

try {
  const filePath = 'c:/s/assets/images/spendly_s_logo.png';
  const buffer = fs.readFileSync(filePath);
  
  console.log('File size:', buffer.length, 'bytes');
  console.log('First 12 hex bytes:', buffer.slice(0, 12).toString('hex').toUpperCase());
  
  // Identify file signature
  const hex = buffer.slice(0, 8).toString('hex').toUpperCase();
  if (hex === '89504E470D0A1A0A') {
    console.log('Signature matches: valid PNG');
  } else if (buffer.slice(0, 4).toString('utf8') === 'RIFF' && buffer.slice(8, 12).toString('utf8') === 'WEBP') {
    console.log('Signature matches: WEBP image format (requires conversion to PNG)');
  } else if (hex.startsWith('FFD8FF')) {
    console.log('Signature matches: JPEG image format (requires conversion to PNG)');
  } else {
    console.log('Unknown image signature');
  }
} catch (e) {
  console.error('Error reading image:', e.message);
}
