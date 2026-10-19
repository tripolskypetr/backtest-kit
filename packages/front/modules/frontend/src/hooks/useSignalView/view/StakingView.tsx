import { Box } from "@mui/material";
import { ISignalAccrual } from "backtest-kit";
import {
    AutoSizer,
    Grid,
    IGridColumn,
    IOutletModalProps,
    dayjs,
    formatAmount,
} from "react-declarative";
import getPriceScale from "../../../utils/getPriceScale";
import { t } from "../../../i18n";

/** Grid rows need a key; accruals carry none, so the timestamp serves as id */
type AccrualRow = ISignalAccrual & { id: string };

const columns: IGridColumn<AccrualRow>[] = [
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
        width: (fullWidth) => Math.max(fullWidth - 160 - 140 - 160, 200),
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
    const accruals: AccrualRow[] = (data as ISignalAccrual[]).map((row) => ({
        ...row,
        id: String(row.timestamp),
    }));
    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={accruals}>
                {(size) => (
                    <Grid<AccrualRow>
                        sx={{ height: size.height, width: size.width }}
                        data={accruals}
                        columns={columns}
                        rowKey="id"
                        noDataLabel={t("No accruals")}
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default StakingView;
