const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node validate-mermaid.cjs <input.md>");
  process.exit(1);
}

const markdown = fs.readFileSync(inputFile, 'utf8');
const mermaidRegex = /```mermaid\s+([\s\S]*?)```/g;

let match;
let count = 0;
let errorCount = 0;

const outputDir = 'diagrams';
fs.mkdirSync(outputDir, { recursive: true });

console.log(`\n=== Validating ${path.basename(inputFile)} ===\n`);

while ((match = mermaidRegex.exec(markdown)) !== null) {
  const mermaidCode = match[1];
  const lineNumber = markdown.substring(0, match.index).split('\n').length;

  const inputBase = path.basename(inputFile, path.extname(inputFile));
  const mmdFile = path.join(outputDir, `${inputBase}_${count}_test.mmd`);
  const svgFile = path.join(outputDir, `${inputBase}_${count}_test.svg`);

  // Write mermaid code to temp file
  fs.writeFileSync(mmdFile, mermaidCode);

  // Try to parse with mermaid-cli
  try {
    execSync(`npx -y @mermaid-js/mermaid-cli -i "${mmdFile}" -o "${svgFile}"`, {
      stdio: 'pipe',
      encoding: 'utf8'
    });

    // Success - clean up
    fs.unlinkSync(mmdFile);
    if (fs.existsSync(svgFile)) {
      fs.unlinkSync(svgFile);
    }
  } catch (error) {
    // Parse error - show the block
    console.log(`\n[BAD] Mermaid Block #${count} (line ${lineNumber}) - PARSE ERROR`);
    console.log('---');
    console.log(mermaidCode);
    console.log('---');
    console.log('Error:', error.stderr || error.message);
    console.log('');

    errorCount++;

    // Clean up temp file
    if (fs.existsSync(mmdFile)) {
      fs.unlinkSync(mmdFile);
    }
  }

  count++;
}

if (count === 0) {
  console.log('No mermaid blocks found.');
} else if (errorCount === 0) {
  console.log('[OK] All mermaid blocks parsed successfully!');
} else {
  console.log(`\n=== Summary: ${errorCount} of ${count} block(s) failed to parse ===`);
}
