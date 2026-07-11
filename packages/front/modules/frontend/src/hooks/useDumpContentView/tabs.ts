import { ITabsStep } from "react-declarative";
import { t } from "../../i18n";

export const tabs: ITabsStep[] = [
    {
        id: "markdown",
        label: t("Markdown"),
        isVisible: ({ mimeType }) => mimeType === "text/markdown",
    },
    {
        id: "content",
        label: t("Content"),
    },
];

export default tabs;
