import { parseRouteUrl } from "react-declarative";
import { IWizardModal } from "react-declarative/components";
import FormView from "./view/FormView";
import BriefView from "./view/BriefView";
import SubmitView from "./view/SubmitView";

export const routes: IWizardModal[] = [
  {
    id: "brief",
    element: BriefView,
    isActive: (pathname) => !!parseRouteUrl("/brief", pathname),
  },
  {
    id: "form",
    element: FormView,
    isActive: (pathname) => !!parseRouteUrl("/form", pathname),
  },
  {
    id: "submit",
    element: SubmitView,
    isActive: (pathname) => !!parseRouteUrl("/submit", pathname),
  },
];

export default routes;
