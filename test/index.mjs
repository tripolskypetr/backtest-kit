import "./config/setup.mjs"

import { run } from 'worker-testbed';

import "./spec/exchange.test.mjs";
import "./spec/event.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
