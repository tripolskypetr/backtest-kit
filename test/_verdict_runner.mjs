import "./config/setup.mjs"
import { run } from 'worker-testbed'
import "./e2e/verdict.test.mjs";
import "./e2e/retry.test.mjs";
import "./e2e/strategy.test.mjs";
run(import.meta.url, () => {
    console.log("Focused tests finished");
    setTimeout(() => process.exit(-1), 250);
});
