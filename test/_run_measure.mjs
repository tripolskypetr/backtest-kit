import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./measure/backtest_1.test.mjs";
import "./measure/backtest_2.test.mjs";
import "./measure/backtest_3.test.mjs";
import "./measure/backtest_4.test.mjs";
import "./measure/backtest_5.test.mjs";
import "./measure/backtest_6.test.mjs";
import "./measure/backtest_7.test.mjs";
import "./measure/backtest_8.test.mjs";
import "./measure/backtest_9.test.mjs";
import "./measure/backtest_10.test.mjs";
import "./measure/backtest_11.test.mjs";
import "./measure/backtest_12.test.mjs";
import "./measure/backtest_13.test.mjs";
import "./measure/backtest_14.test.mjs";
import "./measure/backtest_15.test.mjs";
import "./measure/backtest_16.test.mjs";
import "./measure/backtest_17.test.mjs";
import "./measure/backtest_18.test.mjs";
import "./measure/backtest_19.test.mjs";
import "./measure/backtest_20.test.mjs";
import "./measure/backtest_21.test.mjs";
import "./measure/backtest_22.test.mjs";
import "./measure/backtest_23.test.mjs";
import "./measure/backtest_24.test.mjs";
import "./measure/backtest_25.test.mjs";
import "./measure/backtest_26.test.mjs";
import "./measure/backtest_27.test.mjs";
import "./measure/backtest_28.test.mjs";
import "./measure/backtest_29.test.mjs";
import "./measure/backtest_30.test.mjs";
import "./measure/backtest_31.test.mjs";
import "./measure/backtest_32.test.mjs";
import "./measure/backtest_33.test.mjs";
import "./measure/backtest_34.test.mjs";
import "./measure/backtest_35.test.mjs";
import "./measure/backtest_36.test.mjs";
import "./measure/backtest_37.test.mjs";
import "./measure/backtest_38.test.mjs";
import "./measure/empty_state.test.mjs";
import "./measure/lifecycle.test.mjs";
import "./measure/mode_separation.test.mjs";
import "./measure/backtest_39.test.mjs";
import "./measure/backtest_40.test.mjs";
import "./measure/backtest_41.test.mjs";
import "./measure/backtest_42.test.mjs";
import "./measure/backtest_43.test.mjs";
import "./measure/schedule.test.mjs";
import "./measure/performance.test.mjs";
import "./measure/markdown_rendering.test.mjs";
import "./measure/columns.test.mjs";
import "./measure/infra.test.mjs";
import "./measure/walker.test.mjs";
import "./measure/heat_extras.test.mjs";
import "./measure/schedule_extra.test.mjs";
import "./measure/performance_extra.test.mjs";
import "./measure/event_services.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    process.exit(-1);
});
