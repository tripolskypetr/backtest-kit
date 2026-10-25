import "./config/setup.mjs"

import { run } from 'worker-testbed'

// A quarter of a portfolio: six symbols, one shared budget, lockstep, a realistic
// synthetic tape, run on a 1m watch, a 1d watch and a reversed launch order and
// compared for identity. Minutes long on the full quarter, so it is not part of
// test/index.mjs: `node ./test/_run_portfolio.mjs`
// (PORTFOLIO_DAYS=10 PORTFOLIO_THINK_MS=0 for a quick local pass).
import "./portfolio/portfolio_quarter.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    // Give tape a beat to finalize the LAST test record: an immediate exit
    // races its onEnd tick and reports "test exited without ending"
    setTimeout(() => process.exit(-1), 250);
});
