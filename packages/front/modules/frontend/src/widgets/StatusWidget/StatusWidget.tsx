import { Chip, IconButton, Paper, SxProps, Typography } from "@mui/material";
import StatusModel from "../../model/Status.model";
import { makeStyles } from "../../styles";
import { Info } from "@mui/icons-material";
import ioc from "../../lib";
import StockChart from "./components/StockChart";
import {
    AutoSizer,
    LoaderView,
    PaperView,
    useAsyncValue,
} from "react-declarative";

interface IStatusWidgetProps {
    outlinePaper: boolean;
    data: StatusModel;
    className?: string;
    style?: React.CSSProperties;
    sx?: SxProps;
}

const HEADER_HEIGHT = "35px";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#eee",
        overflow: "hidden",
    },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "8px",
        paddingRight: "4px",
        height: HEADER_HEIGHT,
    },
    text: {
        opacity: 0.5,
        padding: 0,
        margin: 0,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
    },
    title: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
    },
    icon: {
        opacity: 0.5,
        transition: "opacity 500ms",
        "&:hover": {
            opacity: 1.0,
        },
    },
    container: {
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(100% - ${HEADER_HEIGHT})`,
        padding: 5,
        width: "100%",
        background: "white",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
    },
    content: {
        position: "relative",
        display: "flex",
        flex: 1,
    },
}));

export const StatusWidget = ({
    outlinePaper,
    className,
    style,
    sx,
    data,
}: IStatusWidgetProps) => {
    const { classes, cx } = useStyles();

    const [candles, { loading }] = useAsyncValue(
        async () => {
            return await ioc.exchangeViewService.getLiveCandles(
                data.signalId,
                "1m",
            );
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
        },
    );

    const renderInner = () => {
        if (!candles || loading) {
            return <LoaderView sx={{ height: "100%", width: "100%" }} />;
        }
        return (
            <AutoSizer style={{ position: "absolute", top: 0, left: 0 }}>
                {({ height, width }) => (
                    <StockChart
                        items={candles}
                        height={height}
                        width={width}
                        position={data.position}
                        status={data.status}
                        pendingAt={data.pendingAt}
                        updatedAt={data.updatedAt}
                        priceOpen={data.priceOpen}
                        timestamp={data.timestamp}
                        priceStopLoss={data.priceStopLoss}
                        priceTakeProfit={data.priceTakeProfit}
                        originalPriceOpen={data.originalPriceOpen}
                        originalPriceStopLoss={data.originalPriceStopLoss}
                        originalPriceTakeProfit={data.originalPriceTakeProfit}
                        minuteEstimatedTime={data.minuteEstimatedTime}
                        positionEntries={data.positionEntries}
                        positionPartials={data.positionPartials}
                    />
                )}
            </AutoSizer>
        );
    };

    const renderChip = () => {
        if (data.position === "long") {
            return (
                <Chip
                    variant="outlined"
                    size="small"
                    color="success"
                    label="LONG"
                />
            );
        }
        if (data.position === "short") {
            return (
                <Chip
                    variant="outlined"
                    size="small"
                    color="error"
                    label="SHORT"
                />
            );
        }
        return null;
    };

    const renderStatus = () => {
        if (data.status) {
            return (
                <Chip
                    variant="outlined"
                    size="small"
                    color="info"
                    label={String(data.status).toUpperCase()}
                />
            );
        }
        return null;
    };

    return (
        <PaperView
            outlinePaper={outlinePaper}
            className={cx(classes.root, className)}
            style={style}
            sx={sx}
        >
            <div className={classes.header}>
                <div className={classes.title}>
                    <Typography className={classes.text} variant="body1">
                        Current Status
                    </Typography>
                    {renderChip()}
                    {renderStatus()}
                </div>
                <IconButton
                    className={classes.icon}
                    disabled={outlinePaper}
                    size="small"
                    onClick={() => ioc.layoutService.pickSignal(data.signalId)}
                >
                    <Info />
                </IconButton>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </PaperView>
    );
};

export default StatusWidget;
