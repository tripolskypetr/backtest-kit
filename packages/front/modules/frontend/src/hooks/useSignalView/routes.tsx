import { IOutletModal } from "react-declarative";
import SignalView from "./view/SignalView";
import Candle1mView from "./view/Candle1mView";
import Candle15mView from "./view/Candle15mView";
import Candle1hView from "./view/Candle1hView";
import Candle1dView from "./view/Candle1dView";
import NotificationView from "./view/NotificationView";
import DividendView from "./view/DividendView";
import StatusView from "./view/StatusView";

const hasMatch = (templates: string[], pathname: string) => {
  return templates.some((template) => template.includes(pathname));
};

export const routes: IOutletModal[] = [
  {
    id: "status",
    element: StatusView,
    isActive: (pathname) => hasMatch(["/status"], pathname),
  },
  {
    id: "signal",
    element: SignalView,
    isActive: (pathname) => hasMatch(["/signal"], pathname),
  },
  {
    id: "notification",
    element: NotificationView,
    isActive: (pathname) => hasMatch(["/notification"], pathname),
  },
  {
    id: "dividend",
    element: DividendView,
    isActive: (pathname) => hasMatch(["/dividend"], pathname),
  },
  {
    id: "candle_1m",
    element: Candle1mView,
    isActive: (pathname) => hasMatch(["/candle_1m"], pathname),
  },
  {
    id: "candle_15m",
    element: Candle15mView,
    isActive: (pathname) => hasMatch(["/candle_15m"], pathname),
  },
  {
    id: "candle_1h",
    element: Candle1hView,
    isActive: (pathname) => hasMatch(["/candle_1h"], pathname),
  },
  {
    id: "candle_1d",
    element: Candle1dView,
    isActive: (pathname) => hasMatch(["/candle_1d"], pathname),
  },
];

export default routes;
