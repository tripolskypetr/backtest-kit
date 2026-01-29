import {
    Spinner,
    Switch,
    serviceManager,
    singleshot,
    useOnce,
} from "react-declarative";
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import routes from "../config/routes";

import getRouteItem from "../utils/getRouteItem";
import AppHeader from "./common/AppHeader";
import { makeStyles } from "../styles";
import { ioc } from "../lib";
import BottomImage from "./common/BottomImage";

const Loader = () => (
    <Box
        sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            height: "100vh",
            width: "100vw",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            background: (theme) => theme.palette.background.paper,
        }}
    >
        <Spinner />
    </Box>
);

const Fragment = () => <></>;

const useStyles = makeStyles()((theme) => ({
    switch: {
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
    }
}));

const handleInit = singleshot(async () => {
    await serviceManager.waitForProvide(true);
    await serviceManager.prefetch(true);
});

const handleLoadStart = () => {
    ioc.layoutService.setAppbarLoader(true);
};

const handleLoadEnd = () => {
    ioc.layoutService.setAppbarLoader(false);
};

const App = () => {

    const { classes } = useStyles();

    const [item, setItem] = useState(getRouteItem);

    const [pathname, setPathname] = useState(
        ioc.routerService.location.pathname,
    );
    const [hasAppbarLoader, setHasAppbarLoader] = useState(
        ioc.layoutService.hasAppbarLoader,
    );
    const [hasModalLoader, setHasModalLoader] = useState(
        ioc.layoutService.hasModalLoader,
    );

    const hasAppHeader = useMemo(() => {
      return !item?.noHeader;
    }, [item]);

    useOnce(() =>
        ioc.routerService.reloadSubject.subscribe(() => {
            setItem(getRouteItem());
            setPathname(ioc.routerService.location.pathname);
        }),
    );

    useOnce(() =>
        ioc.layoutService.appbarSubject.subscribe(() => {
            setHasAppbarLoader(ioc.layoutService.hasAppbarLoader);
        }),
    );

    useOnce(() =>
        ioc.layoutService.modalSubject.subscribe(() => {
            setHasModalLoader(ioc.layoutService.hasModalLoader);
        }),
    );

    return (
        <>
            {hasAppHeader && (
              <AppHeader loading={hasAppbarLoader} />
            )}
            <Switch
                className={classes.switch}
                Loader={Fragment}
                history={ioc.routerService}
                items={routes}
                fallback={ioc.errorService.handleGlobalError}
                onLoadStart={handleLoadStart}
                onLoadEnd={handleLoadEnd}
                onInit={handleInit}
            />
            {hasModalLoader && <Loader />}
            <BottomImage />
        </>
    );
};

export default App;
