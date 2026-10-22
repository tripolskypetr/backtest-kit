import { ColumnModel } from "../model/Column.model";
import { getPriceScale } from "../helpers/getPriceScale";
import { BudgetEvent } from "../model/BudgetStatistics.model";
import { GLOBAL_CONFIG } from "../config/params";
import { toPlainString } from "../helpers/toPlainString";

/** Quote-currency amount with the price scale of its magnitude */
const FORMAT_MONEY_FN = (value: number): string =>
  `${value.toFixed(getPriceScale(value))} USD`;

/** Signed quote-currency amount (`+12.50 USD` / `-3.00 USD`) */
const FORMAT_SIGNED_FN = (value: number): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(getPriceScale(value))} USD`;

/** `ETH: 1.5, BTC: 0.1` or `-` when nothing is held */
const FORMAT_ASSETS_FN = (assets: Record<string, number>): string => {
  const entries = Object.entries(assets);
  if (!entries.length) {
    return "-";
  }
  return entries.map(([asset, units]) => `${asset}: ${units.toFixed(getPriceScale(units))}`).join(", ");
};

/**
 * Column configuration for budget markdown reports.
 *
 * Defines the table structure for displaying budget journal rows: the action,
 * its subject (reserve id or asset), the amounts involved, and the balance of
 * the budget after the row (capital / deployed / free / assets).
 *
 * @remarks
 * The "note" column visibility is controlled by {@link GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE}.
 *
 * @see BudgetMarkdownService
 * @see ColumnModel
 * @see BudgetEvent
 */
export const budget_columns: ColumnModel<BudgetEvent>[] = [
  {
    key: "type",
    label: "Action",
    format: (data) => (data.type === "reject" ? `REJECT ${data.action.toUpperCase()}` : data.type.toUpperCase()),
    isVisible: () => true,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol ?? "-",
    isVisible: () => true,
  },
  {
    key: "id",
    label: "ID / Asset",
    format: (data) => {
      if (data.type === "reserve" || data.type === "release") {
        return data.id;
      }
      return data.asset;
    },
    isVisible: () => true,
  },
  {
    key: "amount",
    label: "Amount",
    format: (data) => {
      if (data.type === "reject") {
        return data.asset === "capital" ? FORMAT_MONEY_FN(data.requested) : `${data.requested.toFixed(getPriceScale(data.requested))} ${data.asset}`;
      }
      if (data.type === "deposit" || data.type === "withdraw") {
        return `${data.amount.toFixed(getPriceScale(data.amount))} ${data.asset}`;
      }
      return FORMAT_MONEY_FN(data.amount);
    },
    isVisible: () => true,
  },
  {
    key: "pnl",
    label: "PNL",
    format: (data) => (data.type === "release" ? FORMAT_SIGNED_FN(data.pnl) : "-"),
    isVisible: () => true,
  },
  {
    key: "available",
    label: "Available",
    format: (data) => {
      if (data.type !== "reject") {
        return "-";
      }
      return data.asset === "capital" ? FORMAT_MONEY_FN(data.available) : `${data.available.toFixed(getPriceScale(data.available))} ${data.asset}`;
    },
    isVisible: () => true,
  },
  {
    key: "overdraft",
    label: "Overdraft",
    format: (data) => (data.type === "reserve" && data.overdraft !== undefined ? FORMAT_MONEY_FN(data.overdraft) : "-"),
    isVisible: () => true,
  },
  {
    key: "capital",
    label: "Capital",
    format: (data) => FORMAT_MONEY_FN(data.balance.capital),
    isVisible: () => true,
  },
  {
    key: "deployed",
    label: "Deployed",
    format: (data) => FORMAT_MONEY_FN(data.balance.deployed),
    isVisible: () => true,
  },
  {
    key: "free",
    label: "Free",
    format: (data) => FORMAT_MONEY_FN(data.balance.free),
    isVisible: () => true,
  },
  {
    key: "assets",
    label: "Assets",
    format: (data) => FORMAT_ASSETS_FN(data.balance.assets),
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString("note" in data && data.note ? data.note : "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
  {
    key: "mode",
    label: "Mode",
    format: (data) => (data.backtest ? "Backtest" : "Live"),
    isVisible: () => true,
  },
];
