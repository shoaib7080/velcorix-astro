const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '../src/pages');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let modified = false;

    // Header Regex
    // Looking for: <header ... url("..."); ... <h1...>(.*?)</h1> ... <p...>(.*?)</p> ... </header>
    const headerRegex = /<header[\s\S]*?style="[^"]*?url\(&quot;([^"]*)&quot;\)[^"]*?"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/header>/g;
    
    // Some headers might use 'url("path")' instead of '&quot;'
    const headerRegexAlt = /<header[\s\S]*?style="[^"]*?url\('?([^"']*)'?\)[^"]*?"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/header>/g;

    let headerMatch = headerRegex.exec(content);
    if (!headerMatch) {
        headerMatch = headerRegexAlt.exec(content);
        if (headerMatch) headerRegex.lastIndex = 0; // reset
    }

    if (headerMatch) {
        const bgImage = headerMatch[1].trim();
        const title = headerMatch[2].trim().replace(/\s+/g, ' ');
        const subtitle = headerMatch[3].trim().replace(/\s+/g, ' ');
        
        const replacement = `<PageHeader 
      title="${title}" 
      subtitle="${subtitle}" 
      bgImage="${bgImage}" 
    />`;
        
        if (headerMatch[0].includes('&quot;')) {
            content = content.replace(headerRegex, replacement);
        } else {
            content = content.replace(headerRegexAlt, replacement);
        }
        modified = true;
    }

    // CTA Regex
    const ctaRegex = /<section class="cta-section[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/section>/g;
    const ctaMatch = ctaRegex.exec(content);
    if (ctaMatch) {
        const heading = ctaMatch[1].trim().replace(/\s+/g, ' ');
        const subtext = ctaMatch[2].trim().replace(/\s+/g, ' ');
        const link = ctaMatch[3].trim();
        const btnText = ctaMatch[4].trim().replace(/\s+/g, ' ');

        const replacement = `<CtaSection 
      heading="${heading}" 
      subtext="${subtext}" 
      buttonText="${btnText}" 
      buttonLink="${link}" 
    />`;
        content = content.replace(ctaRegex, replacement);
        modified = true;
    }

    if (modified) {
        // Add imports if they don't exist
        const hasPageHeader = content.includes('<PageHeader');
        const hasCta = content.includes('<CtaSection');
        
        let importsToAdd = '';
        if (hasPageHeader && !content.includes('import PageHeader')) {
            // Calculate relative path to components
            const depth = filePath.replace(pagesDir, '').split(/[\\/]/).length - 1;
            const prefix = depth <= 1 ? '../' : '../../';
            importsToAdd += `import PageHeader from '${prefix}components/PageHeader.astro';\n`;
        }
        if (hasCta && !content.includes('import CtaSection')) {
            const depth = filePath.replace(pagesDir, '').split(/[\\/]/).length - 1;
            const prefix = depth <= 1 ? '../' : '../../';
            importsToAdd += `import CtaSection from '${prefix}components/CtaSection.astro';\n`;
        }

        if (importsToAdd) {
            // Find the frontmatter block
            if (content.startsWith('---')) {
                const endFrontmatter = content.indexOf('---', 3);
                if (endFrontmatter > -1) {
                    content = content.slice(0, 3) + '\n' + importsToAdd + content.slice(3);
                }
            } else {
                content = '---\n' + importsToAdd + '---\n' + content;
            }
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath.replace(pagesDir, '')}`);
    }
}

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            walk(file);
        } else if (file.endsWith('.astro')) {
            processFile(file);
        }
    });
}

console.log("Starting refactor...");
walk(pagesDir);
console.log("Done.");
