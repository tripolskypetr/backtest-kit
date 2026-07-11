import {
    Box,
    Breadcrumbs,
    Divider,
    IconButton,
    Link,
    Stack,
    Typography,
} from "@mui/material";
import {
    Async,
    dayjs,
    formatAmount,
    trycatch,
    typo,
    useAsyncValue,
    useOnce,
    useReloadTrigger,
} from "react-declarative";
import { reloadSubject } from "../../../../config/emitters";
import Tooltip from "../../../../components/common/Tooltip";
import { CloudSync } from "@mui/icons-material";
import getPriceScale from "../../../../utils/getPriceScale";
import ioc from "../../../../lib";
import { t } from "../../../../i18n";

const RUNTIME_INFO_TTL = 15_000;

export const NavigationView = () => {
    const { reloadTrigger, doReload } = useReloadTrigger(RUNTIME_INFO_TTL);

    const [value, { execute }] = useAsyncValue(
        async () => {
            ioc.runtimeViewService.getRuntimeInfo.clear();
            const fetch = trycatch(ioc.runtimeViewService.getRuntimeInfo, {
                defaultValue: null,
            });
            return await fetch();
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [reloadTrigger],
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const renderInner = () => {
        if (!value) {
            return null;
        }
        const { symbol, when, currentPrice, backtest } = value;
        return (
            <Tooltip
                placement="bottom"
                description={backtest ? t("Backtest mode") : t("Live mode")}
            >
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                        display: {
                            xs: "none",
                            sm: "flex",
                        },
                        cursor: "pointer",
                        userSelect: "none",
                    }}
                    onClick={() => {
                        ioc.runtimeViewService.getRuntimeInfo.clear();
                        doReload();
                    }}
                >
                    <IconButton size="small">
                        <CloudSync />
                    </IconButton>
                    <Typography
                        variant="body2"
                        sx={{
                            opacity: 0.5,
                        }}
                    >
                        {t("Symbol")}:
                        {typo.nbsp}
                        <b>{symbol}</b>
                    </Typography>
                    <Divider orientation="vertical" flexItem />
                    <Typography
                        variant="body2"
                        sx={{
                            opacity: 0.5,
                        }}
                    >
                        {t("Time")}:
                        {typo.nbsp}
                        <b>{dayjs(when).format("HH:mm DD MMM YYYY")}</b>
                    </Typography>
                    <Divider orientation="vertical" flexItem />
                    <Typography
                        variant="body2"
                        sx={{
                            opacity: 0.5,
                        }}
                    >
                        {t("Price")}:
                        {typo.nbsp}
                        <b>
                            {formatAmount(
                                currentPrice,
                                getPriceScale(currentPrice),
                            )}
                            $
                        </b>
                    </Typography>
                </Stack>
            </Tooltip>
        );
    };

    return (
        <Stack direction="row" alignItems="center">
            <Breadcrumbs aria-label={t("breadcrumb")}>
                <Link
                    underline="always"
                    color="inherit"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                >
                    {t("Main")}
                </Link>
                <Link
                    underline="always"
                    color="inherit"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                >
                    {t("Navigation")}
                </Link>
            </Breadcrumbs>
            <Box flex={1} />
            {renderInner()}
            <Box pr={1} />
        </Stack>
    );
};

export default NavigationView;
