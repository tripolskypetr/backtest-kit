import { ITabsStep } from "react-declarative";
import { t } from "../../i18n";

export const tabs: ITabsStep[] = [
  {
    id: "signal_opened",
    label: t("Signal Opened"),
  },
  {
    id: "candle_1m",
    label: t("Timeframe 1m"),
    isVisible: ({ candle_1m }) => !!candle_1m,
  },
  {
    id: "candle_15m",
    label: t("Timeframe 15m"),
    isVisible: ({ candle_15m }) => !!candle_15m,
  },
  {
    id: "candle_1h",
    label: t("Timeframe 1h"),
    isVisible: ({ candle_1h }) => !!candle_1h,
  },
  {
    id: "candle_1d",
    label: t("Timeframe 1d"),
    isVisible: ({ candle_1d }) => !!candle_1d,
  },
];

export default tabs;
