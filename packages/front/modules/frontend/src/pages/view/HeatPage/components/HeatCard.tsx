import { makeStyles } from "../../../../styles";

import Paper from "@mui/material/Paper";

import {
    OneTyped,
    FieldType,
    TypedField,
} from "react-declarative";

import { IHeatmapRow } from "backtest-kit";
import { Typography } from "@mui/material";
import IconPhoto from "../../../../components/common/IconPhoto";

const useStyles = makeStyles()((theme) => ({
    root: {
        position: "relative",
        background: "#0001",
        overflow: "hidden",
    },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        height: "48px",
        width: "calc(100% - 16px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginLeft: "8px",
        marginRight: "8px",
    },
    container: {
        marginTop: "48px",
        width: "100%",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        display: "flex",
        width: "100%",
        padding: theme.spacing(1),
        paddingBottom: theme.spacing(2),
        gap: 10,
        flexDirection: "column",
    },
    avatar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "128px",
        minWidth: "128px",
    },
}));

const fields: TypedField<IHeatmapRow>[] = [
    {
        type: FieldType.Text,
        name: "totalPnl",
        title: "Total PNL",
        compute: (obj) => (obj.totalPnl !== null ? `${obj.totalPnl.toFixed(2)}%` : "N/A"),
        readonly: true,
    },
    {
        type: FieldType.Text,
        columns: "6",
        name: "winRate",
        title: "Win Rate",
        compute: (obj) => (obj.winRate !== null ? `${obj.winRate.toFixed(2)}%` : "N/A"),
        readonly: true,
    },
    {
        type: FieldType.Text,
        columns: "6",
        name: "profitFactor",
        title: "Profit Factor",
        compute: (obj) => (obj.profitFactor !== null ? obj.profitFactor.toFixed(2) : "N/A"),
        readonly: true,
    },
    {
        type: FieldType.Text,
        columns: "6",
        name: "maxDrawdown",
        title: "Max Drawdown",
        compute: (obj) => (obj.maxDrawdown !== null ? `${obj.maxDrawdown.toFixed(2)}%` : "N/A"),
        readonly: true,
    },
    {
        type: FieldType.Text,
        columns: "6",
        name: "expectancy",
        title: "Expectancy",
        compute: (obj) => (obj.expectancy !== null ? `${obj.expectancy.toFixed(2)}%` : "N/A"),
        readonly: true,
    },
    {
        type: FieldType.Text,
        fieldBottomMargin: "0",
        name: "totalTrades",
        title: "Trades",
        readonly: true,
    },
];

interface IHeatCardProps {
    row: IHeatmapRow;
}

export const HeatCard = ({ row }: IHeatCardProps) => {
    const { classes } = useStyles();

    return (
        <Paper className={classes.root}>
            <div className={classes.header}>
                <Typography variant="h6" sx={{ opacity: 0.8 }}>
                    {row.symbol}
                </Typography>
            </div>
            <div className={classes.container}>
                <div className={classes.content}>
                    <div className={classes.avatar}>
                        <IconPhoto symbol={row.symbol} sx={{ width: 128, height: 128 }} />
                    </div>
                    <OneTyped handler={() => row} fields={fields} sx={{ mb: 2 }} />
                </div>
            </div>
        </Paper>
    );
};

export default HeatCard;
