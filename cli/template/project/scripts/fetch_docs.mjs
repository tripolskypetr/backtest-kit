import fs from "fs";
import path from "path";

const LIBRARY_LIST = [
  {
    name: "backtest-kit",
    readme: "https://raw.githubusercontent.com/tripolskypetr/backtest-kit/refs/heads/master/README.md",
  },
  {
    name: "backtest-kit/graph",
    readme: "https://raw.githubusercontent.com/tripolskypetr/backtest-kit/refs/heads/master/packages/graph/README.md",
  },
  {
    name: "backtest-kit/pinets",
    readme: "https://raw.githubusercontent.com/tripolskypetr/backtest-kit/refs/heads/master/packages/pinets/README.md",
  },
  {
    name: "backtest-kit/ollama",
    readme: "https://raw.githubusercontent.com/tripolskypetr/backtest-kit/refs/heads/master/packages/ollama/README.md",
  },
  {
    name: "backtest-kit/cli",
    readme: "https://raw.githubusercontent.com/tripolskypetr/backtest-kit/refs/heads/master/cli/README.md",
  },
  {
    name: "garch",
    readme: "https://raw.githubusercontent.com/tripolskypetr/garch/refs/heads/master/README.md",
  },
  {
    name: "volume-anomaly",
    readme: "https://raw.githubusercontent.com/tripolskypetr/volume-anomaly/refs/heads/master/README.md",
  },
  {
    name: "agent-swarm-kit",
    readme: "https://raw.githubusercontent.com/tripolskypetr/agent-swarm-kit/refs/heads/master/README.md",
  },
  {
    name: "functools-kit",
    readme: "https://raw.githubusercontent.com/tripolskypetr/functools-kit/refs/heads/master/README.md",
  },
];

const OUT_DIR = path.resolve("./docs/lib");

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const lib of LIBRARY_LIST) {
  const res = await fetch(lib.readme);
  if (!res.ok) {
    console.error(`Failed to fetch ${lib.name}: ${res.status} ${res.statusText}`);
    continue;
  }
  const text = await res.text();
  const fileName = lib.name.replace(/\//g, "__") + ".md";
  const outPath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(outPath, text, "utf-8");
  console.log(`Saved ${lib.name} -> ${outPath}`);
}
