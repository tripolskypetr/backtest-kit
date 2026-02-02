import { get } from "lodash";
import { getRouteParams as getRouteParamsBase } from "react-declarative";
import routes from "../config/routes";
import { ioc } from "../lib";

export const getRouteParams = (() => {
  let lastPath: string | null = null;
  let lastValue: Record<string, any> = {};
  return () => {
    const { pathname: path } = ioc.routerService.location;
    if (lastPath !== path) {
      lastValue =
        getRouteParamsBase(routes, ioc.routerService.location.pathname) || {};
      lastPath = path;
    }
    return lastValue;
  };
})();

export const getRouteParam = (
  key: string,
  defaultValue: string | null = null,
): string | null => {
  const params = getRouteParams();
  return get(params, key) || defaultValue;
};

(window as any).getRouteParams = getRouteParams;
(window as any).getRouteParam = getRouteParam;

export default getRouteParams;
