import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./e2e/fill_consume.test.mjs";
import "./e2e/retry.test.mjs";
import "./e2e/retry_sched.test.mjs";
import "./e2e/retry_close.test.mjs";
import "./e2e/hardening.test.mjs";
import "./e2e/restore.test.mjs";
import "./e2e/recovery.test.mjs";
import "./e2e/scheduled.test.mjs";
import "./e2e/persist.test.mjs";
import "./e2e/reconcile.test.mjs";
import "./e2e/live.test.mjs";
import "./e2e/liveloop.test.mjs";
import "./e2e/shutdown.test.mjs";
import "./e2e/stopped.test.mjs";
import "./e2e/paused.test.mjs";
import "./e2e/verdict.test.mjs";
import "./e2e/verdict_cross.test.mjs";
import "./e2e/broker.test.mjs";
import "./e2e/broker_attempt.test.mjs";
import "./e2e/broker_edge.test.mjs";
import "./e2e/edge.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    setTimeout(() => process.exit(-1), 250);
});
