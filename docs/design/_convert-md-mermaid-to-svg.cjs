const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile) throw new Error("Usage: node convert-md-mermaid-to-svg.js <input.md>");

const markdown = fs.readFileSync(inputFile, 'utf8');
const mermaidRegex = /```mermaid\s+([\s\S]*?)```/g;

let count = 0;
const inputBase = path.basename(inputFile, path.extname(inputFile));
const outputDir = `diagrams`;
fs.mkdirSync(outputDir, { recursive: true });

const updatedMarkdown = markdown.replace(mermaidRegex, (_, mermaidCode) => {
  const mmdFile = path.join(outputDir, `${inputBase}_${count}.mmd`);
  const svgFile = path.join(outputDir, `${inputBase}_${count}.svg`);
  fs.writeFileSync(mmdFile, mermaidCode);

  try {

  execSync(`npx -y @mermaid-js/mermaid-cli -i "${mmdFile}" -o "${svgFile}"`);
  } catch { }

  fs.unlinkSync(mmdFile); // optional: delete .mmd after rendering
  const relativeSvgPath = `./${path.relative(path.dirname(inputFile), svgFile)}`;

  const replacement = `![Mermaid Diagram](${relativeSvgPath})`;
  count++;
  return replacement;
});

const outputFile = inputFile.replace(/\.md$/, '.converted.md');
fs.writeFileSync(inputFile, updatedMarkdown);
console.log(`✅ Converted: ${inputFile}`);
