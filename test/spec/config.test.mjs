import { test } from "worker-testbed";
import { setConfig, getDefaultConfig } from "../../build/index.mjs";

test("ConfigValidationService: valid default config passes", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    pass("Default config validation passed");
  } catch (error) {
    fail(`Default config validation failed: ${error.message}`);
  }
});

test("ConfigValidationService: negative slippage fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_PERCENT_SLIPPAGE: -0.1 });
    fail("Should have thrown error for negative slippage");
  } catch (error) {
    if (error.message.includes("CC_PERCENT_SLIPPAGE must be a non-negative number")) {
      pass("Correctly rejected negative slippage");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative fee fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_PERCENT_FEE: -0.1 });
    fail("Should have thrown error for negative fee");
  } catch (error) {
    if (error.message.includes("CC_PERCENT_FEE must be a non-negative number")) {
      pass("Correctly rejected negative fee");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: TP below cost coverage fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    // Set TP to 0.3% which is below 0.4% (0.2% slippage + 0.2% fees)
    setConfig({
      CC_PERCENT_SLIPPAGE: 0.1,
      CC_PERCENT_FEE: 0.1,
      CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,
    });
    fail("Should have thrown error for TP below cost coverage");
  } catch (error) {
    if (
      error.message.includes("CC_MIN_TAKEPROFIT_DISTANCE_PERCENT") &&
      error.message.includes("too low to cover trading costs")
    ) {
      pass("Correctly rejected TP below cost coverage");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: TP at exact cost coverage passes", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    // Set TP to 0.4% which exactly covers 0.2% slippage + 0.2% fees
    setConfig({
      CC_PERCENT_SLIPPAGE: 0.1,
      CC_PERCENT_FEE: 0.1,
      CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.4,
    });
    pass("Correctly accepted TP at exact cost coverage");
  } catch (error) {
    fail(`Should have passed for TP at cost coverage: ${error.message}`);
  }
});

test("ConfigValidationService: MIN_SL > MAX_SL fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({
      CC_MIN_STOPLOSS_DISTANCE_PERCENT: 10,
      CC_MAX_STOPLOSS_DISTANCE_PERCENT: 5,
    });
    fail("Should have thrown error for MIN_SL > MAX_SL");
  } catch (error) {
    if (
      error.message.includes("CC_MIN_STOPLOSS_DISTANCE_PERCENT") &&
      error.message.includes("must be less than")
    ) {
      pass("Correctly rejected MIN_SL > MAX_SL");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero TP distance fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0 });
    fail("Should have thrown error for zero TP distance");
  } catch (error) {
    if (error.message.includes("CC_MIN_TAKEPROFIT_DISTANCE_PERCENT must be a positive number")) {
      pass("Correctly rejected zero TP distance");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative signal lifetime fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_SIGNAL_LIFETIME_MINUTES: -100 });
    fail("Should have thrown error for negative signal lifetime");
  } catch (error) {
    if (error.message.includes("CC_MAX_SIGNAL_LIFETIME_MINUTES must be a positive integer")) {
      pass("Correctly rejected negative signal lifetime");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: non-integer candle count fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_AVG_PRICE_CANDLES_COUNT: 5.5 });
    fail("Should have thrown error for non-integer candle count");
  } catch (error) {
    if (error.message.includes("CC_AVG_PRICE_CANDLES_COUNT must be a positive integer")) {
      pass("Correctly rejected non-integer candle count");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative retry count fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_RETRY_COUNT: -1 });
    fail("Should have thrown error for negative retry count");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_RETRY_COUNT must be a non-negative integer")) {
      pass("Correctly rejected negative retry count");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero MIN_SL fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MIN_STOPLOSS_DISTANCE_PERCENT: 0 });
    fail("Should have thrown error for zero MIN_SL");
  } catch (error) {
    if (error.message.includes("CC_MIN_STOPLOSS_DISTANCE_PERCENT must be a positive number")) {
      pass("Correctly rejected zero MIN_SL");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative MIN_SL fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MIN_STOPLOSS_DISTANCE_PERCENT: -5 });
    fail("Should have thrown error for negative MIN_SL");
  } catch (error) {
    if (error.message.includes("CC_MIN_STOPLOSS_DISTANCE_PERCENT must be a positive number")) {
      pass("Correctly rejected negative MIN_SL");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero MAX_SL fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_STOPLOSS_DISTANCE_PERCENT: 0 });
    fail("Should have thrown error for zero MAX_SL");
  } catch (error) {
    if (error.message.includes("CC_MAX_STOPLOSS_DISTANCE_PERCENT must be a positive number")) {
      pass("Correctly rejected zero MAX_SL");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative MAX_SL fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_STOPLOSS_DISTANCE_PERCENT: -10 });
    fail("Should have thrown error for negative MAX_SL");
  } catch (error) {
    if (error.message.includes("CC_MAX_STOPLOSS_DISTANCE_PERCENT must be a positive number")) {
      pass("Correctly rejected negative MAX_SL");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero SCHEDULE_AWAIT fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 0 });
    fail("Should have thrown error for zero SCHEDULE_AWAIT");
  } catch (error) {
    if (error.message.includes("CC_SCHEDULE_AWAIT_MINUTES must be a positive integer")) {
      pass("Correctly rejected zero SCHEDULE_AWAIT");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative SCHEDULE_AWAIT fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: -50 });
    fail("Should have thrown error for negative SCHEDULE_AWAIT");
  } catch (error) {
    if (error.message.includes("CC_SCHEDULE_AWAIT_MINUTES must be a positive integer")) {
      pass("Correctly rejected negative SCHEDULE_AWAIT");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero MAX_SIGNAL_GENERATION fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 0 });
    fail("Should have thrown error for zero MAX_SIGNAL_GENERATION");
  } catch (error) {
    if (error.message.includes("CC_MAX_SIGNAL_GENERATION_SECONDS must be a positive integer")) {
      pass("Correctly rejected zero MAX_SIGNAL_GENERATION");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative MAX_SIGNAL_GENERATION fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: -30 });
    fail("Should have thrown error for negative MAX_SIGNAL_GENERATION");
  } catch (error) {
    if (error.message.includes("CC_MAX_SIGNAL_GENERATION_SECONDS must be a positive integer")) {
      pass("Correctly rejected negative MAX_SIGNAL_GENERATION");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero AVG_PRICE_CANDLES fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_AVG_PRICE_CANDLES_COUNT: 0 });
    fail("Should have thrown error for zero AVG_PRICE_CANDLES");
  } catch (error) {
    if (error.message.includes("CC_AVG_PRICE_CANDLES_COUNT must be a positive integer")) {
      pass("Correctly rejected zero AVG_PRICE_CANDLES");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative AVG_PRICE_CANDLES fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_AVG_PRICE_CANDLES_COUNT: -5 });
    fail("Should have thrown error for negative AVG_PRICE_CANDLES");
  } catch (error) {
    if (error.message.includes("CC_AVG_PRICE_CANDLES_COUNT must be a positive integer")) {
      pass("Correctly rejected negative AVG_PRICE_CANDLES");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative RETRY_DELAY fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_RETRY_DELAY_MS: -100 });
    fail("Should have thrown error for negative RETRY_DELAY");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_RETRY_DELAY_MS must be a non-negative integer")) {
      pass("Correctly rejected negative RETRY_DELAY");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero PRICE_ANOMALY_THRESHOLD fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: 0 });
    fail("Should have thrown error for zero PRICE_ANOMALY_THRESHOLD");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR must be a positive integer")) {
      pass("Correctly rejected zero PRICE_ANOMALY_THRESHOLD");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative PRICE_ANOMALY_THRESHOLD fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: -1000 });
    fail("Should have thrown error for negative PRICE_ANOMALY_THRESHOLD");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR must be a positive integer")) {
      pass("Correctly rejected negative PRICE_ANOMALY_THRESHOLD");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: non-integer SCHEDULE_AWAIT fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120.5 });
    fail("Should have thrown error for non-integer SCHEDULE_AWAIT");
  } catch (error) {
    if (error.message.includes("CC_SCHEDULE_AWAIT_MINUTES must be a positive integer")) {
      pass("Correctly rejected non-integer SCHEDULE_AWAIT");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: non-integer MAX_SIGNAL_LIFETIME fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_MAX_SIGNAL_LIFETIME_MINUTES: 1440.7 });
    fail("Should have thrown error for non-integer MAX_SIGNAL_LIFETIME");
  } catch (error) {
    if (error.message.includes("CC_MAX_SIGNAL_LIFETIME_MINUTES must be a positive integer")) {
      pass("Correctly rejected non-integer MAX_SIGNAL_LIFETIME");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: multiple errors aggregated", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({
      CC_PERCENT_SLIPPAGE: -0.1,
      CC_PERCENT_FEE: -0.1,
      CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: -1,
    });
    fail("Should have thrown error for multiple invalid params");
  } catch (error) {
    const errorCount = (error.message.match(/\d+\./g) || []).length;
    if (errorCount >= 3) {
      pass(`Correctly aggregated ${errorCount} validation errors`);
    } else {
      fail(`Should have aggregated multiple errors, got: ${error.message}`);
    }
  }
});

test("ConfigValidationService: negative BACKTEST_STEP fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_BACKTEST_STEP_MINUTES: -60 });
    fail("Should have thrown error for negative BACKTEST_STEP");
  } catch (error) {
    if (error.message.includes("CC_BACKTEST_STEP_MINUTES must be a non-negative integer")) {
      pass("Correctly rejected negative BACKTEST_STEP");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: non-integer BACKTEST_STEP fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_BACKTEST_STEP_MINUTES: 1.5 });
    fail("Should have thrown error for non-integer BACKTEST_STEP");
  } catch (error) {
    if (error.message.includes("CC_BACKTEST_STEP_MINUTES must be a non-negative integer")) {
      pass("Correctly rejected non-integer BACKTEST_STEP");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: daily BACKTEST_STEP passes", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_BACKTEST_STEP_MINUTES: 24 * 60 });
    pass("Correctly accepted a 1440-minute timeframe step");
  } catch (error) {
    fail(`Should have passed for a daily timeframe step: ${error.message}`);
  } finally {
    setConfig(getDefaultConfig());
  }
});

test("ConfigValidationService: negative GET_CANDLES_MAX_ANOMALY_STREAK fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_MAX_ANOMALY_STREAK: -1 });
    fail("Should have thrown error for negative GET_CANDLES_MAX_ANOMALY_STREAK");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_MAX_ANOMALY_STREAK must be a non-negative integer")) {
      pass("Correctly rejected negative GET_CANDLES_MAX_ANOMALY_STREAK");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: zero GET_CANDLES_MAX_ANOMALY_STREAK passes", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_MAX_ANOMALY_STREAK: 0 });
    pass("Correctly accepted zero GET_CANDLES_MAX_ANOMALY_STREAK (throw on first anomaly)");
  } catch (error) {
    fail(`Should have passed for zero streak: ${error.message}`);
  } finally {
    setConfig(getDefaultConfig());
  }
});

test("ConfigValidationService: negative GET_CANDLES_MAX_GAP_STREAK fails", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_MAX_GAP_STREAK: -1 });
    fail("Should have thrown error for negative GET_CANDLES_MAX_GAP_STREAK");
  } catch (error) {
    if (error.message.includes("CC_GET_CANDLES_MAX_GAP_STREAK must be a non-negative integer or Infinity")) {
      pass("Correctly rejected negative GET_CANDLES_MAX_GAP_STREAK");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("ConfigValidationService: Infinity GET_CANDLES_MAX_GAP_STREAK passes", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());

  try {
    setConfig({ CC_GET_CANDLES_MAX_GAP_STREAK: Infinity });
    pass("Correctly accepted Infinity GET_CANDLES_MAX_GAP_STREAK (unbounded fill)");
  } catch (error) {
    fail(`Should have passed for Infinity gap streak: ${error.message}`);
  } finally {
    setConfig(getDefaultConfig());
  }
});
