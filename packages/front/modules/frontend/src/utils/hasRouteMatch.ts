import { getRouteItem } from "react-declarative";
import routes from "../config/routes";
import { ioc } from "../lib";

export const hasRouteMatch = (
  templates: string[],
  pathname = ioc.routerService.location.pathname,
) => {
  return !!getRouteItem(
    routes.filter(({ path }) => templates.includes(path)),
    pathname,
  );
};

export default hasRouteMatch;
