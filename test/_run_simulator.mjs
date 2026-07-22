import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./sim/eternal_hold.test.mjs";
import "./sim/simulator_jsonl.test.mjs";
import "./sim/dedupe.test.mjs";
import "./sim/author_ban.test.mjs";
import "./sim/mechanics.test.mjs";
import "./sim/consensus.test.mjs";
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
import "./sim/weighted_consensus.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
