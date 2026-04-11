import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIG_DIR = path.join(
  __dirname,
  "../content/feb_2026.strategy/dump/data/measure/research_source_8h_0"
);
const DUMP_DIR = path.join(
  __dirname,
  "../content/feb_2026.strategy/math/dump"
);

const COMM = 0.004; // 0.2% entry + 0.2% exit

const pineByStartSell = {};
const pineByStartBuy = {};
for (const f of fs.readdirSync(DUMP_DIR).filter((f) => f.endsWith(".jsonl"))) {
  const rows = fs
    .readFileSync(path.join(DUMP_DIR, f), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const startTs = new Date(rows[0].timestamp).getTime();
  if (f.endsWith("_buy.jsonl")) {
    if (!pineByStartBuy[startTs]) pineByStartBuy[startTs] = rows;
  } else {
    if (!pineByStartSell[startTs]) pineByStartSell[startTs] = rows;
  }
}

const signals = fs
  .readdirSync(SIG_DIR)
  .sort()
  .map((f) => {
    const ts = parseInt(f.replace("BTCUSDT_", "").replace(".json", ""));
    const j = JSON.parse(fs.readFileSync(path.join(SIG_DIR, f), "utf8"));
    return { ts, signal: j.data.signal };
  });

const trades = [];
let pos = null; // { direction, entryPrice, entryDate }

for (let si = 0; si < signals.length; si++) {
  const sig = signals[si];
  const nextSig = signals[si + 1];
  const pineMap = sig.signal === "BUY" ? pineByStartBuy : pineByStartSell;
  const rows = pineMap[sig.ts];

  // Signal changed or WAIT → close at first price of this block
  if (pos && sig.signal !== pos.direction) {
    const exitPrice = rows ? rows[0].Price : null;
    if (exitPrice !== null) {
      const raw =
        pos.direction === "SELL"
          ? (pos.entryPrice - exitPrice) / pos.entryPrice
          : (exitPrice - pos.entryPrice) / pos.entryPrice;
      trades.push({ date: pos.entryDate, dir: pos.direction, ep: pos.entryPrice, exit: exitPrice, pnl: raw - COMM, reason: "signal→" + sig.signal });
    }
    pos = null;
  }

  if (sig.signal === "WAIT") continue;

  if (!rows) {
    console.log("MISSING:", new Date(sig.ts).toISOString().slice(0, 16), sig.signal);
    continue;
  }

  // Enter on first 0→1 if not already in position
  if (!pos) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].Position === 0 && rows[i].Position === 1) {
        pos = {
          direction: sig.signal,
          entryPrice: rows[i].Price,
          entryDate: new Date(sig.ts).toISOString().slice(0, 16),
        };
        break;
      }
    }
    if (!pos) {
      console.log("NO ENTRY:", new Date(sig.ts).toISOString().slice(0, 16), sig.signal);
      continue;
    }
  }

  const sameSignalNext = nextSig && nextSig.signal === sig.signal;

  // Scan block for pine→0 exit — but only if it's not the last bar
  // (last bar always returns 0 due to stateless pine; we rely on signal change instead)
  for (let i = 1; i < rows.length - 1; i++) {
    if (rows[i].Position === 0) {
      const exitPrice = rows[i].Price;
      const raw =
        pos.direction === "SELL"
          ? (pos.entryPrice - exitPrice) / pos.entryPrice
          : (exitPrice - pos.entryPrice) / pos.entryPrice;
      trades.push({ date: pos.entryDate, dir: pos.direction, ep: pos.entryPrice, exit: exitPrice, pnl: raw - COMM, reason: "pine→0" });
      pos = null;
      break;
    }
  }

  // Close at EOB if next signal is different or missing
  if (pos && !sameSignalNext) {
    const exitPrice = rows[rows.length - 1].Price;
    const raw =
      pos.direction === "SELL"
        ? (pos.entryPrice - exitPrice) / pos.entryPrice
        : (exitPrice - pos.entryPrice) / pos.entryPrice;
    trades.push({ date: pos.entryDate, dir: pos.direction, ep: pos.entryPrice, exit: exitPrice, pnl: raw - COMM, reason: "EOB→" + (nextSig ? nextSig.signal : "END") });
    pos = null;
  }
  // same signal next block → keep pos open
}

let equity = 1, maxEq = 1, maxDD = 0, total = 0, wins = 0, losses = 0;
console.log("Date            | Dir  | Entry   | Exit    | PnL%   | Reason");
console.log("----------------|------|---------|---------|--------|-------");
for (const t of trades) {
  equity *= 1 + t.pnl;
  if (equity > maxEq) maxEq = equity;
  const dd = (maxEq - equity) / maxEq;
  if (dd > maxDD) maxDD = dd;
  total += t.pnl;
  if (t.pnl > 0) wins++; else losses++;
  console.log(`${t.date} | ${t.dir.padEnd(4)} | ${t.ep.toFixed(0).padStart(7)} | ${t.exit.toFixed(0).padStart(7)} | ${(t.pnl * 100).toFixed(2).padStart(6)}% | ${t.reason}`);
}
console.log("");
console.log(`Trades: ${trades.length} | Wins/Losses: ${wins}/${losses} | WinRate: ${((wins / trades.length) * 100).toFixed(0)}%`);
console.log(`Total PnL: ${(total * 100).toFixed(2)}% | Max DD: ${(maxDD * 100).toFixed(2)}%`);
