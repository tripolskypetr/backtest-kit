import { Close, Refresh, Settings } from "@mui/icons-material";
import { alpha, Tooltip } from "@mui/material";
import {
  TypedField,
  FieldType,
  useForceUpdate,
  ActionButton,
  useActualValue,
  OneIcon,
  Subject,
} from "react-declarative";
import str from "../utils/str";
import { get } from "lodash";

interface IFeatureParams {
  title: string;
  description: string;
  name: string;
  idx: number;
}

interface IOffsetParams {
  title: string;
  name: string;
  idx: number;
  fetchFunction: () => Promise<string[]>;
}

const closeSubject = new Subject<void>();

const createItemListFromArray = (array: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  array.forEach((item, index) => {
    result[String(index)] = item;
  });
  return result;
};

const renderFeature = ({
  title,
  description,
  name,
  idx,
}: IFeatureParams): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    alignItems: "center",
    gridTemplateColumns: "1fr auto",
    paddingLeft: "16px",
    paddingRight: "16px",
    paddingTop: "4px",
    paddingBottom: "4px",
    background: (theme) =>
      idx % 2 === 0
        ? alpha(
            theme.palette.getContrastText(theme.palette.background.paper),
            0.04
          )
        : "transparent",
  },
  fields: [
    {
      type: FieldType.Box,
      fields: [
        {
          type: FieldType.Typography,
          fieldBottomMargin: "0",
          typoVariant: "body1",
          placeholder: title,
        },
        {
          type: FieldType.Typography,
          fieldBottomMargin: "0",
          style: {
            opacity: 0.5,
          },
          typoVariant: "caption",
          placeholder: description,
        },
      ],
    },
    {
      type: FieldType.Checkbox,
      readonly: true,
      fieldBottomMargin: "0",
      fieldRightMargin: "0",
      title: "",
      name,
    },
  ],
});

const renderPicker = ({
  title,
  name,
  idx,
  fetchFunction,
}: IOffsetParams): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    gridTemplateColumns: "auto 1fr 125px",
    alignItems: "center",
    background: (theme) =>
      idx % 2 === 0
        ? alpha(
            theme.palette.getContrastText(theme.palette.background.paper),
            0.04
          )
        : "transparent",
    padding: "8px",
    paddingLeft: "16px",
    paddingRight: "8px",
  },
  fields: [
    {
      type: FieldType.Typography,
      typoVariant: "body1",
      fieldBottomMargin: "0",
      placeholder: title,
    },
    {
      type: FieldType.Div,
    },
    {
      type: FieldType.Combo,
      readonly: true,
      noDeselect: true,
      outlined: idx % 2 === 0,
      name,
      title: "",
      fieldBottomMargin: "0",
      itemList: async () => {
        try {
          const data = await fetchFunction();
          const itemList = createItemListFromArray(data);
          return Object.keys(itemList);
        } catch (error) {
          console.error(`Error fetching ${name} list:`, error);
          return [];
        }
      },
      tr: async (value) => {
        try {
          const data = await fetchFunction();
          const itemList = createItemListFromArray(data);
          return itemList[value] || "";
        } catch (error) {
          console.error(`Error fetching ${name} translation:`, error);
          return "";
        }
      },
    },
  ],
});

const renderText = ({
  title,
  name,
  idx,
}: IFeatureParams): TypedField => ({
  type: FieldType.Box,
  sx: {
    display: "grid",
    gridTemplateColumns: "auto 1fr 125px",
    pointerEvents: "none",
    alignItems: "center",
    background: (theme) =>
      idx % 2 === 0
        ? alpha(
            theme.palette.getContrastText(theme.palette.background.paper),
            0.04
          )
        : "transparent",
    padding: "8px",
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  fields: [
    {
      type: FieldType.Typography,
      style: {
        fontSize: "12px"
      },
      typoVariant: "subtitle2",
      fieldBottomMargin: "0",
      placeholder: title,
    },
    {
      type: FieldType.Box,
      sx: {
        minWidth: "8px",
      },
    },
    {
      type: FieldType.Text,
      readonly: true,
      outlined: idx % 2 === 0,
      name,
      compute(data) {
        const value = get(data, name);
        return String(value);
      },
      title: "",
      fieldBottomMargin: "0",
      fieldRightMargin: "0",
    },
  ],
});

const feature_list = [
  {
    title: "JSONL files",
    description:
      "Files processed by Claude Code, HuggingFace, Parquet",
    name: "recent_enabled",
  },
  {
    title: "Markdown files",
    description:
      "Human-readable files. Useful when running without a GUI",
    name: "markdown_enabled",
  },
  {
    title: "Dump files",
    description:
      "Conversation dump with the AI agent used for trading signals",
    name: "dump_enabled",
  },
];

const config_fields: TypedField[] = [
  {
    type: FieldType.Box,
    sx: {
      maxWidth: 420,
      minWidth: 340,
      maxHeight: "calc(100dvh - 300px)",
    },
    fields: [
      {
        type: FieldType.Box,
        sx: {
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingLeft: "8px",
          paddingRight: "4px",
        },
        fields: [
          {
            type: FieldType.Typography,
            style: {
              opacity: 0.5,
            },
            fieldBottomMargin: "0",
            typoVariant: "subtitle2",
            placeholder: "Runtime Configuration",
          },
          {
            type: FieldType.Box,
          },
          {
            type: FieldType.Icon,
            fieldBottomMargin: "0",
            fieldRightMargin: "0",
            icon: Close,
            click: () => closeSubject.next(),
          },
        ],
      },
      renderText({
        idx: 0,
        title: "CC_SCHEDULE_AWAIT_MINUTES",
        name: "config.CC_SCHEDULE_AWAIT_MINUTES",
        description: str.newline(
          "Time to wait for scheduled signal to activate (in minutes).",
          "If signal does not activate within this time, it will be cancelled.",
        ),
      }),
      renderText({
        idx: 1,
        title: "CC_AVG_PRICE_CANDLES_COUNT",
        name: "config.CC_AVG_PRICE_CANDLES_COUNT",
        description: str.newline(
          "Number of candles to use for average price calculation (VWAP).",
          "Default: 5 candles (last 5 minutes when using 1m interval).",
        ),
      }),
      renderText({
        idx: 2,
        title: "CC_PERCENT_SLIPPAGE",
        name: "config.CC_PERCENT_SLIPPAGE",
        description: str.newline(
          "Slippage percentage applied to entry and exit prices.",
          "Simulates market impact and order book depth.",
          "Applied twice (entry and exit) for realistic execution simulation.",
          "Default: 0.1% per transaction.",
        ),
      }),
      renderText({
        idx: 3,
        title: "CC_PERCENT_FEE",
        name: "config.CC_PERCENT_FEE",
        description: str.newline(
          "Fee percentage charged per transaction.",
          "Applied twice (entry and exit) for total fee calculation.",
          "Default: 0.1% per transaction (total 0.2%).",
        ),
      }),
      renderText({
        idx: 4,
        title: "CC_MIN_TAKEPROFIT_DISTANCE_PERCENT",
        name: "config.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT",
        description: str.newline(
          "Minimum TakeProfit distance from priceOpen (percentage).",
          "Must be greater than (slippage + fees) to ensure profitable trades.",
          "Default: 0.5% (covers all costs + minimum profit margin).",
        ),
      }),
      renderText({
        idx: 5,
        title: "CC_MIN_STOPLOSS_DISTANCE_PERCENT",
        name: "config.CC_MIN_STOPLOSS_DISTANCE_PERCENT",
        description: str.newline(
          "Minimum StopLoss distance from priceOpen (percentage).",
          "Prevents signals from being immediately stopped out due to price volatility.",
          "Default: 0.5% (buffer to avoid instant stop loss on normal market fluctuations).",
        ),
      }),
      renderText({
        idx: 6,
        title: "CC_MAX_STOPLOSS_DISTANCE_PERCENT",
        name: "config.CC_MAX_STOPLOSS_DISTANCE_PERCENT",
        description: str.newline(
          "Maximum StopLoss distance from priceOpen (percentage).",
          "Prevents catastrophic losses from extreme StopLoss values.",
          "Default: 20% (one signal cannot lose more than 20% of position).",
        ),
      }),
      renderText({
        idx: 7,
        title: "CC_MAX_SIGNAL_LIFETIME_MINUTES",
        name: "config.CC_MAX_SIGNAL_LIFETIME_MINUTES",
        description: str.newline(
          "Maximum signal lifetime in minutes.",
          "Also used as the default when minuteEstimatedTime is not provided in ISignalDto.",
          "Prevents eternal signals that block risk limits for weeks/months.",
          "Use Infinity to allow signals to live indefinitely (until TP/SL or explicit close).",
          "Default: 1440 minutes (1 day).",
        ),
      }),
      renderText({
        idx: 8,
        title: "CC_MAX_SIGNAL_GENERATION_SECONDS",
        name: "config.CC_MAX_SIGNAL_GENERATION_SECONDS",
        description: str.newline(
          "Maximum time allowed for signal generation (in seconds).",
          "Prevents long-running or stuck signal generation routines from blocking execution or consuming resources indefinitely.",
          "If generation exceeds this threshold the attempt should be aborted, logged and optionally retried.",
          "Default: 180 seconds (3 minutes).",
        ),
      }),
      renderText({
        idx: 9,
        title: "CC_GET_CANDLES_RETRY_COUNT",
        name: "config.CC_GET_CANDLES_RETRY_COUNT",
        description: str.newline(
          "Number of retries for getCandles function.",
          "Default: 3 retries.",
        ),
      }),
      renderText({
        idx: 10,
        title: "CC_GET_CANDLES_RETRY_DELAY_MS",
        name: "config.CC_GET_CANDLES_RETRY_DELAY_MS",
        description: str.newline(
          "Delay between retries for getCandles function (in milliseconds).",
          "Default: 5000 ms (5 seconds).",
        ),
      }),
      renderText({
        idx: 11,
        title: "CC_MAX_CANDLES_PER_REQUEST",
        name: "config.CC_MAX_CANDLES_PER_REQUEST",
        description: str.newline(
          "Maximum number of candles to request per single API call.",
          "If a request exceeds this limit, data will be fetched using pagination.",
          "Default: 1000 candles per request.",
        ),
      }),
      renderText({
        idx: 12,
        title: "CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR",
        name: "config.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR",
        description: str.newline(
          "Maximum allowed deviation factor for price anomaly detection.",
          "Price should not be more than this factor lower than reference price.",
          "Example: BTC at $50,000 median → threshold $50 (catches $0.01-1 anomalies).",
        ),
      }),
      renderText({
        idx: 13,
        title: "CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN",
        name: "config.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN",
        description: str.newline(
          "Minimum number of candles required for reliable median calculation.",
          "Below this threshold, use simple average instead of median.",
          "Example: 3 candles = 12 points (use average), 5 candles = 20 points (use median).",
        ),
      }),
      renderText({
        idx: 14,
        title: "CC_REPORT_SHOW_SIGNAL_NOTE",
        name: "config.CC_REPORT_SHOW_SIGNAL_NOTE",
        description: str.newline(
          "Controls visibility of signal notes in markdown report tables.",
          "When enabled, the \"Note\" column will be displayed in all markdown reports (backtest, live, schedule, risk, etc.)",
          "Default: false (notes are hidden to reduce table width and improve readability).",
        ),
      }),
      renderText({
        idx: 15,
        title: "CC_BREAKEVEN_THRESHOLD",
        name: "config.CC_BREAKEVEN_THRESHOLD",
        description: str.newline(
          "Breakeven threshold percentage - minimum profit distance from entry to enable breakeven.",
          "When price moves this percentage in profit direction, stop-loss can be moved to entry (breakeven).",
          "Default: 0.2% (additional buffer above costs to ensure no loss when moving to breakeven).",
        ),
      }),
      renderText({
        idx: 16,
        title: "CC_ORDER_BOOK_TIME_OFFSET_MINUTES",
        name: "config.CC_ORDER_BOOK_TIME_OFFSET_MINUTES",
        description: str.newline(
          "Time offset in minutes for order book fetching.",
          "Subtracts this amount from the current time when fetching order book data.",
          "This helps get a more stable snapshot of the order book by avoiding real-time volatility.",
          "Default: 10 minutes.",
        ),
      }),
      renderText({
        idx: 17,
        title: "CC_ORDER_BOOK_MAX_DEPTH_LEVELS",
        name: "config.CC_ORDER_BOOK_MAX_DEPTH_LEVELS",
        description: str.newline(
          "Maximum depth levels for order book fetching.",
          "Specifies how many price levels to fetch from both bids and asks.",
          "Default: 20 levels.",
        ),
      }),
      renderText({
        idx: 18,
        title: "CC_AGGREGATED_TRADES_MAX_MINUTES",
        name: "config.CC_AGGREGATED_TRADES_MAX_MINUTES",
        description: str.newline(
          "Maximum minutes of aggregated trades to fetch when no limit is provided.",
          "If limit is not specified, the system will fetch aggregated trades for this many minutes starting from the current time minus the offset.",
          "Binance requirement.",
        ),
      }),
      renderText({
        idx: 19,
        title: "CC_MAX_BACKTEST_MARKDOWN_ROWS",
        name: "config.CC_MAX_BACKTEST_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in backtest markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 20,
        title: "CC_MAX_BREAKEVEN_MARKDOWN_ROWS",
        name: "config.CC_MAX_BREAKEVEN_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in breakeven markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 21,
        title: "CC_MAX_HEATMAP_MARKDOWN_ROWS",
        name: "config.CC_MAX_HEATMAP_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in heatmap markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 22,
        title: "CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS",
        name: "config.CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in highest profit markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 23,
        title: "CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS",
        name: "config.CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in max drawdown markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 24,
        title: "CC_MAX_LIVE_MARKDOWN_ROWS",
        name: "config.CC_MAX_LIVE_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in live markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 25,
        title: "CC_MAX_PARTIAL_MARKDOWN_ROWS",
        name: "config.CC_MAX_PARTIAL_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in partial markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 26,
        title: "CC_MAX_RISK_MARKDOWN_ROWS",
        name: "config.CC_MAX_RISK_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in risk markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 27,
        title: "CC_MAX_SCHEDULE_MARKDOWN_ROWS",
        name: "config.CC_MAX_SCHEDULE_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in schedule markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 28,
        title: "CC_MAX_STRATEGY_MARKDOWN_ROWS",
        name: "config.CC_MAX_STRATEGY_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in strategy markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 29,
        title: "CC_MAX_SYNC_MARKDOWN_ROWS",
        name: "config.CC_MAX_SYNC_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of events to keep in sync markdown report storage.",
          "Older events are removed (FIFO) when this limit is exceeded.",
          "Default: 250 events.",
        ),
      }),
      renderText({
        idx: 30,
        title: "CC_WALKER_MARKDOWN_TOP_N",
        name: "config.CC_WALKER_MARKDOWN_TOP_N",
        description: str.newline(
          "Number of top strategies to include in the walker comparison table.",
          "Default: 10 strategies.",
        ),
      }),
      renderText({
        idx: 31,
        title: "CC_MAX_PERFORMANCE_MARKDOWN_ROWS",
        name: "config.CC_MAX_PERFORMANCE_MARKDOWN_ROWS",
        description: str.newline(
          "Maximum number of performance metric events to keep in storage.",
          "Older events are removed when this limit is exceeded.",
          "Higher than other report event limits because performance metrics are lightweight and benefit from larger sample sizes for accurate statistical analysis.",
          "Default: 10000 events.",
        ),
      }),
      renderText({
        idx: 32,
        title: "CC_MAX_NOTIFICATIONS",
        name: "config.CC_MAX_NOTIFICATIONS",
        description: str.newline(
          "Maximum number of notifications to keep in storage.",
          "Older notifications are removed when this limit is exceeded.",
          "Default: 500 notifications.",
        ),
      }),
      renderText({
        idx: 33,
        title: "CC_MAX_SIGNALS",
        name: "config.CC_MAX_SIGNALS",
        description: str.newline(
          "Maximum number of signals to keep in storage.",
          "Older signals are removed when this limit is exceeded.",
          "Default: 50 signals.",
        ),
      }),
      renderText({
        idx: 34,
        title: "CC_MAX_LOG_LINES",
        name: "config.CC_MAX_LOG_LINES",
        description: str.newline(
          "Maximum number of log lines to keep in storage.",
          "Older log lines are removed when this limit is exceeded.",
          "This helps prevent unbounded log growth which can consume memory and degrade performance over time.",
          "Default: 1000 log lines.",
        ),
      }),
      renderText({
        idx: 35,
        title: "CC_ENABLE_CANDLE_FETCH_MUTEX",
        name: "config.CC_ENABLE_CANDLE_FETCH_MUTEX",
        description: str.newline(
          "Enables mutex locking for candle fetching to prevent concurrent fetches of the same candles.",
          "This can help avoid redundant API calls and ensure data consistency when multiple processes/threads attempt to fetch candles simultaneously.",
          "Default: true (mutex locking enabled for candle fetching).",
        ),
      }),
      renderText({
        idx: 36,
        title: "CC_ENABLE_BACKTEST_PARALLEL_SPIN",
        name: "config.CC_ENABLE_BACKTEST_PARALLEL_SPIN",
        description: str.newline(
          "Enables cooperative interleaving of concurrently running backtests after each candle fetch.",
          "Hands the event loop to a peer backtest waiting on the same mutex, so multiple parallel Backtest.run / Walker workloads progress in round-robin fashion instead of one monopolizing the event loop until completion.",
          "Default: true (parallel backtests are interleaved on each candle fetch boundary).",
        ),
      }),
      renderText({
        idx: 37,
        title: "CC_ENABLE_DCA_EVERYWHERE",
        name: "config.CC_ENABLE_DCA_EVERYWHERE",
        description: str.newline(
          "Enables DCA (Dollar-Cost Averaging) logic even if antirecord is not broken.",
          "Allows to commitAverageBuy if currentPrice is not the lowest price since entry, but still lower than priceOpen.",
          "Default: false (DCA logic enabled only when antirecord is broken).",
        ),
      }),
      renderText({
        idx: 38,
        title: "CC_ENABLE_PPPL_EVERYWHERE",
        name: "config.CC_ENABLE_PPPL_EVERYWHERE",
        description: str.newline(
          "Enables PPPL (Partial Profit, Partial Loss) logic even if this breaks a direction of exits.",
          "Allows to take partial profit or loss on a position even if it results in a mix of profit and loss exits.",
          "Default: false (PPPL logic is only applied when it does not break the direction of exits, ensuring clearer profit/loss outcomes).",
        ),
      }),
      renderText({
        idx: 39,
        title: "CC_ENABLE_LONG_SIGNAL",
        name: "config.CC_ENABLE_LONG_SIGNAL",
        description: str.newline(
          "Enables long signals in strategies that are primarily designed for short signals.",
          "This allows the strategy to generate and manage long signals in addition to short signals, even if the original design was focused on short trading.",
          "Default: false (long signals are only enabled in strategies that are designed for them, ensuring strategy logic is aligned with signal types).",
        ),
      }),
      renderText({
        idx: 40,
        title: "CC_ENABLE_SHORT_SIGNAL",
        name: "config.CC_ENABLE_SHORT_SIGNAL",
        description: str.newline(
          "Enables short signals in strategies that are primarily designed for long signals.",
          "This allows the strategy to generate and manage short signals in addition to long signals, even if the original design was focused on long trading.",
        ),
      }),
      renderText({
        idx: 41,
        title: "CC_ENABLE_TRAILING_EVERYWHERE",
        name: "config.CC_ENABLE_TRAILING_EVERYWHERE",
        description: str.newline(
          "Enables trailing logic (Trailing Take / Trailing Stop) without requiring absorption conditions.",
          "Allows trailing mechanisms to be activated regardless of whether absorption has been detected.",
          "Default: false (trailing logic is applied only when absorption conditions are met).",
        ),
      }),
      renderText({
        idx: 42,
        title: "CC_POSITION_ENTRY_COST",
        name: "config.CC_POSITION_ENTRY_COST",
        description: str.newline(
          "Cost of entering a position (in USD).",
          "This is used as a default value for calculating position size and risk management when cost data is not provided by the strategy.",
          "Default: $100 per position.",
        ),
      }),
    ]
  },
];

export const setup_fields: TypedField[] = [
  {
    type: FieldType.Group,
    fieldRightMargin: "1",
    phoneColumns: "12",
    tabletColumns: "12",
    desktopColumns: "6",
    fields: [

      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Box,
            sx: {
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
            },
            fields: [
              {
                type: FieldType.Box,
                sx: {
                  display: "grid",
                  gridTemplateColumns: "1fr",
                },
                fields: [
                  {
                    type: FieldType.Typography,
                    fieldBottomMargin: "1",
                    typoVariant: "h6",
                    placeholder: "Running mode",
                  },
                  {
                    type: FieldType.Typography,
                    fieldBottomMargin: "1",
                    isVisible: ({ running_mode }) =>
                      running_mode === "backtest",
                    style: {
                      color: "orange",
                    },
                    typoVariant: "body1",
                    placeholder:
                      "Historical data processing",
                  },
                  {
                    type: FieldType.Typography,
                    fieldBottomMargin: "1",
                    isVisible: ({ running_mode }) =>
                      running_mode === "live",
                    style: {
                      color: "green",
                    },
                    typoVariant: "body1",
                    placeholder:
                      "Real-time exchange integration",
                  },
                  {
                    type: FieldType.Typography,
                    fieldBottomMargin: "1",
                    isVisible: ({ running_mode }) =>
                      running_mode === "none",
                    style: {
                      color: "red",
                    },
                    typoVariant: "body1",
                    placeholder: "UI only",
                  },
                ]
              },
              {
                type: FieldType.Box,
              },
              {
                type: FieldType.Component,
                fieldBottomMargin: "0",
                element: ({ _fieldData: data, onChange }) => {
                  const data$ = useActualValue(data);
                  return (
                    <OneIcon
                      noBadge
                      size="small"
                      sx={{
                        transform: "translate(10px, -28px)",
                        opacity: "0.5",
                        transition: "opacity 500ms",
                        "&:hover": {
                          opacity: "1.0",
                        }
                      }}
                      oneSx={{
                        padding: "0 !important",
                      }}
                      fields={config_fields}
                      closeSubject={closeSubject}
                      handler={() => data}
                    >
                      <Settings />
                    </OneIcon>
                  );
                },
              },
            ],
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "backtest",
            title: "Historical data",
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "live",
            title: "Real-time",
          },
          {
            type: FieldType.Radio,
            readonly: true,
            fieldBottomMargin: "0",
            name: "running_mode",
            radioValue: "none",
            title: "Frontend only",
          },
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        innerPadding: "0px",
        fields: [
          {
            type: FieldType.Box,
            sx: {
              paddingTop: "16px",
              paddingLeft: "16px",
              paddingRight: "16px",
            },
            fields: [
              {
                type: FieldType.Typography,
                fieldBottomMargin: "1",
                typoVariant: "h6",
                placeholder: "Log mode",
              },
              {
                type: FieldType.Typography,
                fieldBottomMargin: "2",
                style: {
                  opacity: 0.5,
                },
                typoVariant: "caption",
                placeholder: "Logs take up disk space but are needed for debugging",
              },
            ],
          },
          ...feature_list.map(({ name, title, description }, idx) =>
            renderFeature({
              name,
              title,
              description,
              idx,
            })
          ),
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            typoVariant: "h6",
            placeholder: "User interface",
          },
          {
            type: FieldType.Switch,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Save notifications",
            name: "notification_enabled",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "1",
            style: {
              opacity: 0.5,
            },
            typoVariant: "caption",
            placeholder: "Event history is saved to disk",
          },
          {
            type: FieldType.Switch,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Save signals",
            name: "storage_enabled",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "0",
            style: {
              opacity: 0.5,
            },
            typoVariant: "caption",
            placeholder: "Latest signal state is saved to disk",
          },
        ],
      },
    ],
  },
  {
    type: FieldType.Group,
    fieldRightMargin: "1",
    fieldBottomMargin: "2",
    phoneColumns: "12",
    tabletColumns: "12",
    desktopColumns: "6",
    fields: [
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "3",
            typoVariant: "h6",
            placeholder: "Strategy",
          },

          {
            type: FieldType.Typography,
            placeholder: "Broker",
          },
          {
            type: FieldType.Outline,
            fieldBottomMargin: "3",
            fields: [
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Connected to mainnet (production)",
                name: "broker_enabled",
              },
            ],
          },
          {
            type: FieldType.Typography,
            placeholder: "Market signals",
          },
          {
            type: FieldType.Outline,
            fieldBottomMargin: "4",
            fields: [
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Use BM25 for RAG",
                name: "memory_enabled",
              },
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Use stateful strategies",
                name: "state_enabled",
              },
              {
                type: FieldType.Checkbox,
                readonly: true,
                fieldBottomMargin: "0",
                title: "Save previous signal",
                name: "recent_enabled",
              },
            ],
          },
        ],
      },
      {
        type: FieldType.Paper,
        fieldBottomMargin: "1",
        fields: [
          {
            type: FieldType.Typography,
            fieldBottomMargin: "2",
            typoVariant: "h6",
            placeholder: "Risk management",
          },
          {
            type: FieldType.Typography,
            fieldBottomMargin: "3",
            style: {
              opacity: 0.5,
            },
            typoVariant: "body1",
            placeholder:
              "Use LONG or SHORT positions depending on market conditions",
          },
          {
            type: FieldType.Checkbox,
            readonly: true,
            fieldBottomMargin: "0",
            title: "Enable LONG",
            name: "enable_long",
          },
          {
            type: FieldType.Checkbox,
            readonly: true,
            fieldBottomMargin: "1",
            title: "Enable SHORT",
            name: "enable_short",
          },
        ],
      },
    ],
  },
  {
    type: FieldType.Component,
    desktopHidden: true,
    fieldBottomMargin: "5",
    fieldRightMargin: "1",
    element: ({ payload }) => {
      const update = useForceUpdate();
      return (
        <ActionButton
          variant="contained"
          size="large"
          startIcon={<Refresh />}
          onClick={async () => {
            await payload.handleReload();
            update();
          }}
        >
          Refresh
        </ActionButton>
      );
    },
  },
];
