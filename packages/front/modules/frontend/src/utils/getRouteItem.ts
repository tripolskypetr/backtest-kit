import { getRouteItem as getRouteItemBase } from "react-declarative";

import routes, { IRouteItem } from "../config/routes";
import { ioc } from "../lib";


export const getRouteItem = (() => {
  let lastPath: string | null = null;
  let lastValue: IRouteItem | null = null;
  return () => {
    const { pathname: path } = ioc.routerService.location;
    if (lastPath !== path) {
      lastValue = getRouteItemBase(routes, ioc.routerService.location.pathname);
      lastPath = path;
    }
    return lastValue;
  };
})();

(window as any).getRouteItem = getRouteItem;

export default getRouteItem;
