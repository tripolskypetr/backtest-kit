import { ITabsStep } from "react-declarative";

export const tabs: ITabsStep[] = [
    {
        id: "markdown",
        label: "Markdown",
        isVisible: ({ mimeType }) => mimeType === "text/markdown",
    },
    {
        id: "content",
        label: "Content",
    },
];

export default tabs;
