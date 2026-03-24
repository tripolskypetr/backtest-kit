import {
    alpha,
    Avatar,
    Box,
    darken,
    LinearProgress,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import { makeStyles } from "../../styles";
import { ActionMenu, Center, IOption, openBlank } from "react-declarative";
import { GitHub } from "@mui/icons-material";
import { ioc } from "../../lib";
import IconWrapper from "./IconWrapper";
import NotificationView from "./NotificationView";
import { IRouteItem } from "../../config/routes";
import { useMemo } from "react";
import Tooltip from "./Tooltip";

const LOADER_HEIGHT = 4;

const TAB_ACTION_PREFIX = "tab-action-";

const LOGO_SRC = "/logo/icon512_maskable.png";
const LOGO_CLASS = "backtest-kit-logo";
const LOGO_SIDE = 32;

const HEADER_HEIGHT = "80px";
const MARGIN_BOTTOM = "10px";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "sticky",
        top: 0,
        zIndex: 9,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        flexDirection: "column",
    },
    container: {
        flex: 1,
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        gap: "8px",
        paddingRight: "8px",
        position: "relative",
        marginBottom: MARGIN_BOTTOM,
        alignItems: "center",
        backdropFilter: "saturate(180%) blur(20px)",
        backgroundColor: alpha(darken(theme.palette.primary.main, 0.2), 0.8),
        "&:hover": {
            [`& .${LOGO_CLASS}`]: {
                opacity: 1.0,
            },
        },
    },
    title: {
        color: "white",
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(3),
        transition: "opacity 500ms",
        opacity: "0.8",
        cursor: "pointer",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
    },
    loader: {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        minHeight: `${LOADER_HEIGHT}px`,
        maxHeight: `${LOADER_HEIGHT}px`,
        marginTop: `-${LOADER_HEIGHT}px`,
        zIndex: 2,
    },
    logo: {
        transition: "opacity 500ms",
        marginLeft: "8px",
        marginRight: "-6px",
        opacity: "0.5",
    },
    actionMenu: {
        "& svg": {
            color: "white",
        },
    },
    stretch: {
        flex: 1,
    },
    tabsRoot: {
        minHeight: `calc(${HEADER_HEIGHT} - ${MARGIN_BOTTOM})`,
        height: `calc(${HEADER_HEIGHT} - ${MARGIN_BOTTOM})`,
        color: "white",
    },
    tabRoot: {
        minHeight: `calc(${HEADER_HEIGHT} - ${MARGIN_BOTTOM})`,
        height: `calc(${HEADER_HEIGHT} - ${MARGIN_BOTTOM})`,
        color: "white",
    },
    tabIndicator: {
        height: "4px",
        background: "white",
    },
}));

interface IAppHeaderProps {
    routeItem: IRouteItem;
    routeParams: Record<string, string>;
    pathname: string;
    loading: boolean;
}

const default_actions: IOption[] = [
    {
        action: "github-action",
        icon: () => <IconWrapper icon={GitHub} color="#6A1B9A " />,
        label: "Open GitHub",
    },
];

export const AppHeader = ({
    routeItem,
    routeParams,
    pathname,
    loading,
}: IAppHeaderProps) => {
    const { classes, cx } = useStyles();

    const { activeTabPath, tabs } = useMemo(() => {
        if (!routeItem.tabs) {
            return {
                tabs: [],
                activeTabPath: "",
            };
        }
        const activeTab = routeItem.tabs.find(({ isActive }) =>
            isActive({ routeItem, routeParams, pathname }),
        );
        return {
            activeTabPath: activeTab?.path ?? "",
            tabs: routeItem.tabs,
        };
    }, [routeItem, routeParams, pathname]);

    const actions = useMemo((): IOption[] => {
        if (!activeTabPath) {
            return default_actions;
        }
        return tabs
            .filter(
                ({ isActive }) =>
                    !isActive({ pathname, routeItem, routeParams }),
            )
            .map(({ label, icon: Icon }, idx) => ({
                label,
                action: `${TAB_ACTION_PREFIX}${idx}`,
                icon: Icon
                    ? () => <IconWrapper icon={Icon} color="#4caf50" />
                    : undefined,
            }));
    }, [activeTabPath, tabs]);

    const handleTabNavigate = (action: string) => {
        const index = parseInt(action.slice(TAB_ACTION_PREFIX.length));
        const targetTab = tabs
            .filter(
                ({ isActive }) =>
                    !isActive({ pathname, routeItem, routeParams }),
            )
            .find((_, idx) => idx === index);
        if (targetTab) {
            targetTab.navigate({
                routeItem,
                routeParams,
                pathname,
            });
        }
    };

    const handleAction = async (action: string) => {
        if (action === "github-action") {
            openBlank("https://github.com/tripolskypetr/backtest-kit");
        }
        if (action.startsWith(TAB_ACTION_PREFIX)) {
            handleTabNavigate(action);
        }
    };

    if (routeItem.noHeader) {
        return null;
    }

    const renderTabs = () => {
        if (!tabs.length) {
            return null;
        }
        return (
            <Tabs
                key={routeItem.path}
                variant="scrollable"
                value={activeTabPath}
                textColor="inherit"
                sx={{ display: { xs: "none", sm: "flex" } }}
                classes={{
                    root: classes.tabsRoot,
                    indicator: classes.tabIndicator,
                }}
            >
                {tabs
                    .filter(({ visible = true }) => visible)
                    .map(
                        (
                            {
                                label,
                                icon: Icon,
                                disabled,
                                path,
                                description,
                                navigate,
                            },
                            idx,
                            tabs,
                        ) => (
                            <Tab
                                sx={{
                                    minWidth: 128,
                                    fontWeight: "bold",
                                    mr: idx < tabs.length - 1 ? 2 : 0,
                                }}
                                key={`${path}-${idx}`}
                                value={path}
                                label={
                                    <Tooltip description={description} placement="bottom">
                                        <Typography variant="h6">
                                            {label}
                                        </Typography>
                                    </Tooltip>
                                }
                                onClick={() =>
                                    navigate({
                                        routeItem,
                                        routeParams,
                                        pathname,
                                    })
                                }
                                disabled={disabled}
                                icon={Icon && <Icon />}
                                iconPosition="start"
                                classes={{
                                    root: classes.tabRoot,
                                }}
                            />
                        ),
                    )}
            </Tabs>
        );
    };

    return (
        <Box className={classes.root}>
            <Box className={classes.container}>
                <Center
                    onClick={() => ioc.routerService.push("/main")}
                    className={cx(classes.logo, LOGO_CLASS)}
                >
                    <Avatar
                        style={{ height: LOGO_SIDE, width: LOGO_SIDE }}
                        src={LOGO_SRC}
                    />
                </Center>
                <Typography
                    variant="h4"
                    onClick={() => ioc.routerService.push("/main")}
                    className={cx(classes.title, LOGO_CLASS)}
                    sx={{ display: { xs: "none", sm: "flex" }, whiteSpace: "nowrap" }}
                >
                    Backtest Kit
                </Typography>
                {renderTabs()}
                <div className={classes.stretch} />
                <NotificationView />
                <ActionMenu
                    className={classes.actionMenu}
                    sx={{
                        ml: {
                            xs: 1,
                            md: 2,
                        },
                        mr: {
                            xs: 1,
                            sm: 2,
                        },
                    }}
                    transparent
                    onAction={handleAction}
                    options={actions}
                />
                {!!loading && <LinearProgress className={classes.loader} />}
            </Box>
        </Box>
    );
};

export default AppHeader;
