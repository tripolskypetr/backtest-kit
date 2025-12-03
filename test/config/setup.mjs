import { sleep } from "functools-kit";
import { setLogger, setConfig, PersistSignalAdapter, PersistRiskAdapter, PersistScheduleAdapter } from "../../build/index.mjs";

// setLogger(console)

PersistSignalAdapter.usePersistSignalAdapter(class {
  async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("usePersistSignalAdapter readValue should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
});

PersistRiskAdapter.usePersistRiskAdapter(class {
  async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("usePersistRiskAdapter readValue should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
})

PersistScheduleAdapter.usePersistScheduleAdapter(class {
  async waitForInit() {
    void 0;
  }
  async readValue() {
    throw new Error("usePersistScheduleAdapter readValue should not be called in testbed");
  }
  async hasValue() {
    return false;
  }
  async writeValue() {
    void 0;
  }
})

setConfig({
  // Отключаем новые валидации для старых тестов (система ведет себя как раньше)
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0, // Не проверяем минимальную дистанцию TP
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100, // Разрешаем любой SL (до 100%)
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, // Разрешаем любое время жизни сигнала
  CC_GET_CANDLES_RETRY_COUNT: 1, // Отключаем ретраи в тестах для ускорения
  CC_GET_CANDLES_RETRY_DELAY_MS: 100, // Минимальная задержка между ретраями
})

