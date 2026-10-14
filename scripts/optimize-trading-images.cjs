const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const tradingDir = path.join(__dirname, '../public/assets/images/trading');
  const files = fs.readdirSync(tradingDir).filter(f => f.endsWith('.png'));

  console.log(`Found ${files.length} PNG images in trading directory to optimize...`);

  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const file of files) {
    const inputPath = path.join(tradingDir, file);
    const baseName = path.basename(file, '.png');
    const outputPath = path.join(tradingDir, `${baseName}.webp`);

    const originalStats = fs.statSync(inputPath);
    totalOriginal += originalStats.size;

    // Resize to max width 800px (more than enough for 210x114 thumbnail and page headers)
    await sharp(inputPath)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(outputPath);

    const newStats = fs.statSync(outputPath);
    totalOptimized += newStats.size;

    const savedPercent = (((originalStats.size - newStats.size) / originalStats.size) * 100).toFixed(1);
    console.log(
      `✓ ${file} (${(originalStats.size / 1024).toFixed(1)} KB) -> ${baseName}.webp (${(newStats.size / 1024).toFixed(1)} KB) [Saved ${savedPercent}%]`
    );
  }

  console.log('\n=======================================');
  console.log(`Total Original: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Optimized WebP: ${(totalOptimized / 1024).toFixed(1)} KB`);
  console.log(`Total Space Saved: ${(((totalOriginal - totalOptimized) / totalOriginal) * 100).toFixed(1)}%`);
  console.log('=======================================\n');
}

main().catch((err) => {
  console.error('Error optimizing trading images:', err);
  process.exit(1);
});
