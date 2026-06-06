import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_27.json" with { type: "json" };
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
  equityMaxDrawdown,
} from "../utils/measure_helpers.mjs";

// Out-of-order tick arrival. The JSON's row order is the ARRIVAL order; the
// pendingAt timestamps within those rows deliberately jump around
// (5, 2, 8, 0, 12, 4, 10, 1, 14, 7 days from T0).
//
// Contract (post-fix): the per-symbol equity curve walks trades CHRONOLOGICALLY
// by closeTimestamp (Heat sorts signals by closeTimestamp before walking
// maxDrawdown). This means equity curve is order-independent under replay:
// feeding the same closed signals in any tick order produces the same
// maxDrawdown / recoveryFactor.
//
// equityFinal IS still identical between orderings (multiplication is
// commutative). maxDrawdown is now ALSO order-independent because every walk
// is sorted to chronological before the equity walk. This matters under crash
// recovery (signals reloaded from disk in arbitrary order) and replay.

const SYMBOL = "SEQ-OOO";

test("backtest_27.json: equity curve walks chronologically — DD invariant under tick order", async ({ pass, fail }) => {
  const ht = lib.heatMarkdownService;
  ht.subscribe();
  await ht.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await ht.tick(toClosedTick(row));
  }
  const stats = await ht.getData(EXCHANGE, FRAME, true);
  const row = stats.symbols.find((s) => s.symbol === SYMBOL);
  if (!row) {
    fail(`expected ${SYMBOL} row, got ${stats.symbols.map((s) => s.symbol).join(",")}`);
    return;
  }

  const arrivalReturns = signals.map((s) => s.pnl.pnlPercentage);
  const arrivalFalls = signals.map((s) => {
    const f = s.maxDrawdown?.pnlPercentage;
    return typeof f === "number" ? f : null;
  });

  const chronoSorted = [...signals].sort(
    (a, b) => (a.updatedAt ?? a.pendingAt) - (b.updatedAt ?? b.pendingAt),
  );
  const chronoReturns = chronoSorted.map((s) => s.pnl.pnlPercentage);
  const chronoFalls = chronoSorted.map((s) => {
    const f = s.maxDrawdown?.pnlPercentage;
    return typeof f === "number" ? f : null;
  });

  const arrivalEquity = equityMaxDrawdown(arrivalReturns, arrivalFalls);
  const chronoEquity = equityMaxDrawdown(chronoReturns, chronoFalls);

  // Sanity: the two orderings must produce DIFFERENT DDs — otherwise the
  // fixture isn't actually exercising the contract.
  if (Math.abs(arrivalEquity.maxDD - chronoEquity.maxDD) < 0.5) {
    fail(`fixture is uninformative: arrival DD=${arrivalEquity.maxDD} ≈ chrono DD=${chronoEquity.maxDD}`);
    return;
  }

  // Service must match the CHRONOLOGICAL DD, not arrival.
  if (Math.abs(row.maxDrawdown - chronoEquity.maxDD) > 1e-6) {
    if (Math.abs(row.maxDrawdown - arrivalEquity.maxDD) < 1e-6) {
      fail(
        `service is walking arrival order (DD=${row.maxDrawdown} matches arrival=${arrivalEquity.maxDD}), ` +
        `but the chronological contract gives DD=${chronoEquity.maxDD}`,
      );
    } else {
      fail(
        `maxDrawdown mismatch: service=${row.maxDrawdown}, ` +
        `chronological=${chronoEquity.maxDD}, arrival=${arrivalEquity.maxDD}`,
      );
    }
    return;
  }

  // equityFinal is order-independent (commutative product). Recovery uses
  // equityFinal AND maxDrawdown; recoveryFactor must match the chronological
  // walk's numbers.
  const expectedRecovery = ((chronoEquity.equityFinal - 1) * 100) / chronoEquity.maxDD;
  if (Math.abs(row.recoveryFactor - expectedRecovery) > 1e-6) {
    fail(
      `recoveryFactor must use chronological-order equity/DD: ` +
      `service=${row.recoveryFactor} expected=${expectedRecovery}`,
    );
    return;
  }

  pass(
    `Chronological-order contract verified: maxDD=${row.maxDrawdown.toFixed(4)} (chrono), ` +
    `arrival DD would have been ${arrivalEquity.maxDD.toFixed(4)}, ` +
    `recovery=${row.recoveryFactor.toFixed(4)}`,
  );
});
