import "./config/setup.mjs"

import { run } from 'worker-testbed';

import "./e2e/risk.test.mjs";

import "./spec/exchange.test.mjs";
import "./spec/event.test.mjs";
import "./spec/validation.test.mjs";
import "./spec/backtest.test.mjs";
import "./spec/pnl.test.mjs";
import "./spec/report.test.mjs";
import "./spec/callbacks.test.mjs";
import "./spec/list.test.mjs";
import "./spec/live.test.mjs";
import "./spec/performance.test.mjs";
import "./spec/walker.test.mjs";
import "./spec/heat.test.mjs";
import "./spec/sizing.test.mjs";
import "./spec/risk.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
