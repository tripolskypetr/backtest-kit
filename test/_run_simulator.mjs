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

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
