import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./measure/backtest_1.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
