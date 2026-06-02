import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_46.json" with { type: "json" };
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Edge case: Heat buffer overflow is PER-SYMBOL.
// One Heat storage holds signals bucketed by symbol. The cap
// (CC_MAX_HEATMAP_MARKDOWN_ROWS = 250) applies to each bucket independently.
//
// Symbol HOT: 300 signals → trimmed to 250 (50 oldest evicted).
// Symbol COLD: 50 signals → kept in full (under cap).
//
// This proves a high-volume symbol doesn't starve a low-volume neighbour.

test("backtest_46.json: Heat buffer trim is per-symbol — HOT clipped to 250, COLD preserved at 50", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const hot = stats.symbols.find((s) => s.symbol === "OVERFLOW-HOT");
  const cold = stats.symbols.find((s) => s.symbol === "OVERFLOW-COLD");
  if (!hot) return fail(`OVERFLOW-HOT row missing`);
  if (!cold) return fail(`OVERFLOW-COLD row missing`);

  if (hot.totalTrades !== 250) {
    return fail(`HOT must be trimmed to 250 (300 fed), got ${hot.totalTrades}`);
  }
  if (cold.totalTrades !== 50) {
    return fail(`COLD must remain at 50 (under cap), got ${cold.totalTrades}. ` +
                `If COLD also dropped, the buffer cap is being applied across symbols instead of per-symbol — regression.`);
  }

  // Portfolio total reflects post-trim state for HOT plus untouched COLD.
  if (stats.portfolioTotalTrades !== 300) {
    return fail(`portfolio total trades must be 250 + 50 = 300, got ${stats.portfolioTotalTrades}`);
  }

  pass(`Heat per-symbol trim verified: HOT=250 (trimmed), COLD=50 (intact), portfolio=${stats.portfolioTotalTrades}`);
});
