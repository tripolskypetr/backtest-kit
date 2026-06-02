import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_27.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  equityMaxDrawdown,
} from "../utils/_measure_helpers.mjs";

// Out-of-order tick arrival. The JSON's row order is the ARRIVAL order; the
// pendingAt timestamps within those rows deliberately jump around
// (5, 2, 8, 0, 12, 4, 10, 1, 14, 7 days from T0).
//
// Service contract: storage is unshift-on-add (newest-arrival at head),
// equity-curve iteration walks from tail to head — so the equity curve
// reflects ARRIVAL ORDER, not pendingAt order. This is intentional in the
// service (it can't see the future to insert older ticks ahead of newer
// arrivals in real time), but it means an out-of-order replay produces a
// DIFFERENT equity curve than a chronologically-sorted replay of the same
// signals.
//
// equityFinal IS still identical between orderings (multiplication is
// commutative), but maxDrawdown is not. We lock both invariants in:
//   - equityFinal: same regardless of order
//   - maxDrawdown (via Heat): equals the ARRIVAL-order DD, NOT the
//     chronologically-sorted DD.

const POOL = "POOL-B27";
const SYMBOL = "SEQ-OOO";

test("backtest_27.json: equity curve follows ARRIVAL order, not pendingAt order", async ({ pass, fail }) => {
  // Feed via Heat so we get per-symbol maxDrawdown directly.
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
  const chronoReturns = [...signals]
    .sort((a, b) => a.pendingAt - b.pendingAt)
    .map((s) => s.pnl.pnlPercentage);

  const arrivalEquity = equityMaxDrawdown(arrivalReturns);
  const chronoEquity = equityMaxDrawdown(chronoReturns);

  // Sanity: the two orderings MUST produce different DDs — otherwise the
  // fixture isn't actually testing anything.
  if (Math.abs(arrivalEquity.maxDD - chronoEquity.maxDD) < 0.5) {
    fail(`fixture is uninformative: arrival DD=${arrivalEquity.maxDD} ≈ chrono DD=${chronoEquity.maxDD}`);
    return;
  }

  // Service must match the ARRIVAL-order DD.
  if (Math.abs(row.maxDrawdown - arrivalEquity.maxDD) > 1e-6) {
    if (Math.abs(row.maxDrawdown - chronoEquity.maxDD) < 1e-6) {
      fail(`service is sorting by pendingAt (DD=${row.maxDrawdown} matches chronological=${chronoEquity.maxDD}), but ARRIVAL order is the documented contract (=${arrivalEquity.maxDD})`);
    } else {
      fail(`maxDrawdown mismatch: service=${row.maxDrawdown}, arrival=${arrivalEquity.maxDD}, chronological=${chronoEquity.maxDD}`);
    }
    return;
  }

  // equityFinal is order-independent (commutative product). Recovery uses
  // equityFinal AND maxDrawdown; we can derive equityFinal back from Recovery.
  // (Heat doesn't expose equityFinal directly.) But we can check that
  // recoveryFactor matches what the formula gives with arrival-order eqFinal:
  const expectedRecovery = ((arrivalEquity.equityFinal - 1) * 100) / arrivalEquity.maxDD;
  if (Math.abs(row.recoveryFactor - expectedRecovery) > 1e-6) {
    fail(`recoveryFactor must use arrival-order equity/DD: service=${row.recoveryFactor} expected=${expectedRecovery}`);
    return;
  }

  pass(
    `Arrival-order contract verified: maxDD=${row.maxDrawdown.toFixed(4)} (arrival), ` +
    `chrono DD would be ${chronoEquity.maxDD.toFixed(4)}, ` +
    `recovery=${row.recoveryFactor.toFixed(4)}`,
  );
});
