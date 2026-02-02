import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "./i18n";
import "./config/setup";
import "./config/dayjs";
import "./config/override";

import {
    ModalProvider,
    OneConfig,
    ScrollAdjust,
    createCustomTag,
    openBlank,
    ModalManagerProvider,
    ErrorBoundary,
    serviceManager,
    ListRules,
    ListSlotFactory,
    sleep,
    ListDefaultSlots,
} from "react-declarative";

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from "chart.js";

import MobileBodyRow from "./slots/MobileBodyRow";

import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";

import createCache from "@emotion/cache";

import AlertProvider from "./components/AlertProvider";
import App from "./components/App";

import { muiTheme } from "./config/muiTheme";
import { mantineTheme } from "./config/mantineTheme";

import OneSlotFactory from "./components/OneSlotFactory";
import ErrorProvider from "./components/ErrorProvider";
import LayoutModalProvider from "./components/LayoutModalProvider";

import ioc from "./lib";

const container = document.getElementById("root")!;

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
);

const muiCache = createCache({
    key: "backtest-kit",
});

createCustomTag(
    "bgcolor-red",
    "background: rgb(255, 229, 229); color: rgb(255, 0, 0);",
);
createCustomTag(
    "bgcolor-green",
    "background: rgb(240, 246, 236); color: rgb(112, 173, 71);",
);
createCustomTag(
    "text-spacer",
    "display: inline-block; padding: 10px; visibility: hidden;",
);
createCustomTag(
    "text-underline",
    "display: inline-block; text-decoration: underline; cursor: not-allowed;",
);
createCustomTag(
    "blank-link",
    "display: inline-block; text-decoration: underline; cursor: pointer;",
    {
        onClick: (e) => {
            const target = e.currentTarget as HTMLSpanElement;
            const href = target.getAttribute("href");
            if (href) {
                openBlank(href);
            }
        },
    },
);

const AppBootstrap = () => {
    return (
        <ErrorBoundary
            history={ioc.routerService}
            onError={ioc.errorService.handleGlobalError}
        >
            <CacheProvider value={muiCache}>
                <ThemeProvider theme={muiTheme}>
                    <MantineProvider theme={mantineTheme}>
                        <ModalProvider>
                            <ModalManagerProvider>
                                <OneSlotFactory>
                                    <ListSlotFactory
                                        MobileBodyRow={MobileBodyRow}
                                        {...ListRules.denceFilterRule}
                                    >
                                        <ErrorProvider>
                                            <LayoutModalProvider>
                                                <AlertProvider>
                                                    <App />
                                                </AlertProvider>
                                            </LayoutModalProvider>
                                        </ErrorProvider>
                                    </ListSlotFactory>
                                </OneSlotFactory>
                            </ModalManagerProvider>
                        </ModalProvider>
                    </MantineProvider>
                </ThemeProvider>
            </CacheProvider>
        </ErrorBoundary>
    );
};

const root = createRoot(container);

OneConfig.setValue({
    WITH_DIRTY_CLICK_LISTENER: true,
    WITH_MOBILE_READONLY_FALLBACK: true,
    WITH_WAIT_FOR_MOVE_LISTENER: true,
    WITH_WAIT_FOR_TAB_LISTENER: true,
    WITH_WAIT_FOR_TOUCH_LISTENER: true,
    WITH_DISMOUNT_LISTENER: true,
    WITH_SYNC_COMPUTE: true,
    CUSTOM_FIELD_DEBOUNCE: 800,
    FIELD_BLUR_DEBOUNCE: 50,
});

ScrollAdjust.setAdjustHeight(25);

const init = async () => {
    await serviceManager.waitForProvide(true);
    await serviceManager.prefetch(true);
    while (!window.Translate) {
        await sleep(500);
    }
    root.render(<AppBootstrap />);
};

document.addEventListener("wheel", () => {
    const activeElement = document.activeElement as HTMLInputElement;
    if (activeElement && activeElement.type === "number") {
        activeElement.blur();
    }
});

init();
