const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (file.endsWith('.astro') || file.endsWith('.js') || file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

const srcDir = path.join(__dirname, '../src');
const files = getFiles(srcDir);
const iconSet = new Set();
const iconRegex = /fa[sbr]?\s+fa-([a-z0-9-]+)|fa-([a-z0-9-]+)/g;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  let match;
  while ((match = iconRegex.exec(content)) !== null) {
    const icon = match[1] || match[2];
    if (icon && !['solid', 'regular', 'brands', '2x', '3x', 'lg', 'sm', 'xs', 'fw', 'ul', 'li', 'spin', 'pulse'].includes(icon)) {
      iconSet.add(icon);
    }
  }
});

const sortedIcons = Array.from(iconSet).sort();
console.log(`Found ${sortedIcons.length} unique icons:`);
console.log(JSON.stringify(sortedIcons, null, 2));
