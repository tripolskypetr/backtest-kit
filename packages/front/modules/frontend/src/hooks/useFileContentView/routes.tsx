import { IOutletModal } from "react-declarative";
import ContentView from "./view/ContentView";
import MarkdownView from "./view/MarkdownView";

export const routes: IOutletModal[] = [
    {
        id: "content",
        element: ContentView,
        isActive: (pathname) => pathname.includes("/file_content/content"),
    },
    {
        id: "markdown",
        element: MarkdownView,
        isActive: (pathname) => pathname.includes("/file_content/markdown"),
    },
];

export default routes;
