import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./sim/eternal_hold.test.mjs";
import "./sim/simulator_jsonl.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
