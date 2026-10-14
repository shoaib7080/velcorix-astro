const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const heroDir = path.join(__dirname, '../public/assets/images/hero');
  const inputImage = path.join(heroDir, 'hero-img-1.webp');

  if (!fs.existsSync(inputImage)) {
    console.error('Input image does not exist:', inputImage);
    process.exit(1);
  }

  console.log('Generating responsive hero images from:', inputImage);

  // Mobile: 768px width
  const mobileOutput = path.join(heroDir, 'hero-img-1-mobile.webp');
  await sharp(inputImage)
    .resize({ width: 768, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(mobileOutput);
  const mobileStats = fs.statSync(mobileOutput);
  console.log(`Created mobile: ${mobileOutput} (${(mobileStats.size / 1024).toFixed(1)} KB)`);

  // Tablet: 1200px width
  const tabletOutput = path.join(heroDir, 'hero-img-1-tablet.webp');
  await sharp(inputImage)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(tabletOutput);
  const tabletStats = fs.statSync(tabletOutput);
  console.log(`Created tablet: ${tabletOutput} (${(tabletStats.size / 1024).toFixed(1)} KB)`);

  console.log('Done optimizing hero LCP variants.');
}

main().catch((err) => {
  console.error('Error optimizing hero images:', err);
  process.exit(1);
});
