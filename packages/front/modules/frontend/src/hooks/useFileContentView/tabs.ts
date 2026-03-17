import { ITabsStep } from "react-declarative";

export const tabs: ITabsStep[] = [
    {
        id: "content",
        label: "Content",
    },
    {
        id: "markdown",
        label: "Markdown",
        isVisible: ({ mimeType }) => mimeType === "text/markdown",
    },
];

export default tabs;
