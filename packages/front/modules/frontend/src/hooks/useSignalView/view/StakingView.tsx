import { Box } from "@mui/material";
import { ISignalAccrual } from "backtest-kit";
import {
    AutoSizer,
    Grid,
    IGridColumn,
    IOutletModalProps,
    copyToClipboard,
    dayjs,
    formatAmount,
} from "react-declarative";
import getPriceScale from "../../../utils/getPriceScale";
import { t } from "../../../i18n";
import ioc from "../../../lib";

/** Grid rows need a key; accruals carry none, so the timestamp serves as id */
type AccrualRow = ISignalAccrual & { id: string; idx: number };

const columns: IGridColumn<AccrualRow>[] = [
    {
        field: "idx",
        label: "#",
        minWidth: 85,
        width: () => 85,
        format: ({ idx }) => `${idx + 1}`,
    },
    {
        field: "type",
        label: t("Accrual Type"),
        minWidth: 160,
        width: () => 160,
        format: ({ type }) => t(type),
    },
    {
        field: "note",
        label: t("Note"),
        minWidth: 200,
        width: (fullWidth) => Math.max(fullWidth - 160 - 140 - 160 - 85, 200),
        format: ({ note }) => note || "",
    },
    {
        field: "amount",
        label: t("Amount"),
        minWidth: 140,
        width: () => 140,
        format: ({ type, amount }) => {
            const value = formatAmount(amount, getPriceScale(amount));
            return type === "cash" ? `${value}${t("$")}` : value;
        },
    },
    {
        field: "timestamp",
        label: t("Timestamp"),
        minWidth: 160,
        width: () => 160,
        format: ({ timestamp }) => dayjs(timestamp).format("DD/MM/YYYY HH:mm"),
    },
];

export const StakingView = ({ data }: IOutletModalProps) => {
    const accruals: AccrualRow[] = (data as ISignalAccrual[])
        .sort(({ timestamp: a }, { timestamp: b }) => a - b)
        .map((row, idx) => ({
            ...row,
            idx,
            id: String(row.timestamp),
        }));

    const handleRowClick = async (row: AccrualRow) => {
        if (
            await copyToClipboard(
                JSON.stringify(
                    { ...row, id: undefined, idx: undefined },
                    null,
                    2,
                ),
            )
        ) {
            ioc.alertService.notify(t("Copied!"));
        }
    };

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={accruals}>
                {(size) => (
                    <Grid<AccrualRow>
                        sx={{ height: size.height, width: size.width }}
                        data={accruals}
                        columns={columns}
                        onRowClick={handleRowClick}
                        rowKey="id"
                        noDataLabel={t("No accruals")}
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default StakingView;
