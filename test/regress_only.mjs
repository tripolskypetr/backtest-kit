import "./config/setup.mjs"
import { run } from 'worker-testbed'
import "./e2e/adopt_pending.test.mjs";
import "./e2e/live.test.mjs";
import "./e2e/liveloop.test.mjs";
import "./e2e/scheduled.test.mjs";
import "./e2e/hold.test.mjs";
import "./e2e/stopped.test.mjs";
import "./e2e/paused.test.mjs";
import "./e2e/retry.test.mjs";
import "./e2e/retry_sched.test.mjs";
import "./e2e/reconcile.test.mjs";
import "./e2e/persist.test.mjs";
import "./e2e/restore.test.mjs";
import "./e2e/recovery.test.mjs";
import "./e2e/lockstep.test.mjs";
import "./e2e/ping_interval.test.mjs";
import "./e2e/signal_interval.test.mjs";
import "./e2e/window_stream.test.mjs";
import "./e2e/refuse_open.test.mjs";
import "./e2e/audit.test.mjs";
import "./e2e/gauntlet.test.mjs";
import "./spec/backtest.test.mjs";
import "./spec/live.test.mjs";
run(import.meta.url, () => {
    console.log("All tests are finished");
    setTimeout(() => process.exit(-1), 250);
});
