import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./sim/eternal_hold.test.mjs";
import "./sim/simulator_jsonl.test.mjs";
import "./sim/dedupe.test.mjs";
import "./sim/author_ban.test.mjs";
import "./sim/mechanics.test.mjs";
import "./sim/progress.test.mjs";
import "./sim/no_good_authors.test.mjs";
import "./sim/truncated.test.mjs";
import "./sim/short_mechanics.test.mjs";
import "./sim/edge_metrics.test.mjs";
import "./sim/best_selection.test.mjs";
import "./sim/slot_boundary.test.mjs";
import "./sim/stateless.test.mjs";
import "./sim/profile_diagnostics.test.mjs";
import "./sim/degenerate_feeds.test.mjs";
import "./sim/grid_cartesian.test.mjs";
import "./sim/out_of_sample.test.mjs";
import "./sim/profit_lock.test.mjs";
import "./sim/author_metric.test.mjs";
import "./sim/author_metric_edges.test.mjs";
import "./sim/retain_metric.test.mjs";
import "./sim/ban_criteria.test.mjs";
import "./sim/lock_collision.test.mjs";
import "./sim/short_lock.test.mjs";
import "./sim/reach_stop_dependence.test.mjs";
import "./sim/oos_reach.test.mjs";
import "./sim/best_fallback.test.mjs";
import "./sim/callbacks_done.test.mjs";
import "./sim/input_normalization.test.mjs";
import "./sim/hold_beyond_horizon.test.mjs";
import "./sim/entity_lifecycle.test.mjs";
import "./sim/report_order.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
