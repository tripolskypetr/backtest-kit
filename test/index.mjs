import "./config/setup.mjs"

import { run } from 'worker-testbed';

import "./e2e/cancel.test.mjs";
import "./e2e/cache.test.mjs";
import "./e2e/shutdown.test.mjs";
import "./e2e/markdown.test.mjs";
import "./e2e/facades.test.mjs";
import "./e2e/partial.test.mjs"
import "./e2e/levels.test.mjs";
import "./e2e/restore.test.mjs";
import "./e2e/persist.test.mjs"
import "./e2e/sequence.test.mjs"
import "./e2e/other.test.mjs"
import "./e2e/defend.test.mjs"
import "./e2e/parallel.test.mjs";
import "./e2e/trailing.test.mjs";
import "./e2e/close.test.mjs"
import "./e2e/sanitize.test.mjs"
import "./e2e/edge.test.mjs"
import "./e2e/timing.test.mjs";
import "./e2e/risk.test.mjs";
import "./e2e/scheduled.test.mjs";
import "./e2e/config.test.mjs";
import "./e2e/columns.test.mjs";

import "./spec/live.test.mjs";
import "./spec/scheduled.test.mjs";
import "./spec/exchange.test.mjs";
import "./spec/risk.test.mjs";
import "./spec/sizing.test.mjs";
import "./spec/heat.test.mjs";
import "./spec/walker.test.mjs";
import "./spec/performance.test.mjs";
import "./spec/list.test.mjs";
import "./spec/callbacks.test.mjs";
import "./spec/report.test.mjs";
import "./spec/event.test.mjs";
import "./spec/validation.test.mjs";
import "./spec/backtest.test.mjs";
import "./spec/pnl.test.mjs";
import "./spec/optimizer.test.mjs"
import "./spec/config.test.mjs"
import "./spec/columns.test.mjs"

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
