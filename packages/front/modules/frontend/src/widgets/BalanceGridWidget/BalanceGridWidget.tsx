import { dayjs, formatAmount, Grid, IGridColumn, typo } from "react-declarative";
import { Box, MenuItem, Paper, Stack, TextField } from "@mui/material";
import { SxProps } from "@mui/system";
import { useMemo, useState } from "react";

import { TBudgetHistoryRow } from "../../model/Budget.model";
import { t } from "../../i18n";

interface IBalanceGridWidgetProps {
  sx: SxProps;
  items: TBudgetHistoryRow[];
}

type RowType = TBudgetHistoryRow["type"];

/** Flat view of a journal row: every column reads its own field */
interface GridItem {
  id: string;
  /** Position in the journal, from 1 in journal order; stable under filters */
  index: number;
  timestamp: number;
  type: RowType;
  symbol: string | null;
  /** What the row acted on: the reserve id, the asset, or the refused action */
  detail: string;
  /** The money or units the row moved; for a rejection, what was asked for */
  amount: number;
  /** Units label for deposit / withdraw rows */
  asset: string | null;
  /** What was available when a rejection happened */
  available: number | null;
  /** Realized pnl of a release row */
  pnl: number | null;
  /** Free balance after the row */
  free: number;
  overdraft: number | null;
  note: string;
}

const ALL = "all";

/** Row backgrounds: a refused action and a reserve that went into overdraft must stand out */
const REJECT_COLOR = "#dd404955";
const OVERDRAFT_COLOR = "#f3a43a55";

const TYPE_COLOR: Record<RowType, string> = {
  reserve: "#1976D2",
  release: "#2EA96F",
  deposit: "#7E57C2",
  withdraw: "#F57C00",
  reject: "#DD4049",
};

const TYPE_LABEL: Record<RowType, string> = {
  reserve: t("Reserve"),
  release: t("Release"),
  deposit: t("Deposit"),
  withdraw: t("Withdraw"),
  reject: t("Reject"),
};

const TO_GRID_ITEM_FN = (row: TBudgetHistoryRow, index: number): GridItem => {
  const base = {
    id: `${row.timestamp}:${row.seq}`,
    index,
    timestamp: row.timestamp,
    type: row.type,
    symbol: row.symbol,
    free: row.balance.free,
  };
  if (row.type === "reserve") {
    return {
      ...base,
      detail: row.id,
      amount: row.amount,
      asset: null,
      available: null,
      pnl: null,
      overdraft: row.overdraft ?? null,
      note: row.note ?? "",
    };
  }
  if (row.type === "release") {
    return {
      ...base,
      detail: row.id,
      amount: row.amount,
      asset: null,
      available: null,
      pnl: row.pnl,
      overdraft: null,
      note: row.note ?? "",
    };
  }
  if (row.type === "reject") {
    return {
      ...base,
      detail: `${TYPE_LABEL[row.action]} ${row.asset}`,
      amount: row.requested,
      asset: row.asset,
      available: row.available,
      pnl: null,
      overdraft: null,
      note: "",
    };
  }
  return {
    ...base,
    detail: row.asset,
    amount: row.amount,
    asset: row.asset,
    available: null,
    pnl: null,
    overdraft: null,
    note: row.note ?? "",
  };
};

const getRowColor = (row: GridItem): string => {
  if (row.type === "reject") {
    return REJECT_COLOR;
  }
  if (row.overdraft !== null) {
    return OVERDRAFT_COLOR;
  }
  return "transparent";
};

const columns: IGridColumn<GridItem>[] = [
  {
    field: "index",
    label: "#",
    minWidth: 60,
    width: () => 60,
    format: ({ index }) => String(index),
  },
  {
    field: "type",
    label: t("Type"),
    minWidth: 90,
    width: () => 90,
    format: ({ type, overdraft }) => (
      <span
        style={{
          color: TYPE_COLOR[type],
          fontWeight: "bold",
          fontSize: "11px",
        }}
      >
        {TYPE_LABEL[type]}
        {overdraft !== null ? ` (${t("Overdraft")})` : ""}
      </span>
    ),
  },
  {
    field: "symbol",
    label: t("Symbol"),
    minWidth: 100,
    width: () => 100,
    format: ({ symbol }) => symbol ?? typo.nbsp,
  },
  {
    field: "detail",
    label: t("Detail"),
    minWidth: 160,
    width: () => 160,
    format: ({ detail }) => (
      <Box
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </Box>
    ),
  },
  {
    field: "amount",
    label: t("Amount"),
    minWidth: 120,
    width: () => 120,
    format: ({ type, amount, asset, available }) => {
      if (type === "reject") {
        return (
          <span style={{ color: TYPE_COLOR.reject }}>
            {formatAmount(amount)} / {formatAmount(available ?? 0)}
          </span>
        );
      }
      if (type === "deposit" || type === "withdraw") {
        return `${type === "deposit" ? "+" : "-"}${formatAmount(amount)} ${asset}`;
      }
      return `${type === "reserve" ? "-" : "+"}${formatAmount(amount)}${t("$")}`;
    },
  },
  {
    field: "pnl",
    label: t("PNL $"),
    minWidth: 100,
    width: () => 100,
    format: ({ pnl }) => {
      if (pnl === null) {
        return typo.nbsp;
      }
      const isProfit = pnl >= 0;
      return (
        <span style={{ color: isProfit ? "green" : "red" }}>
          {isProfit ? "+" : ""}
          {formatAmount(pnl)}$
        </span>
      );
    },
  },
  {
    field: "free",
    label: t("Free after"),
    minWidth: 120,
    width: () => 120,
    format: ({ free }) => (
      <span style={{ color: free < 0 ? "red" : "inherit" }}>
        {formatAmount(free)}{t("$")}
      </span>
    ),
  },
  {
    field: "note",
    label: t("Note"),
    minWidth: 160,
    width: (fullWidth) => Math.max(fullWidth - 60 - 90 - 100 - 160 - 120 - 100 - 120 - 130, 160),
    format: ({ note }) => (
      <Box
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {note || typo.nbsp}
      </Box>
    ),
  },
  {
    field: "timestamp",
    label: t("Date"),
    minWidth: 130,
    width: () => 130,
    format: ({ timestamp }) => dayjs(timestamp).format("DD/MM/YYYY HH:mm"),
  },
];

export const BalanceGridWidget = ({ sx, items }: IBalanceGridWidgetProps) => {
  const [type, setType] = useState<string>(ALL);
  const [symbol, setSymbol] = useState<string>(ALL);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const row of items) {
      if (row.symbol) {
        set.add(row.symbol);
      }
    }
    return Array.from(set).sort();
  }, [items]);

  const data = useMemo((): GridItem[] => {
    // Number the whole journal first so a filtered view keeps the journal positions,
    // then newest (largest #) on top
    return items
      .map((row, idx) => TO_GRID_ITEM_FN(row, idx + 1))
      .filter((row) => type === ALL || row.type === type)
      .filter((row) => symbol === ALL || row.symbol === symbol)
      .sort((a, b) => b.index - a.index);
  }, [items, type, symbol]);

  return (
    <Paper
      sx={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        flexDirection: "column",
        overflow: "clip",
        ...sx,
      }}
    >
      <Stack
        direction="row"
        gap={1}
        sx={{
          p: 1,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <TextField
          select
          size="small"
          label={t("Type")}
          value={type}
          onChange={({ target }) => setType(target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value={ALL}>{t("All types")}</MenuItem>
          {(Object.keys(TYPE_LABEL) as RowType[]).map((key) => (
            <MenuItem key={key} value={key}>
              {TYPE_LABEL[key]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={t("Symbol")}
          value={symbol}
          onChange={({ target }) => setSymbol(target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value={ALL}>{t("All symbols")}</MenuItem>
          {symbols.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Grid
        sx={{ flex: 1, background: "transparent !important" }}
        rowColor={getRowColor}
        hasMore={false}
        loading={false}
        onSkip={() => undefined}
        data={data}
        columns={columns}
      />
    </Paper>
  );
};

export default BalanceGridWidget;
