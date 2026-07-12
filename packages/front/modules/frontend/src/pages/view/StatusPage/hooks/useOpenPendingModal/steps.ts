import { IWizardStep } from "react-declarative";
import { t } from "../../../../../i18n";

const steps: IWizardStep[] = [
  {
    id: "brief",
    label: t("Briefing"),
  },
  {
    id: "form",
    label: t("Input"),
  },
  {
    id: "submit",
    label: t("Opening"),
  },
];

export default steps;
