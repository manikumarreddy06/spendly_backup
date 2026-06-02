const fs = require('fs');

try {
  const inputPath = 'c:/s/assets/images/spendly_s_logo.png';
  const outputPath = 'c:/s/assets/images/spendly_s_logo_clean.png';
  
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found at: ${inputPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(inputPath);
  
  // Check PNG signature
  if (buffer.slice(0, 8).toString('hex').toLowerCase() !== '89504e470d0a1a0a') {
    console.log('Image is not a standard PNG format signature.');
    
    // Check if it is a WebP format
    if (buffer.slice(0, 4).toString('utf8') === 'RIFF' && buffer.slice(8, 12).toString('utf8') === 'WEBP') {
      console.log('Detected a WEBP image disguised as a PNG. Let us suggest converting it.');
    }
    process.exit(1);
  }
  
  const chunks = [];
  let offset = 8;
  
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    
    if (offset + 12 + length > buffer.length) {
      console.log('Chunk length overflows buffer. File might be corrupted.');
      break;
    }
    
    const chunkData = buffer.slice(offset, offset + 12 + length);
    
    // Only keep essential PNG chunks: IHDR (header), PLTE (palette), IDAT (pixel data), IEND (end)
    const isEssential = ['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type);
    
    if (isEssential) {
      chunks.push(chunkData);
    } else {
      console.log(`Skipping non-essential metadata chunk: ${type} (${length} bytes)`);
    }
    
    offset += 12 + length;
  }
  
  // Re-build standard PNG with signature + essential chunks
  const outputBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ...chunks
  ]);
  
  fs.writeFileSync(outputPath, outputBuffer);
  console.log('Successfully stripped all metadata. Saved to:', outputPath);
  
  // Replace the original file
  fs.unlinkSync(inputPath);
  fs.renameSync(outputPath, inputPath);
  console.log('Successfully replaced original logo file with the cleaned PNG.');
} catch (e) {
  console.error('Error cleaning PNG:', e.message);
}
