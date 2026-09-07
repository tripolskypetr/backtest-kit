import { memoize, trycatch, errorData, getErrorMessage, randomString } from "functools-kit";
import backtest from "../lib";
import { Exchange } from "./Exchange";
import { Live } from "./Live";
import { StorageLive } from "./Storage";
import { NotificationLive } from "./Notification";
import { Log } from "./Log";
import {
  IMCPAverageBuyCommand,
  IMCPContext,
  IMCPMessage,
  IMCPPositionCloseCommand,
  IMCPPositionOpenCommand,
  IMCPSignalNotifyCommand,
  MCPName,
  MCPPermission,
} from "../interfaces/MCP.interface";
import { ISignalDto, StrategyName } from "../interfaces/Strategy.interface";
import { ILogEntry } from "../interfaces/Logger.interface";
import { NotificationModel } from "../model/Notification.model";
import { errorEmitter } from "../config/emitters";
import alignToInterval from "../utils/alignToInterval";
import { getConfig } from "../function/setup";
import { Position } from "./Position";
import { GLOBAL_CONFIG } from "../config/params";
import toPlainString from "../helpers/toPlainString";

const METHOD_NAME_GET_STATUS = "MCPUtils.getStatus";
const METHOD_NAME_GET_DEFAULT_MESSAGES = "MCPUtils.getDefaultMessages";
const METHOD_NAME_GET_HISTORY_MESSAGES = "MCPUtils.getHistoryMessages";
const METHOD_NAME_GET_NOTIFICATION_MESSAGES = "MCPUtils.getNotificationMessages";
const METHOD_NAME_GET_AGENT_MESSAGES = "MCPUtils.getAgentMessages";
const METHOD_NAME_COMMIT_POSITION_OPEN = "MCPUtils.commitPositionOpen";
const METHOD_NAME_COMMIT_POSITION_CLOSE = "MCPUtils.commitPositionClose";
const METHOD_NAME_COMMIT_AVERAGE_BUY = "MCPUtils.commitAverageBuy";
const METHOD_NAME_COMMIT_SIGNAL_NOTIFY = "MCPUtils.commitSignalNotify";

/** Grid step (percent) the hard stop-loss distance snaps to. */
const HARD_STOP_STEP_PERCENT = 2.5;

/**
 * Default depth of the trade history feed (getHistoryMessages).
 *
 * Ten closed trades are enough to answer the question the history exists for
 * — "have I already traded this idea, and how did it end" — while staying
 * cheap in agent context: each row carries result, close reason, timings and
 * the opening description. Deeper history rarely changes an exit decision but
 * grows the prompt linearly.
 *
 * The caller overrides it per call via the `limit` argument. Rows are sorted
 * newest-first before the cut, so any limit drops the OLDEST trades.
 */
const DEFAULT_HISTORY_LIMIT = 10;

/**
 * Default depth of the trading system directives feed (getAgentMessages).
 *
 * Directives written by the strategy via `Log.agent(...)` are instructions to
 * act on RIGHT NOW — "this position has been stagnating for an hour, look for
 * an efficient exit". Five keeps the freshest ones visible without letting a
 * chatty strategy flood the prompt; older directives have usually been
 * superseded by the newer ones anyway.
 *
 * The caller overrides it per call via the `limit` argument. Rows are sorted
 * newest-first before the cut, so any limit drops the OLDEST directives.
 */
const DEFAULT_AGENT_LIMIT = 5;

/**
 * Default depth of the active-position notes feed (getNotificationMessages).
 *
 * These are the agent's own notes on positions that are open right now, so
 * the feed is naturally bounded by the number of open positions times the
 * notes per position. Twenty covers a portfolio of several symbols each
 * carrying a few observations, and the closed-position notes drop out on
 * their own once the signal id stops matching.
 *
 * The caller overrides it per call via the `limit` argument. Rows are sorted
 * newest-first before the cut, so any limit drops the OLDEST notes.
 */
const DEFAULT_NOTIFICATION_LIMIT = 20;

/**
 * Human-readable label for every notification type the annotated event feed
 * renders, keyed by the raw type the engine emits.
 *
 * The agent reads plain events ("position close requested"), never the wire
 * names ("close_pending.commit"), so a technical identifier never leaks into
 * the prompt. The keys double as the feed's whitelist: a type absent from
 * this map is not rendered at all.
 */
const NOTIFICATION_TYPE_LABEL = {
  "signal.opened": "position opened",
  "close_pending.commit": "position close requested",
  "signal.closed": "position closed",
  "average_buy.commit": "position averaged (DCA entry added)",
  "signal.info": "note on an open position",
} as const;

/** Notification types the annotated event feed renders. */
type NotificationEventType = keyof typeof NOTIFICATION_TYPE_LABEL;

/**
 * Narrows a stored notification to the types the annotated event feed knows
 * how to render.
 *
 * `type in NOTIFICATION_TYPE_LABEL` alone does not narrow the union for
 * TypeScript, so the whitelist check is expressed as a type predicate — the
 * map stays the single source of truth for which events reach the agent.
 *
 * @param row - Stored notification of any type
 * @returns True when the feed renders this notification type
 */
const IS_EVENT_NOTIFICATION_FN = (
  row: NotificationModel,
): row is Extract<NotificationModel, { type: NotificationEventType }> =>
  row.type in NOTIFICATION_TYPE_LABEL;

/**
 * Computes the hard stop-loss distance percent for an opened position.
 *
 * Snaps the configured max stop-loss distance to a {@link HARD_STOP_STEP_PERCENT} grid
 * (rounded to the nearest step), then steps one notch down so the result stays strictly
 * below CC_MAX_STOPLOSS_DISTANCE_PERCENT — which the signal validator rejects at the
 * boundary (e.g. 20% config yields 20.008% after price rounding).
 *
 * @param maxDistance - CC_MAX_STOPLOSS_DISTANCE_PERCENT
 * @returns Hard stop-loss distance in percent (e.g. 11 -> 7.5, 10 -> 7.5, 20 -> 17.5)
 */
const COMPUTE_HARD_STOP_FN = (maxDistance: number): number =>
  Math.round(maxDistance / HARD_STOP_STEP_PERCENT) * HARD_STOP_STEP_PERCENT -
  HARD_STOP_STEP_PERCENT;

/**
 * Formats a signed value for agent messages: explicit "+" on non-negative,
 * two decimals (e.g. 1.5 -> "+1.50", -2.3 -> "-2.30").
 *
 * @param value - Number to format
 * @returns Signed fixed-point string
 */
const FORMAT_SIGNED_FN = (value: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

/**
 * Resolves the emit time of a log entry for the agent-facing feed.
 *
 * The execution context's `when` wins: it is the trading engine's own clock —
 * the timeline the strategy was running on when it wrote the entry, and the
 * same clock every other renderer stamps into its messages. The entry's
 * `timestamp` is the fallback for entries written outside an execution scope,
 * where no engine time exists to read.
 *
 * @param entry - Log entry to date
 * @returns Emit time in milliseconds
 */
const GET_ENTRY_TIMESTAMP_FN = (entry: ILogEntry): number =>
  entry.executionContext
    ? new Date(entry.executionContext.when).getTime()
    : entry.timestamp;

/**
 * Default portfolio-to-text renderer for the MCP (Model Context Protocol) agent.
 *
 * Emits one header message — snapshot time plus a portfolio summary: open
 * position count, total invested, total unrealized PnL in USD (percent of
 * invested alongside) and a per-position dollar PnL list. Dollars lead
 * everywhere: entry prices differ across positions, so percents are not
 * comparable between them — USD is the common denominator the tactical exit
 * decision reads. Then one text message per traded symbol:
 * capital balance, the queued entry order (createdSignal), the active
 * position (pendingSignal) and the queued close order (closedSignal).
 * A symbol holding a position is rendered PnL-first: entry and current price,
 * unrealized PnL percent (net of entry/exit fees and slippage — the pnl
 * contract adjusts both legs), peak profit and max drawdown percents with the
 * minutes elapsed since each extreme (_peak/_fall timestamps), the open time
 * and the minutes left until time_expired (or an explicit "perpetual hold"
 * when minuteEstimatedTime is Infinity). A symbol with no position shows the
 * current price alone — no PnL exists there. Slots without data are stated
 * explicitly so the agent never has to guess whether a field was omitted or
 * empty.
 */
const DEFAULT_GET_MESSAGES = (
  context: IMCPContext,
  when: Date,
): IMCPMessage[] => {
  const symbols = Object.keys(context);
  if (!symbols.length) {
    return [
      {
        id: randomString(),
        type: "text",
        text: `Portfolio status at ${when.toISOString()}: no symbols are enabled for live trading.`,
      },
    ];
  }
  const openPositions = symbols.flatMap((symbol) => {
    const { pendingSignal } = context[symbol];
    return pendingSignal ? [{ symbol, pendingSignal }] : [];
  });
  const summaryLines: string[] = [
    `Portfolio status at ${when.toISOString()} (${symbols.length} traded symbol${symbols.length === 1 ? "" : "s"}):`,
  ];
  if (openPositions.length) {
    const totalInvested = openPositions.reduce(
      (acm, { pendingSignal }) => acm + pendingSignal.pnl.pnlEntries,
      0,
    );
    const totalPnlCost = openPositions.reduce(
      (acm, { pendingSignal }) => acm + pendingSignal.pnl.pnlCost,
      0,
    );
    const totalPnlPercent = totalInvested
      ? (totalPnlCost / totalInvested) * 100
      : 0;
    summaryLines.push(
      `Open positions: ${openPositions.length} of ${symbols.length} symbols`,
    );
    summaryLines.push(`Total invested: ${totalInvested.toFixed(2)} USD`);
    summaryLines.push(
      `Total unrealized PnL: ${FORMAT_SIGNED_FN(totalPnlCost)} USD (${FORMAT_SIGNED_FN(totalPnlPercent)}% of invested), net of entry and assumed exit fees and slippage`,
    );
    for (const { symbol, pendingSignal } of openPositions) {
      summaryLines.push(
        `- ${symbol}: ${FORMAT_SIGNED_FN(pendingSignal.pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(pendingSignal.pnl.pnlPercentage)}%)`,
      );
    }
  } else {
    summaryLines.push("Open positions: none");
  }
  const messages: IMCPMessage[] = [
    {
      id: randomString(),
      type: "text",
      text: summaryLines.join("\n"),
    },
  ];
  for (const symbol of symbols) {
    const { createdSignal, pendingSignal, closedSignal, currentPrice } =
      context[symbol];
    const lines: string[] = [];
    lines.push(`Symbol: ${symbol}`);
    if (pendingSignal) {
      const {
        pnl,
        peakProfit,
        maxDrawdown,
        pendingAt,
        minuteEstimatedTime,
        priceOpen,
        totalEntries,
        _entry,
        _peak,
        _fall,
      } = pendingSignal;
      const peakMinutesAgo = Math.max(
        0,
        Math.round((when.getTime() - _peak.timestamp) / 60_000),
      );
      const fallMinutesAgo = Math.max(
        0,
        Math.round((when.getTime() - _fall.timestamp) / 60_000),
      );
      lines.push(
        `Entry price: ${priceOpen}${totalEntries > 1 ? " (effective average across all DCA entries)" : ""}`,
      );
      if (_entry && _entry.length > 1) {
        for (const [index, entry] of _entry.entries()) {
          lines.push(
            `- entry ${index + 1}: price ${entry.price}, cost ${entry.cost.toFixed(2)} USD, at ${new Date(entry.timestamp).toISOString()}`,
          );
        }
        lines.push("");
      }
      lines.push(`Current price: ${currentPrice}`);
      lines.push(
        `Unrealized PnL: ${FORMAT_SIGNED_FN(pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(pnl.pnlPercentage)}%), net of entry and assumed exit fees and slippage`,
      );
      lines.push(
        `Peak profit: ${FORMAT_SIGNED_FN(peakProfit.pnlPercentage)}% (${peakMinutesAgo} minute${peakMinutesAgo === 1 ? "" : "s"} ago)`,
      );
      lines.push(
        `Max drawdown: ${FORMAT_SIGNED_FN(maxDrawdown.pnlPercentage)}% (${fallMinutesAgo} minute${fallMinutesAgo === 1 ? "" : "s"} ago)`,
      );
      const openedMinutesAgo = Math.max(
        0,
        Math.round((when.getTime() - pendingAt) / 60_000),
      );
      lines.push(
        `Opened at: ${new Date(pendingAt).toISOString()} (${openedMinutesAgo} minute${openedMinutesAgo === 1 ? "" : "s"} ago)`,
      );
      if (Number.isFinite(minuteEstimatedTime)) {
        const elapsedMinutes = (when.getTime() - pendingAt) / 60_000;
        const remainingMinutes = Math.max(
          0,
          Math.round(minuteEstimatedTime - elapsedMinutes),
        );
        lines.push(
          `Expires in: ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`,
        );
      } else {
        lines.push("Expires in: never, the position is a perpetual hold");
      }
      lines.push(
        `Balance: ${pnl.pnlEntries.toFixed(2)} USD invested across ${totalEntries} ${totalEntries === 1 ? "entry" : "entries (DCA averaged)"}`,
      );
    } else {
      lines.push(`Current price: ${currentPrice}`);
      lines.push(`Balance: no capital invested in ${symbol}`);
    }
    if (createdSignal) {
      const entry =
        createdSignal.priceOpen !== undefined
          ? `at price ${createdSignal.priceOpen}`
          : "at market price";
      const cost =
        createdSignal.cost !== undefined
          ? ` (cost ${createdSignal.cost} USD)`
          : "";
      lines.push(
        `Entry queue: ${createdSignal.position} order waiting to open ${entry}${cost}`,
      );
      if (createdSignal.note) {
        lines.push("Description:");
        lines.push(toPlainString(createdSignal.note));
        lines.push("");
      }
    } else {
      lines.push("Entry queue: empty, no order waiting to open a position");
    }
    if (pendingSignal) {
      lines.push(`Active position: ${pendingSignal.position}`);
      lines.push(`Signal id: ${pendingSignal.id}`);
      if (pendingSignal.note) {
        lines.push("Description:");
        lines.push(toPlainString(pendingSignal.note));
        lines.push("");
      }
    } else {
      lines.push("Active position: none");
    }
    if (closedSignal) {
      lines.push(
        `Close queue: close order waiting for the ${closedSignal.position} position`,
      );
      if (closedSignal.note) {
        lines.push("Description:");
        lines.push(toPlainString(closedSignal.note));
        lines.push("");
      }
      if (closedSignal.closeNote) {
        lines.push("Close description:");
        lines.push(toPlainString(closedSignal.closeNote));
        lines.push("");
      }
    } else {
      lines.push("Close queue: empty, no order waiting to close a position");
    }
    messages.push({ id: randomString(), type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Builds the trade history for an MCP (Model Context Protocol) instance from the live signal storage
 * (StorageLive): recently CLOSED positions of the bound strategy, newest
 * first — one header message plus one text message per closed trade with
 * the dollar/percent result, direction, close reason, open/close times and
 * the description the position was opened with.
 *
 * The anti-churn half of the agent's picture: a stateless news agent that
 * only sees open positions re-trades the same news right after closing;
 * with the history it sees "this was already traded, result -2.10 USD".
 *
 * Depth: {@link DEFAULT_HISTORY_LIMIT} by default, overridable by `limit`.
 * The cut runs AFTER the newest-first sort, so a limit drops the oldest
 * trades and never the recent ones. The underlying live bucket additionally
 * keeps only the last CC_MAX_SIGNALS rows across ALL strategies (global feed
 * by contract), and rows accumulate only while the Storage adapter is enabled.
 *
 * @param mcpName - MCP (Model Context Protocol) name resolved to its bound strategy
 * @param when - Snapshot time stamped into the header and "minutes ago" math
 * @param limit - Maximum trades to render, newest kept
 * @returns Promise resolving to history messages for the MCP agent
 */
const HISTORY_GET_MESSAGES = async (
  mcpName: MCPName,
  when: Date,
  limit: number,
): Promise<IMCPMessage[]> => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_HISTORY_MESSAGES,
  );
  const rowList = await StorageLive.list();
  const closedList = rowList
    .flatMap((row) =>
      row.strategyName === strategyName && row.status === "closed" ? [row] : [],
    )
    // Newest first, THEN cut: the limit must drop the oldest trades
    .sort((a, b) => b.closeTimestamp - a.closeTimestamp)
    .slice(0, limit);
  if (!closedList.length) {
    return [
      {
        id: randomString(),
        type: "text",
        text: `Trade history at ${when.toISOString()}: no closed positions recorded yet.`,
      },
    ];
  }
  const messages: IMCPMessage[] = [
    {
      id: randomString(),
      type: "text",
      text: `Trade history at ${when.toISOString()} (last ${closedList.length} closed position${closedList.length === 1 ? "" : "s"}, newest first):`,
    },
  ];
  for (const row of closedList) {
    const closedMinutesAgo = Math.max(
      0,
      Math.round((when.getTime() - row.closeTimestamp) / 60_000),
    );
    const lines: string[] = [];
    lines.push(`Symbol: ${row.symbol}`);
    lines.push(`Position: ${row.position}`);
    lines.push(`Signal id: ${row.id}`);
    lines.push(
      `Result: ${FORMAT_SIGNED_FN(row.pnl.pnlCost)} USD (${FORMAT_SIGNED_FN(row.pnl.pnlPercentage)}%), net of entry and exit fees and slippage`,
    );
    lines.push(`Close reason: ${row.closeReason}`);
    lines.push(
      `Closed at: ${new Date(row.closeTimestamp).toISOString()} (${closedMinutesAgo} minute${closedMinutesAgo === 1 ? "" : "s"} ago)`,
    );
    const heldMinutes = Math.max(
      0,
      Math.round((row.closeTimestamp - row.pendingAt) / 60_000),
    );
    lines.push(
      `Opened at: ${new Date(row.pendingAt).toISOString()} (held ${heldMinutes} minute${heldMinutes === 1 ? "" : "s"})`,
    );
    if (row.note) {
      lines.push("Description:");
      lines.push(toPlainString(row.note));
    }
    messages.push({ id: randomString(), type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Builds the agent instruction feed for an MCP (Model Context Protocol)
 * instance from the log history (Log): the `agent`-level entries written by
 * the strategy code via `Log.agent(...)`, newest first — one header message
 * plus one text message per entry with the topic, the emit time and the
 * arguments the strategy attached.
 *
 * This is the strategy talking to the agent. Where getStatus reports numbers
 * and getNotificationMessages replays the agent's own reasoning, this channel
 * carries directives the strategy code decided to raise — "the position has
 * been stagnating for an hour, look for an efficient exit", "volatility
 * collapsed, tighten the thesis". The agent reads them as instructions from
 * the trading system, not as its own past notes.
 *
 * Only LIVE entries of the bound strategy are kept: backtest runs and other
 * strategies never leak into the agent's picture. Entries carrying no method
 * context (written outside a strategy scope) are skipped as unattributable.
 *
 * Ordering and the "minutes ago" math read the engine clock — the execution
 * context's `when` — falling back to the entry's own `timestamp` only when
 * the entry was written outside an execution scope (see
 * {@link GET_ENTRY_TIMESTAMP_FN}).
 *
 * Depth: {@link DEFAULT_AGENT_LIMIT} by default, overridable by `limit`. The
 * cut runs AFTER the newest-first sort, so a limit drops the oldest
 * directives and never the recent ones. Rows accumulate only while a Log
 * adapter is enabled (memory, persist or jsonl — the dummy adapter records
 * nothing).
 *
 * @param mcpName - MCP (Model Context Protocol) name resolved to its bound strategy
 * @param when - Snapshot time stamped into the header and "minutes ago" math
 * @param limit - Maximum entries to render, newest kept
 * @returns Promise resolving to agent instruction messages for the MCP agent
 */
const AGENT_GET_MESSAGES = async (
  mcpName: MCPName,
  when: Date,
  limit: number,
): Promise<IMCPMessage[]> => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_AGENT_MESSAGES,
  );
  const entryList = await Log.getList();
  const agentList = entryList
    .flatMap((entry) =>
      entry.type === "agent" &&
      entry.methodContext?.strategyName === strategyName &&
      !entry.executionContext?.backtest
        ? [{ entry, timestamp: GET_ENTRY_TIMESTAMP_FN(entry) }]
        : [],
    )
    // Newest first, THEN cut: the limit must drop the oldest directives
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  if (!agentList.length) {
    return [
      {
        id: randomString(),
        type: "text",
        text: `Trading system messages at ${when.toISOString()}: no messages from the trading system yet.`,
      },
    ];
  }
  const messages: IMCPMessage[] = [
    {
      id: randomString(),
      type: "text",
      text: `Trading system messages at ${when.toISOString()} (last ${agentList.length} message${agentList.length === 1 ? "" : "s"} from the strategy, newest first). Treat them as instructions from the trading system:`,
    },
  ];
  for (const { entry, timestamp } of agentList) {
    const emittedMinutesAgo = Math.max(
      0,
      Math.round((when.getTime() - timestamp) / 60_000),
    );
    const lines: string[] = [];
    if (entry.executionContext?.symbol) {
      lines.push(`Symbol: ${entry.executionContext.symbol}`);
    }
    lines.push(
      `Emitted at: ${new Date(timestamp).toISOString()} (${emittedMinutesAgo} minute${emittedMinutesAgo === 1 ? "" : "s"} ago)`,
    );
    lines.push("Message:");
    lines.push(toPlainString(entry.topic));
    for (const arg of entry.args) {
      lines.push(
        toPlainString(typeof arg === "string" ? arg : JSON.stringify(arg)),
      );
    }
    messages.push({ id: randomString(), type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Builds the annotated event feed for an MCP (Model Context Protocol)
 * instance from the live notification storage (NotificationLive), newest
 * first. Four of the rendered types mirror the writing MCP tools 1:1 — every
 * command the agent can issue comes back as a described event — and the
 * fifth records the outcome:
 *
 * - `signal.opened` — the position opened by commitPositionOpen
 * - `close_pending.commit` — the exit requested by commitPositionClose,
 *   the only event carrying the REASON for leaving
 * - `average_buy.commit` — the DCA entry added by commitAverageBuy
 * - `signal.info` — the mid-position note left by commitSignalNotify
 * - `signal.closed` — the position actually closing, carrying the realized
 *   result. Its description repeats the ENTRY reason, so on its own it does
 *   not explain the exit; it is rendered anyway because a small `limit` can
 *   rotate the matching close_pending.commit out of the feed, and a lone
 *   "position opened" with no visible ending is exactly what makes an agent
 *   re-enter a trade it already left
 *
 * ONLY events carrying a description are rendered. That is the anti-whipsaw
 * rule: an entry or exit with no stated reason tells the agent nothing about
 * intent, and a feed of bare "opened LONG / closed LONG" lines invites it to
 * re-enter the trade it just left. A described open ("breakout above the
 * range on volume") followed by a described exit ("volume dried up, thesis
 * void") reads as a finished thought the agent will not blindly repeat.
 *
 * The feed spans the whole strategy, not just what is open right now: an exit
 * only makes sense next to the open it terminates, and both matter after the
 * position is gone.
 *
 * Rendered as one header message plus one text message per event, each with
 * the symbol, direction, signal id, prices and PnL of the moment, and the
 * description last on its own lines so multi-line markdown stays readable.
 *
 * Depth: {@link DEFAULT_NOTIFICATION_LIMIT} by default, overridable by
 * `limit`. The cut runs AFTER the newest-first sort, so a limit drops the
 * oldest events and never the recent ones. Rows accumulate only while a
 * NotificationLive backend is enabled.
 *
 * @param mcpName - MCP (Model Context Protocol) name resolved to its bound strategy
 * @param when - Snapshot time stamped into the header and "minutes ago" math
 * @param limit - Maximum events to render, newest kept
 * @returns Promise resolving to annotated event messages for the MCP agent
 */
const NOTIFICATION_GET_MESSAGES = async (
  mcpName: MCPName,
  when: Date,
  limit: number,
): Promise<IMCPMessage[]> => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_NOTIFICATION_MESSAGES,
  );
  const notificationList = await NotificationLive.getData();
  const eventList = notificationList
    .flatMap((row) =>
      IS_EVENT_NOTIFICATION_FN(row) &&
      row.strategyName === strategyName &&
      // An undescribed open or exit is whipsaw fuel: no intent, no lesson
      !!row.note
        ? [row]
        : [],
    )
    // Newest first, THEN cut: the limit must drop the oldest events
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  if (!eventList.length) {
    return [
      {
        id: randomString(),
        type: "text",
        text: `Annotated trading events at ${when.toISOString()}: no described opens, closes or notes recorded yet.`,
      },
    ];
  }
  const messages: IMCPMessage[] = [
    {
      id: randomString(),
      type: "text",
      text: `Annotated trading events at ${when.toISOString()} (last ${eventList.length} described event${eventList.length === 1 ? "" : "s"}, newest first). Read the reasoning before opening anything: a thesis already closed for a stated reason should not be re-entered without a new one:`,
    },
  ];
  for (const row of eventList) {
    const emittedMinutesAgo = Math.max(
      0,
      Math.round((when.getTime() - row.timestamp) / 60_000),
    );
    const lines: string[] = [];
    lines.push(
      `Event: ${NOTIFICATION_TYPE_LABEL[row.type]}${row.type === "signal.closed" ? ` (${row.closeReason})` : ""}`,
    );
    // Every rendered type carries the same identity block, so the agent reads
    // one shape regardless of what happened
    lines.push(`Symbol: ${row.symbol}`);
    lines.push(`Position: ${row.position}`);
    lines.push(`Signal id: ${row.signalId}`);
    lines.push(`Opened at: ${new Date(row.pendingAt).toISOString()}`);
    if (row.type === "signal.opened") {
      lines.push(`Entry price: ${row.priceOpen} (cost ${row.cost} USD)`);
    } else if (row.type === "average_buy.commit") {
      lines.push(
        `Entry added at: ${row.currentPrice} (cost ${row.cost} USD, average entry now ${row.effectivePriceOpen} across ${row.totalEntries} entries)`,
      );
    } else if (row.type === "signal.closed") {
      lines.push(
        `Exit price: ${row.priceClose} (entry ${row.priceOpen}, held ${row.duration} minute${row.duration === 1 ? "" : "s"})`,
      );
    } else {
      lines.push(`Price at event: ${row.currentPrice} (entry ${row.priceOpen})`);
    }
    const isRealized =
      row.type === "close_pending.commit" || row.type === "signal.closed";
    lines.push(
      `${isRealized ? "PnL at exit" : "Unrealized PnL at event"}: ${FORMAT_SIGNED_FN(row.pnlCost)} USD (${FORMAT_SIGNED_FN(row.pnlPercentage)}%), net of entry and ${isRealized ? "exit" : "assumed exit"} fees and slippage`,
    );
    lines.push(
      `Emitted at: ${new Date(row.timestamp).toISOString()} (${emittedMinutesAgo} minute${emittedMinutesAgo === 1 ? "" : "s"} ago)`,
    );
    lines.push("Description:");
    // signal.closed repeats the entry reason — say so, or the agent reads it
    // as the reason for leaving and never learns why the trade was exited
    if (row.type === "signal.closed") {
      lines.push(
        "(entry reason — the exit reason is in the matching close request event)",
      );
    }
    lines.push(toPlainString(row.note!));
    messages.push({ id: randomString(), type: "text", text: lines.join("\n") });
  }
  return messages;
};

/**
 * Wrapper to call onStatus callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback —
 * a broken callback never fails getStatus itself.
 *
 * @param mcpName - MCP (Model Context Protocol) name whose schema supplies the callbacks
 * @param context - Portfolio snapshot the renderer received
 * @param messages - Messages the renderer produced
 */
const CALL_STATUS_CALLBACKS_FN = trycatch(
  async (
    mcpName: MCPName,
    context: IMCPContext,
    messages: IMCPMessage[],
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(mcpName);
    if (callbacks?.onStatus) {
      await callbacks.onStatus(mcpName, context, messages);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_STATUS_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onPositionOpen callback with error handling.
 * Fires AFTER the create-signal commit is accepted, with the exact signal
 * DTO submitted to the live strategy. Catches and logs any errors thrown
 * by the user-provided callback — a broken callback never fails the open.
 *
 * @param symbol - Trading pair symbol the position was opened for
 * @param signal - Signal DTO submitted to Live.commitCreateSignal
 * @param dto - Original open command from the agent
 */
const CALL_POSITION_OPEN_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signal: ISignalDto,
    dto: IMCPPositionOpenCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onPositionOpen) {
      await callbacks.onPositionOpen(symbol, signal, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_POSITION_OPEN_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onPositionClose callback with error handling.
 * Fires AFTER the close-pending commit is accepted, with the id of the
 * pending signal the close was queued for. Catches and logs any errors
 * thrown by the user-provided callback — a broken callback never fails
 * the close.
 *
 * @param symbol - Trading pair symbol the position was closed for
 * @param signalId - Id of the pending signal consumed by the close
 * @param dto - Original close command from the agent
 */
const CALL_POSITION_CLOSE_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signalId: string,
    dto: IMCPPositionCloseCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onPositionClose) {
      await callbacks.onPositionClose(symbol, signalId, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_POSITION_CLOSE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onAverageBuy callback with error handling.
 * Fires AFTER the DCA entry commit is accepted, with the id of the pending
 * signal the entry was averaged into. Catches and logs any errors thrown
 * by the user-provided callback — a broken callback never fails the
 * average buy.
 *
 * @param symbol - Trading pair symbol the entry was added for
 * @param signalId - Id of the pending signal the entry was averaged into
 * @param dto - Original average-buy command from the agent
 */
const CALL_AVERAGE_BUY_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signalId: string,
    dto: IMCPAverageBuyCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onAverageBuy) {
      await callbacks.onAverageBuy(symbol, signalId, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_AVERAGE_BUY_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Wrapper to call onSignalNotify callback with error handling.
 * Fires AFTER the signal notification is emitted, with the id of the
 * pending signal the note was attached to. Catches and logs any errors
 * thrown by the user-provided callback — a broken callback never fails
 * the notify.
 *
 * @param symbol - Trading pair symbol the note was attached for
 * @param signalId - Id of the pending signal the note was attached to
 * @param dto - Original notify command from the agent
 */
const CALL_SIGNAL_NOTIFY_CALLBACKS_FN = trycatch(
  async (
    symbol: string,
    signalId: string,
    dto: IMCPSignalNotifyCommand,
  ): Promise<void> => {
    const { callbacks } = backtest.mcpSchemaService.get(dto.mcpName);
    if (callbacks?.onSignalNotify) {
      await callbacks.onSignalNotify(symbol, signalId, dto);
    }
  },
  {
    fallback: (error) => {
      const message = "MCPUtils CALL_SIGNAL_NOTIFY_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

/**
 * Validates a strategy's full dependency chain — the strategy itself plus
 * its risk(s) and actions — memoized by strategy name. Shared by the
 * explicit-schema path and the single-registered-strategy resolution of
 * {@link GET_STRATEGY_NAME_FN}.
 *
 * @param strategyName - Strategy name to validate
 * @param source - Caller tag included in error messages
 * @throws Error when the strategy, its risks or actions are unknown
 */
const VALIDATE_STRATEGY_CHAIN_FN = memoize(
  ([strategyName]) => `${strategyName}`,
  (strategyName: StrategyName, source: string) => {
    backtest.strategyValidationService.validate(strategyName, source);
    const { riskName, riskList, actions } =
      backtest.strategySchemaService.get(strategyName);
    riskName && backtest.riskValidationService.validate(riskName, source);
    riskList &&
      riskList.forEach((riskName) =>
        backtest.riskValidationService.validate(riskName, source),
      );
    actions &&
      actions.forEach((actionName) =>
        backtest.actionValidationService.validate(actionName, source),
      );
  },
);

/**
 * Validates an MCP (Model Context Protocol) schema, memoized by mcpName.
 *
 * Checks that the MCP is registered; when the schema names a strategy
 * explicitly, cascades into its risk(s) and actions — the same chain public
 * strategy APIs validate. A schema without strategyName defers the strategy
 * chain to {@link GET_STRATEGY_NAME_FN}, which validates the resolved
 * strategy at use time. Runs once per MCP name; later calls are no-ops.
 *
 * @param mcpName - MCP (Model Context Protocol) name to validate
 * @param source - Caller tag included in error messages
 * @throws Error when the MCP, its strategy, risks or actions are unknown
 */
const VALIDATE_SCHEMA_FN = memoize(
  ([mcpName]) => `${mcpName}`,
  (mcpName: string, source: string) => {
    {
      backtest.mcpValidationService.validate(mcpName, source);
    }

    const { strategyName } = backtest.mcpSchemaService.get(mcpName);

    if (strategyName) {
      VALIDATE_STRATEGY_CHAIN_FN(strategyName, source);
    }
  },
);

/**
 * Human-readable description of the action each per-method permission gates.
 * Interpolated into the denial error so an AI agent reading the message
 * understands WHAT was forbidden, not just which flag was missing.
 */
const PERMISSION_ACTION_DESCRIPTION: Record<MCPPermission, string> = {
  getStatus: "Reading the portfolio status",
  commitPositionOpen: "Opening a position",
  commitPositionClose: "Closing a position",
  commitAverageBuy: "Averaging the position (DCA entry)",
  commitSignalNotify:
    "Emitting a notification for the active position",
};

/**
 * Grants applied when the schema omits the permissions field: every
 * agent-facing MCP (Model Context Protocol) method is allowed. Listing
 * permissions explicitly narrows the agent to exactly the listed methods.
 */
const DEFAULT_PERMISSIONS = Object.keys(
  PERMISSION_ACTION_DESCRIPTION,
) as MCPPermission[];

/**
 * Checks that the MCP (Model Context Protocol) schema grants the per-method
 * permission for the requested operation. Each agent-facing MCP method is
 * gated by the permission of the same name; a schema without the permissions
 * field grants ALL of them by default.
 *
 * The denial error is written for an AI agent: it states the forbidden
 * action in plain words, names the missing permission and tells the agent
 * not to retry — only the user can widen the grants.
 *
 * Deliberately NOT memoized: overrideMCPSchema may narrow or widen the
 * grants at runtime, and the check must see the current schema on every
 * call. Composition helpers (getDefaultMessages, getHistoryMessages,
 * getNotificationMessages) are not gated — they transform data the caller
 * already holds and reach the agent through getStatus.
 *
 * @param mcpName - MCP (Model Context Protocol) name whose schema carries the permissions
 * @param permission - Permission required by the calling operation
 * @param source - Caller tag included in error messages
 * @throws Error when the permission is not granted
 */
const CHECK_PERMISSION_FN = (
  mcpName: MCPName,
  permission: MCPPermission,
  source: string,
): void => {
  const { permissions = DEFAULT_PERMISSIONS } =
    backtest.mcpSchemaService.get(mcpName);
  if (!permissions.includes(permission)) {
    throw new Error(
      `MCP Error: ${PERMISSION_ACTION_DESCRIPTION[permission]} is not permitted by the user: the "${permission}" permission is missing from the mcp ${mcpName} schema. Do not retry — the call will keep failing until the user grants this permission. source=${source}`,
    );
  }
};

/**
 * Resolves the effective strategy of an MCP (Model Context Protocol) instance.
 *
 * The schema's explicit strategyName wins. Without it, the SINGLE registered
 * strategy is used implicitly — the resolved name goes through the same
 * dependency-chain validation as an explicit one. Zero registered strategies
 * or two and more make the implicit choice impossible: with several
 * strategies the schema MUST name one, ambiguity is an error, not a guess.
 *
 * Deliberately NOT memoized: strategies register over time, so the
 * resolution must see the current registry on every call.
 *
 * @param mcpName - MCP (Model Context Protocol) name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective strategy name
 * @throws Error when no strategies are registered or the choice is ambiguous
 */
const GET_STRATEGY_NAME_FN = async (
  mcpName: MCPName,
  source: string,
): Promise<StrategyName> => {
  const { strategyName } = backtest.mcpSchemaService.get(mcpName);
  if (strategyName) {
    return strategyName;
  }
  const strategyList = await backtest.strategyValidationService.list();
  if (!strategyList.length) {
    throw new Error(
      `MCP Error: mcp ${mcpName} has no strategyName and no strategies are registered source=${source}`,
    );
  }
  if (strategyList.length > 1) {
    throw new Error(
      `MCP Error: mcp ${mcpName} must specify strategyName explicitly, ${strategyList.length} strategies are registered source=${source}`,
    );
  }
  const [{ strategyName: resolvedName }] = strategyList;
  VALIDATE_STRATEGY_CHAIN_FN(resolvedName, source);
  return resolvedName;
};

/**
 * Builds the portfolio snapshot for an MCP (Model Context Protocol) instance: one entry per live instance of
 * the schema's strategy, keyed by symbol.
 *
 * For every symbol fetches the current VWAP price, the pending signal with
 * unrealized PnL computed at that price, and the deferred created/closed
 * signal slots from the strategy status.
 *
 * @param mcpName - MCP (Model Context Protocol) name resolved to its bound strategy
 * @returns Promise resolving to the per-symbol IMCPContext snapshot
 */
const GET_TARGET_CONTEXT_FN = async (mcpName: string) => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    mcpName,
    METHOD_NAME_GET_STATUS,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.filter(
    (live) => live.strategyName === strategyName,
  );
  const targetList = await Promise.all(
    liveTarget.map(async ({ symbol, exchangeName }) => {
      const currentPrice = await Exchange.getAveragePrice(symbol, {
        exchangeName,
      });
      const pendingSignal = await Live.getPendingSignal(symbol, currentPrice, {
        strategyName,
        exchangeName,
      });
      const { createdSignal, closedSignal } = await Live.getStrategyStatus(
        symbol,
        {
          strategyName,
          exchangeName,
        },
      );
      return {
        symbol,
        pendingSignal,
        createdSignal,
        closedSignal,
        currentPrice,
      };
    }),
  );
  return targetList.reduce(
    (
      acm,
      { symbol, currentPrice, pendingSignal, closedSignal, createdSignal },
    ) => ({
      ...acm,
      [symbol]: { currentPrice, pendingSignal, closedSignal, createdSignal },
    }),
    <IMCPContext>{},
  );
};

/**
 * Renders the portfolio snapshot into agent messages via the schema's
 * getMessages (falling back to {@link DEFAULT_GET_MESSAGES}), with the
 * snapshot time aligned down to the 1m interval.
 *
 * @param mcpName - MCP (Model Context Protocol) name whose schema supplies getMessages
 * @param context - Portfolio snapshot built by GET_TARGET_CONTEXT_FN
 * @returns Promise resolving to the rendered message list
 */
const GET_TARGET_MESSAGES_FN = async (
  mcpName: string,
  context: IMCPContext,
) => {
  const { getMessages = DEFAULT_GET_MESSAGES } =
    backtest.mcpSchemaService.get(mcpName);
  const when = alignToInterval(new Date(), "1m");
  return await getMessages(context, when, mcpName);
};

/**
 * Opens a moonbag position for the command's symbol through the live
 * strategy: fixed 50% take profit, hard stop-loss snapped by
 * {@link COMPUTE_HARD_STOP_FN}, entry cost from the schema's positionCost.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and no pending signal to exist. Fires the schema's
 * onPositionOpen callback after the commit is accepted.
 *
 * @param dto - Open command with symbol, direction, mcpName and note
 * @returns Promise resolving when the create-signal commit is accepted
 * @throws Error when the symbol is not live-enabled or a pending signal exists
 */
const COMMIT_POSITION_OPEN_FN = async (dto: IMCPPositionOpenCommand) => {
  const { positionCost = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, minuteEstimatedTime = GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES, multiplier = GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER } =
    backtest.mcpSchemaService.get(dto.mcpName);
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_POSITION_OPEN,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    const config = getConfig();
    if (pending) {
      throw new Error(
        `MCP Error: already have an active position for ${dto.symbol}`,
      );
    }
    const percentStopLoss = COMPUTE_HARD_STOP_FN(
      config.CC_MAX_STOPLOSS_DISTANCE_PERCENT,
    );
    const signal: ISignalDto = {
      ...Position.moonbag({
        position: dto.position,
        currentPrice,
        percentStopLoss,
      }),
      minuteEstimatedTime,
      cost: positionCost,
      multiplier,
      note: dto.note,
    };
    const result = await Live.commitCreateSignal(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      signal,
    );
    await CALL_POSITION_OPEN_CALLBACKS_FN(dto.symbol, signal, dto);
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Closes the pending position of the command's symbol through the live
 * strategy by queueing a user-initiated close for the pending signal's id.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and a pending signal to exist. Fires the schema's
 * onPositionClose callback after the commit is accepted.
 *
 * @param dto - Close command with symbol, mcpName and note
 * @returns Promise resolving when the close-pending commit is accepted
 * @throws Error when the symbol is not live-enabled or no pending signal exists
 */
const COMMIT_POSITION_CLOSE_FN = async (dto: IMCPPositionCloseCommand) => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_POSITION_CLOSE,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    if (!pending) {
      throw new Error(`MCP Error: no active position for ${dto.symbol}`);
    }
    const result = await Live.commitClosePending(
      dto.symbol,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      {
        id: pending.id,
        note: dto.note,
      },
    );
    await CALL_POSITION_CLOSE_CALLBACKS_FN(dto.symbol, pending.id, dto);
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Adds a DCA entry at the current market price to the pending position of the
 * command's symbol through the live strategy. The pending signal id is
 * resolved by symbol from the live strategy state — no method context is
 * required; the entry cost comes from the schema's positionCost.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and a pending signal to exist. Fires the schema's onAverageBuy
 * callback after the commit is accepted.
 *
 * @param dto - Average-buy command with symbol and mcpName
 * @returns Promise resolving to true when the DCA entry is accepted
 * @throws Error when the symbol is not live-enabled or no pending signal exists
 */
const COMMIT_AVERAGE_BUY_FN = async (dto: IMCPAverageBuyCommand) => {
  const { positionCost = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST } =
    backtest.mcpSchemaService.get(dto.mcpName);
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_AVERAGE_BUY,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    if (!pending) {
      throw new Error(`MCP Error: no active position for ${dto.symbol}`);
    }
    const result = await Live.commitAverageBuy(
      dto.symbol,
      currentPrice,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      positionCost,
    );
    if (result) {
      await CALL_AVERAGE_BUY_CALLBACKS_FN(dto.symbol, pending.id, dto);
    }
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Emits a `signal.info` notification for the pending position of the
 * command's symbol through the live strategy. The pending signal id is
 * resolved by symbol from the live strategy state — no method context is
 * required.
 *
 * Requires the symbol to be enabled in live trading for the schema's
 * strategy and a pending signal to exist. Fires the schema's onSignalNotify
 * callback after the notification is emitted.
 *
 * @param dto - Notify command with symbol, mcpName and note
 * @returns Promise resolving when the notification is emitted
 * @throws Error when the symbol is not live-enabled or no pending signal exists
 */
const COMMIT_SIGNAL_NOTIFY_FN = async (dto: IMCPSignalNotifyCommand) => {
  const strategyName = await GET_STRATEGY_NAME_FN(
    dto.mcpName,
    METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
  );
  const liveList = await Live.list();
  const liveTarget = liveList.find(
    (live) => live.strategyName === strategyName && live.symbol === dto.symbol,
  );
  if (liveTarget) {
    const currentPrice = await Exchange.getAveragePrice(dto.symbol, {
      exchangeName: liveTarget.exchangeName,
    });
    const pending = await Live.getPendingSignal(dto.symbol, currentPrice, {
      exchangeName: liveTarget.exchangeName,
      strategyName: liveTarget.strategyName,
    });
    if (!pending) {
      throw new Error(`MCP Error: no active position for ${dto.symbol}`);
    }
    const result = await Live.commitSignalNotify(
      dto.symbol,
      currentPrice,
      {
        exchangeName: liveTarget.exchangeName,
        strategyName: liveTarget.strategyName,
      },
      {
        notificationNote: dto.note,
        notificationId: pending.id,
      },
    );
    await CALL_SIGNAL_NOTIFY_CALLBACKS_FN(dto.symbol, pending.id, dto);
    return result;
  }
  throw new Error(`MCP Error: symbol ${dto.symbol} is not enabled for trading`);
};

/**
 * Utility class exposing live trading to an MCP (Model Context Protocol) agent.
 *
 * Provides static-like methods (via singleton instance) to observe every
 * live instance of the schema's strategy and to open/close positions on
 * the agent's command.
 *
 * Features:
 * - Portfolio status rendered as human-readable agent messages
 * - Manual position open (moonbag levels, grid-snapped hard stop)
 * - Manual close of the pending position
 *
 * Every method validates the full MCP -> strategy -> risk/action chain
 * before touching the live state.
 *
 * @example
 * ```typescript
 * import { MCP } from "backtest-kit";
 *
 * // Render the portfolio for the agent
 * const messages = await MCP.getStatus("my-mcp");
 *
 * // Open a long position on the agent's command
 * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "agent decision" });
 *
 * // Close it later
 * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "take profit manually" });
 * ```
 */
export class MCPUtils {

  /**
   * Renders a portfolio snapshot with the DEFAULT text renderer, regardless
   * of the schema's getMessages.
   *
   * Emits one header message — snapshot time plus the portfolio summary
   * (open position count, total invested, total and per-position dollar
   * PnL) — plus one text message per traded symbol: prices, PnL/peak/
   * drawdown percents with timing, DCA entries, capital balance and the
   * entry/position/close slots.
   *
   * The signature matches IMCPSchema.getMessages (async variant), so a
   * custom renderer can await this method and extend the default output
   * instead of rebuilding it.
   *
   * @param context - Portfolio snapshot keyed by traded symbol
   * @param when - Snapshot time stamped into the header message
   * @param mcpName - Name of the registered MCP (Model Context Protocol) schema (validated before rendering)
   * @returns Promise resolving to messages for the MCP agent
   *
   * @example
   * ```typescript
   * // Full agent memory: portfolio status, described opens/closes/notes,
   * // directives raised by the strategy, history of the closed trades —
   * // one snapshot, no repeated requests
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const status = await MCP.getDefaultMessages(context, when, mcpName);
   *     const notifications = await MCP.getNotificationMessages(when, mcpName);
   *     const agent = await MCP.getAgentMessages(when, mcpName);
   *     const history = await MCP.getHistoryMessages(when, mcpName);
   *     return [...status, ...notifications, ...agent, ...history];
   *   },
   * });
   * ```
   */
  public getDefaultMessages = async (
    context: IMCPContext,
    when: Date,
    mcpName: MCPName
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_DEFAULT_MESSAGES, {
      mcpName,
      when,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_DEFAULT_MESSAGES);
    }

    return DEFAULT_GET_MESSAGES(context, when);
  }

  /**
   * Renders the trade history of the MCP (Model Context Protocol)
   * instance's strategy into agent messages:
   * the CLOSED positions from the live signal
   * storage, newest first — dollar/percent result, direction, close reason,
   * open/close times and the opening note per trade.
   *
   * Complements getStatus for stateless agents: the status shows what is
   * open, the history shows what was already traded and how it ended, so
   * the agent does not re-enter the same idea right after closing it.
   *
   * Depth defaults to {@link DEFAULT_HISTORY_LIMIT}; the newest trades are
   * the ones kept when `limit` cuts the feed.
   *
   * @param when - Snapshot time stamped into the header and "minutes ago" math; pass the `when` the schema's getMessages received so every feed shares one clock
   * @param mcpName - Name of the registered MCP (Model Context Protocol) schema (validated before rendering)
   * @param limit - Maximum trades to render, newest kept
   * @returns Promise resolving to history messages for the MCP agent
   *
   * @example
   * ```typescript
   * // Full agent memory: portfolio status, described opens/closes/notes,
   * // directives raised by the strategy, history of the closed trades —
   * // one snapshot, no repeated requests. Each feed caps itself at a sane
   * // default; pass a `limit` to trade context size for depth
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const status = await MCP.getDefaultMessages(context, when, mcpName);
   *     const notifications = await MCP.getNotificationMessages(when, mcpName);
   *     const agent = await MCP.getAgentMessages(when, mcpName);
   *     const history = await MCP.getHistoryMessages(when, mcpName);
   *     return [...status, ...notifications, ...agent, ...history];
   *   },
   * });
   * ```
   */
  public getHistoryMessages = async (
    when: Date,
    mcpName: MCPName,
    limit = DEFAULT_HISTORY_LIMIT,
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_HISTORY_MESSAGES, {
      mcpName,
      when,
      limit,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_HISTORY_MESSAGES);
    }

    return await HISTORY_GET_MESSAGES(mcpName, when, limit);
  };

  /**
   * Renders the messages the STRATEGY CODE addressed to the agent into agent
   * messages: the `agent`-level entries of the log history written via
   * `Log.agent(...)` under the MCP (Model Context Protocol) instance's
   * strategy in LIVE mode, newest first — symbol, emit time and the message
   * text per entry.
   *
   * This is the strategy talking to the agent, the reverse direction of every
   * other renderer: getStatus reports numbers, getNotificationMessages
   * replays the agent's own notes, and this channel carries directives the
   * strategy raised on its own — a position stagnating for an hour, collapsed
   * volatility, an approaching session close. The agent reads them as
   * instructions from the trading system.
   *
   * Backtest entries and entries of other strategies are filtered out; rows
   * accumulate only while a Log adapter is enabled. Depth defaults to
   * {@link DEFAULT_AGENT_LIMIT}; the newest directives are the ones kept when
   * `limit` cuts the feed.
   *
   * @param when - Snapshot time stamped into the header and "minutes ago" math; pass the `when` the schema's getMessages received so every feed shares one clock
   * @param mcpName - Name of the registered MCP (Model Context Protocol) schema (validated before rendering)
   * @param limit - Maximum directives to render, newest kept
   * @returns Promise resolving to trading system messages for the MCP agent
   *
   * @example
   * ```typescript
   * // In the strategy code — raise a directive for the agent
   * if (await getPositionActiveMinutes("BTCUSDT") > 60) {
   *   Log.agent("The BTCUSDT position has been stagnating for an hour — look for an efficient exit");
   * }
   *
   * // In the MCP schema — surface the freshest directives to the agent
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const status = await MCP.getDefaultMessages(context, when, mcpName);
   *     const agent = await MCP.getAgentMessages(when, mcpName);
   *     return [...status, ...agent];
   *   },
   * });
   * ```
   */
  public getAgentMessages = async (
    when: Date,
    mcpName: MCPName,
    limit = DEFAULT_AGENT_LIMIT,
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_AGENT_MESSAGES, {
      mcpName,
      when,
      limit,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_AGENT_MESSAGES);
    }

    return await AGENT_GET_MESSAGES(mcpName, when, limit);
  };

  /**
   * Renders the DESCRIBED trading events of the MCP (Model Context Protocol)
   * instance's strategy into agent messages: position opens, position closes
   * and mid-position notes that carry a description, newest first — symbol,
   * direction, signal id, the prices and PnL of the moment, and the reasoning
   * itself.
   *
   * Events without a description are dropped. This is the anti-whipsaw half
   * of the agent's memory: a bare "opened LONG / closed LONG" pair says
   * nothing about intent and invites the agent to re-enter what it just left,
   * while "opened: breakout on volume" followed by "closed: volume dried up,
   * thesis void" reads as a finished thought. Unlike getStatus, the feed is
   * not limited to what is open right now — a close only means something next
   * to the open it terminates.
   *
   * Rows accumulate only while a NotificationLive backend is enabled. Depth
   * defaults to {@link DEFAULT_NOTIFICATION_LIMIT}; the newest events are the
   * ones kept when `limit` cuts the feed.
   *
   * @param when - Snapshot time stamped into the header and "minutes ago" math; pass the `when` the schema's getMessages received so every feed shares one clock
   * @param mcpName - Name of the registered MCP (Model Context Protocol) schema (validated before rendering)
   * @param limit - Maximum events to render, newest kept
   * @returns Promise resolving to annotated event messages for the MCP agent
   *
   * @example
   * ```typescript
   * // Full agent memory: portfolio status, described opens/closes/notes,
   * // directives raised by the strategy, history of the closed trades —
   * // one snapshot, no repeated requests. Each feed caps itself at a sane
   * // default; pass a `limit` to trade context size for depth
   * addMCPSchema({
   *   mcpName: "my-mcp",
   *   strategyName: "my-strategy",
   *   getMessages: async (context, when, mcpName) => {
   *     const status = await MCP.getDefaultMessages(context, when, mcpName);
   *     const notifications = await MCP.getNotificationMessages(when, mcpName);
   *     const agent = await MCP.getAgentMessages(when, mcpName);
   *     const history = await MCP.getHistoryMessages(when, mcpName);
   *     return [...status, ...notifications, ...agent, ...history];
   *   },
   * });
   * ```
   */
  public getNotificationMessages = async (
    when: Date,
    mcpName: MCPName,
    limit = DEFAULT_NOTIFICATION_LIMIT,
  ): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_NOTIFICATION_MESSAGES, {
      mcpName,
      when,
      limit,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_NOTIFICATION_MESSAGES);
    }

    return await NOTIFICATION_GET_MESSAGES(mcpName, when, limit);
  };

  /**
   * Renders the current portfolio of the MCP (Model Context Protocol)
   * instance's strategy into agent messages.
   *
   * Builds a per-symbol snapshot (current price, queued entry, active
   * position with PnL, queued close) over every live instance of the bound
   * strategy and passes it to the schema's getMessages (or the default
   * text renderer). Fires the schema's onStatus callback with the snapshot
   * and the rendered messages.
   *
   * Requires the "getStatus" permission on the schema.
   *
   * @param mcpName - Name of the registered MCP (Model Context Protocol) schema
   * @returns Promise resolving to messages for the MCP agent
   * @throws Error when the schema lacks the "getStatus" permission
   *
   * @example
   * ```typescript
   * const messages = await MCP.getStatus("my-mcp");
   * for (const message of messages) {
   *   if (message.type === "text") console.log(message.text);
   * }
   * ```
   */
  public getStatus = async (mcpName: string): Promise<IMCPMessage[]> => {
    backtest.loggerService.log(METHOD_NAME_GET_STATUS, {
      mcpName,
    });

    {
      VALIDATE_SCHEMA_FN(mcpName, METHOD_NAME_GET_STATUS);
      CHECK_PERMISSION_FN(mcpName, "getStatus", METHOD_NAME_GET_STATUS);
    }

    const context = await GET_TARGET_CONTEXT_FN(mcpName);
    const messages = await GET_TARGET_MESSAGES_FN(mcpName, context);

    await CALL_STATUS_CALLBACKS_FN(mcpName, context, messages);

    return messages;
  };

  /**
   * Opens a position for a symbol on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have no pending signal. Levels are moonbag: fixed 50% take profit,
   * hard stop-loss snapped one notch below CC_MAX_STOPLOSS_DISTANCE_PERCENT;
   * entry cost comes from the schema's positionCost.
   *
   * @param dto - Open command with symbol, direction, mcpName and note
   * @returns Promise resolving when the create-signal commit is accepted
   * @throws Error when the symbol is not live-enabled or a pending signal exists
   * @throws Error when the schema lacks the "commitPositionOpen" permission
   *
   * @example
   * ```typescript
   * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "breakout entry" });
   * ```
   */
  public commitPositionOpen = async (dto: IMCPPositionOpenCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_OPEN, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_OPEN);
      CHECK_PERMISSION_FN(dto.mcpName, "commitPositionOpen", METHOD_NAME_COMMIT_POSITION_OPEN);
    }

    return await COMMIT_POSITION_OPEN_FN(dto);
  };

  /**
   * Closes the pending position of a symbol on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have a pending signal; its id is consumed by the close commit.
   *
   * @param dto - Close command with symbol, mcpName and note
   * @returns Promise resolving when the close-pending commit is accepted
   * @throws Error when the symbol is not live-enabled or no pending signal exists
   * @throws Error when the schema lacks the "commitPositionClose" permission
   *
   * @example
   * ```typescript
   * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "manual exit" });
   * ```
   */
  public commitPositionClose = async (dto: IMCPPositionCloseCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_POSITION_CLOSE, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_POSITION_CLOSE);
      CHECK_PERMISSION_FN(dto.mcpName, "commitPositionClose", METHOD_NAME_COMMIT_POSITION_CLOSE);
    }

    return await COMMIT_POSITION_CLOSE_FN(dto);
  };

  /**
   * Adds a DCA entry to the pending position of a symbol on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have a pending signal — its id is resolved by symbol from the live
   * strategy state, no method context is required. The entry executes at the
   * current market price with the cost from the schema's positionCost.
   *
   * @param dto - Average-buy command with symbol and mcpName
   * @returns Promise resolving to true when the DCA entry is accepted, false if rejected by validation
   * @throws Error when the symbol is not live-enabled or no pending signal exists
   * @throws Error when the schema lacks the "commitAverageBuy" permission
   *
   * @example
   * ```typescript
   * await MCP.commitAverageBuy({ mcpName: "my-mcp", symbol: "BTCUSDT" });
   * ```
   */
  public commitAverageBuy = async (dto: IMCPAverageBuyCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_AVERAGE_BUY, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_AVERAGE_BUY);
      CHECK_PERMISSION_FN(dto.mcpName, "commitAverageBuy", METHOD_NAME_COMMIT_AVERAGE_BUY);
    }

    return await COMMIT_AVERAGE_BUY_FN(dto);
  };

  /**
   * Emits a `signal.info` notification for the pending position of a symbol
   * on the agent's command.
   *
   * The symbol must be enabled in live trading for the schema's strategy and
   * must have a pending signal — its id is resolved by symbol from the live
   * strategy state, no method context is required. The notification lands in
   * the live notification storage and is later readable via
   * getNotificationMessages.
   *
   * @param dto - Notify command with symbol, mcpName and note
   * @returns Promise resolving when the notification is emitted
   * @throws Error when the symbol is not live-enabled or no pending signal exists
   * @throws Error when the schema lacks the "commitSignalNotify" permission
   *
   * @example
   * ```typescript
   * await MCP.commitSignalNotify({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "RSI crossed 70, watching for exit" });
   * ```
   */
  public commitSignalNotify = async (dto: IMCPSignalNotifyCommand) => {
    backtest.loggerService.log(METHOD_NAME_COMMIT_SIGNAL_NOTIFY, {
      dto,
    });

    {
      VALIDATE_SCHEMA_FN(dto.mcpName, METHOD_NAME_COMMIT_SIGNAL_NOTIFY);
      CHECK_PERMISSION_FN(dto.mcpName, "commitSignalNotify", METHOD_NAME_COMMIT_SIGNAL_NOTIFY);
    }

    return await COMMIT_SIGNAL_NOTIFY_FN(dto);
  };
}

/**
 * Global singleton instance of MCPUtils.
 * Provides static-like access to MCP (Model Context Protocol) agent trading methods.
 *
 * @example
 * ```typescript
 * import { MCP } from "backtest-kit";
 *
 * const messages = await MCP.getStatus("my-mcp");
 * await MCP.commitPositionOpen({ mcpName: "my-mcp", symbol: "BTCUSDT", position: "long", note: "agent decision" });
 * await MCP.commitPositionClose({ mcpName: "my-mcp", symbol: "BTCUSDT", note: "agent decision" });
 * ```
 */
export const MCP = new MCPUtils();
