import { ITabsStep } from "react-declarative";

export const tabs: ITabsStep[] = [
  {
    id: "signal_scheduled",
    label: "Signal Scheduled",
  },
  {
    id: "candle_1m",
    label: "Timeframe 1m",
    isVisible: ({ candle_1m }) => !!candle_1m,
  },
  {
    id: "candle_15m",
    label: "Timeframe 15m",
    isVisible: ({ candle_15m }) => !!candle_15m,
  },
  {
    id: "candle_1h",
    label: "Timeframe 1h",
    isVisible: ({ candle_1h }) => !!candle_1h,
  },
];

export default tabs;
