import { sleep } from "functools-kit";
import {
  setLogger,
  setConfig,
  PersistSignalAdapter,
  PersistRiskAdapter,
  PersistScheduleAdapter,
  PersistPartialAdapter,
  PersistCandleAdapter,
  PersistBreakevenAdapter,
  PersistStorageAdapter,
  PersistMemoryAdapter,
  PersistIntervalAdapter,
  PersistMeasureAdapter,
  PersistRecentAdapter,
  Report,
  Markdown,
  Dump,
  Memory,
} from "../../build/index.mjs";

// setLogger(console)

{
  Markdown.enable();
  Report.enable();
}

{
  Dump.enable();
  Memory.enable();
}

{
  Dump.useDummy();
  Report.useDummy();
  Memory.useDummy();
  Markdown.useDummy();
}

{
  PersistSignalAdapter.useDummy();
  PersistRiskAdapter.useDummy();
  PersistScheduleAdapter.useDummy();
  PersistPartialAdapter.useDummy();
  PersistCandleAdapter.useDummy();
  PersistBreakevenAdapter.useDummy();
  PersistStorageAdapter.useDummy();
  PersistMemoryAdapter.useDummy();
  PersistIntervalAdapter.useDummy();
  PersistMeasureAdapter.useDummy();
  PersistRecentAdapter.useDummy();
}

setConfig(
  {
    // Отключаем новые валидации для старых тестов (система ведет себя как раньше)
    CC_PERCENT_SLIPPAGE: 0.1, // Slippage 0.1% per transaction
    CC_PERCENT_FEE: 0.1, // Fee 0.1% per transaction
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0, // Не проверяем минимальную дистанцию TP
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: 0, // Не проверяем минимальную дистанцию SL
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100, // Разрешаем любой SL (до 100%)
    CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, // Разрешаем долгое время жизни сигнала
    CC_GET_CANDLES_RETRY_COUNT: 1, // Отключаем ретраи в тестах для ускорения
    CC_GET_CANDLES_RETRY_DELAY_MS: 100, // Минимальная задержка между ретраями

    CC_REPORT_SHOW_SIGNAL_NOTE: true, // Показываем заметки сигналов в отчете
  },
  true
);

console.warn = () => void 0;
