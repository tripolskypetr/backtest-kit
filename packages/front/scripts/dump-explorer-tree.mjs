import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mime from "mime-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DUMP_DIR = path.join(ROOT, "dump");

const buildTree = async (dir, visited) => {
  const realDir = await fs.realpath(dir);
  if (visited.has(realDir)) {
    return [];
  }
  visited.add(realDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    const childPath = path.join(dir, entry.name);
    const childRelPath = path.relative(ROOT, childPath);
    if (entry.isDirectory()) {
      nodes.push({
        path: childRelPath,
        label: entry.name,
        type: "directory",
        nodes: await buildTree(childPath, visited),
      });
    } else {
      nodes.push({
        path: childRelPath,
        label: entry.name,
        type: "file",
        mimeType: mime.lookup(entry.name) || "application/octet-stream",
      });
    }
  }
  return nodes;
};

const getTree = async () => {
  return [
    {
      path: path.relative(ROOT, DUMP_DIR),
      label: path.basename(DUMP_DIR),
      type: "directory",
      nodes: await buildTree(DUMP_DIR, new Set()),
    },
  ];
};

const tree = await getTree();
const outPath = path.join(ROOT, "explorer-tree.json");
await fs.writeFile(outPath, JSON.stringify(tree, null, 2));
console.log(`Written to ${outPath}`);
