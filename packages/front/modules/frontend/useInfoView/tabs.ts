import { ITabsStep } from "react-declarative";

export const tabs: ITabsStep[] = [
  {
    id: "main",
    label: "Детали",
  },
  {
    id: "slope",
    label: "Минутный тренд, объем и моментум",
    isVisible: ({ slope }) => slope,
  },
  {
    id: "price",
    label: "Часовой тренд, объем и моментум",
    isVisible: ({ price }) => price,
  },
  {
    id: "volume",
    label: "Уровни поддержки и сопротивления",
    isVisible: ({ volume }) => volume,
  },
  {
    id: "long",
    label: "Long Term (Свечи 1h)",
    isVisible: ({ long }) => long,
  },
  {
    id: "swing",
    label: "Swing Term (Свечи 30m)",
    isVisible: ({ swing }) => swing,
  },
  {
    id: "short",
    label: "Short Term (Свечи 15m)",
    isVisible: ({ short }) => short,
  },
  {
    id: "mastodon",
    label: "Тренды Mastodon",
    isVisible: ({ mastodon }) => mastodon,
  },
  {
    id: "twitter",
    label: "Тренды Twitter",
    isVisible: ({ twitter }) => twitter,
  },
];

export default tabs;
