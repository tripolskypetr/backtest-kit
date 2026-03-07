import { IconButton, Paper, SxProps, Typography } from "@mui/material";
import StatusModel from "../../model/Status.model";
import { makeStyles } from "../../styles";
import { Info } from "@mui/icons-material";
import ioc from "../../lib";
import StockChart from "./components/StockChart";
import { AutoSizer, LoaderView, useAsyncValue } from "react-declarative";

interface IStatusWidgetProps {
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
    title: {
        opacity: 0.5,
        padding: 0,
        margin: 0,
        height: HEADER_HEIGHT,
        display: "flex",
        alignItems: "center",
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
        display: "flex",
        flex: 1,
    },
}));

export const StatusWidget = ({
    className,
    style,
    sx,
    data,
}: IStatusWidgetProps) => {
    const { classes } = useStyles();

    const [candles, { loading }] = useAsyncValue(
        async () => {
            return await ioc.exchangeViewService.getSignalCandles(
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
            <AutoSizer>
                {({ height, width }) => (
                    <StockChart
                        items={candles}
                        source="1m"
                        height={height}
                        width={width}
                        position={data.position}
                        pendingAt={data.pendingAt}
                        priceOpen={data.priceOpen}
                        priceStopLoss={data.priceStopLoss}
                        priceTakeProfit={data.priceTakeProfit}
                        originalPriceOpen={data.originalPriceOpen}
                        originalPriceStopLoss={data.originalPriceStopLoss}
                        originalPriceTakeProfit={data.originalPriceTakeProfit}
                    />
                )}
            </AutoSizer>
        );
    };

    return (
        <Paper className={classes.root}>
            <div className={classes.header}>
                <Typography className={classes.title} variant="body1">
                    Current Status
                </Typography>
                <IconButton
                    className={classes.icon}
                    size="small"
                    onClick={() => ioc.layoutService.pickSignal(data.signalId)}
                >
                    <Info />
                </IconButton>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>{renderInner()}</div>
            </div>
        </Paper>
    );
};

export default StatusWidget;
