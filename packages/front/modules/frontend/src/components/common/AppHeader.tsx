import {
    alpha,
    Avatar,
    Box,
    darken,
    lighten,
    LinearProgress,
    Typography,
} from "@mui/material";
import { makeStyles } from "../../styles";
import {
    ActionMenu,
    Center,
    FieldType,
    IOption,
    openBlank,
    reloadPage,
    sleep,
    TypedField,
    useAlert,
    useOne,
    usePrompt,
    useSinglerunAction,
} from "react-declarative";
import {
    AccountBalance,
    Announcement,
    GitHub,
    Logout,
    MonetizationOn,
    Newspaper,
    Refresh,
    ShoppingCart,
    Twitter,
} from "@mui/icons-material";
import { ioc } from "../../lib";
import IconWrapper from "./IconWrapper";
import { defaultSlots } from "../OneSlotFactory";
import NotificationView from "./NotificationView";

const LOADER_HEIGHT = 4;

const LOGO_SRC = "/logo/icon512_maskable.png";
const LOGO_CLASS = "tradegpt-logo";
const LOGO_SIDE = 32;

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "sticky",
        top: 0,
        zIndex: 9,
        height: "80px",
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
        marginBottom: "10px",
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
}));

interface IAppHeaderProps {
    loading: boolean;
}

const actions: IOption[] = [
    {
        action: "github-action",
        icon: () => <IconWrapper icon={GitHub} color="#101411" />,
        label: "Open GitHub",
    },
];

export const AppHeader = ({ loading }: IAppHeaderProps) => {
    const { classes, cx } = useStyles();

    const handleAction = async (action: string) => {
        if (action === "reload-action") {
            openBlank("https://github.com/tripolskypetr/backtest-kit");
        }
    };

    return (
        <Box className={classes.root}>
            <Box className={classes.container}>
                <Center
                    onClick={() =>
                        openBlank(
                            "https://github.com/tripolskypetr/backtest-kit",
                        )
                    }
                    className={cx(classes.logo, LOGO_CLASS)}
                >
                    <Avatar
                        style={{ height: LOGO_SIDE, width: LOGO_SIDE }}
                        src={LOGO_SRC}
                    />
                </Center>
                <Typography
                    variant="h4"
                    onClick={() =>
                        openBlank(
                            "https://github.com/tripolskypetr/backtest-kit",
                        )
                    }
                    className={cx(classes.title, LOGO_CLASS)}
                    sx={{ display: { xs: "none", sm: "flex" } }}
                >
                    Backtest Kit
                </Typography>
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
