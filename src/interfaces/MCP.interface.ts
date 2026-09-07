import { IPublicSignalRow, ISignalCloseRow, ISignalDto, StrategyName } from "./Strategy.interface";

export type MCPMessageId = string | number;

/**
 * Base64-encoded binary payload of an MCP (Model Context Protocol) image message.
 */
export type MCPBase64 = string;

/**
 * Image message for the MCP (Model Context Protocol) agent (e.g. a rendered chart).
 * Payload is base64-encoded binary data with its mime type.
 */
export interface IMCPImageMessage {
    /** Unique identifier for the message (used to track delivery and deduplication) */
    id: MCPMessageId;
    /** Discriminator for type-safe union */
    type: "image";
    /** Mime type of the encoded payload (e.g., "image/png") */
    mimeType: string;
    /** Base64-encoded binary data of the image */
    data: MCPBase64;
}

/**
 * Plain text message for the MCP (Model Context Protocol) agent.
 */
export interface IMCPTextMessage {
    /** Unique identifier for the message (used to track delivery and deduplication) */
    id: MCPMessageId;
    /** Discriminator for type-safe union */
    type: "text";
    /** Human-readable message text */
    text: string;
}

/**
 * Message emitted to the MCP (Model Context Protocol) agent by getMessages.
 * Discriminated union of text and image messages.
 */
export type IMCPMessage = IMCPTextMessage | IMCPImageMessage;

/**
 * Portfolio snapshot passed to getMessages, keyed by traded symbol.
 * One entry per live instance of the schema's strategy.
 */
export interface IMCPContext {
    [symbol: string]: {
        /** Signal DTO queued to open a position on the next tick, or null if none queued */
        createdSignal: ISignalDto | null;
        /** Active position with unrealized PnL computed at currentPrice, or null if none open */
        pendingSignal: IPublicSignalRow | null;
        /** Deferred user-initiated close waiting to be drained, or null if none queued */
        closedSignal: ISignalCloseRow | null;
        /** Current VWAP price of the symbol */
        currentPrice: number;
    }
}

/**
 * Command payload for MCP.commitPositionOpen (MCP — Model Context Protocol).
 * Opens a moonbag position (fixed 50% TP, grid-snapped hard SL) for a symbol
 * enabled in live trading for the schema's strategy.
 */
export interface IMCPPositionOpenCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Name of the registered MCP (Model Context Protocol) schema issuing the command */
  mcpName: MCPName;
  /** Human-readable reason attached to the created signal */
  note: string;
}

/**
 * Command payload for MCP.commitPositionClose (MCP — Model Context Protocol).
 * Closes the pending position of a symbol enabled in live trading
 * for the schema's strategy.
 */
export interface IMCPPositionCloseCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered MCP (Model Context Protocol) schema issuing the command */
  mcpName: MCPName;
  /** Human-readable reason attached to the close commit */
  note: string;
}

/**
 * Command payload for MCP.commitAverageBuy (MCP — Model Context Protocol).
 * Adds a DCA entry at the current market price to the active pending position
 * of a symbol enabled in live trading for the schema's strategy. The engine
 * resolves the pending signal id by symbol; the entry cost comes from the
 * schema's positionCost.
 */
export interface IMCPAverageBuyCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered MCP (Model Context Protocol) schema issuing the command */
  mcpName: MCPName;
}

/**
 * Command payload for MCP.commitSignalNotify (MCP — Model Context Protocol).
 * Emits a `signal.info` notification for the active pending position of a
 * symbol enabled in live trading for the schema's strategy. The engine
 * resolves the pending signal id by symbol.
 */
export interface IMCPSignalNotifyCommand {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered MCP (Model Context Protocol) schema issuing the command */
  mcpName: MCPName;
  /** Human-readable note attached to the notification */
  note: string;
}

/**
 * Lifecycle callbacks of an MCP (Model Context Protocol) instance (all optional).
 *
 * Fire AFTER the corresponding engine effect succeeds, with the raw data
 * the effect was built from — a test registers them to observe what the
 * MCP actually did (rendered snapshot, submitted signal, consumed pending
 * id) without mocking the live machinery. An omitted callback is simply
 * never fired; a callback that throws is logged and does not fail the
 * operation.
 */
export interface IMCPCallbacks {
    /**
     * Fired after getStatus renders the portfolio: the snapshot the
     * renderer received and the messages it produced.
     */
    onStatus(mcpName: MCPName, context: IMCPContext, messages: IMCPMessage[]): void;
    /**
     * Fired after a position open commit is accepted: the exact signal DTO
     * submitted to the live strategy (moonbag TP/SL levels, cost, note).
     */
    onPositionOpen(symbol: string, signal: ISignalDto, dto: IMCPPositionOpenCommand): void;
    /**
     * Fired after a close commit is accepted: the id of the pending signal
     * the close was queued for.
     */
    onPositionClose(symbol: string, signalId: string, dto: IMCPPositionCloseCommand): void;
    /**
     * Fired after a DCA entry commit is accepted: the id of the pending
     * signal the entry was averaged into.
     */
    onAverageBuy(symbol: string, signalId: string, dto: IMCPAverageBuyCommand): void;
    /**
     * Fired after a signal notification is emitted: the id of the pending
     * signal the note was attached to.
     */
    onSignalNotify(symbol: string, signalId: string, dto: IMCPSignalNotifyCommand): void;
}

/**
 * Per-method access grant of an MCP (Model Context Protocol) instance.
 * Each permission name matches the agent-facing MCP method it gates 1:1.
 * A schema without the permissions field grants ALL of them; listing
 * permissions explicitly narrows the agent to exactly those methods.
 * Composition helpers the user calls from getMessages
 * (getDefaultMessages, getHistoryMessages, getNotificationMessages) are
 * not gated — they only reshape data the caller already holds, and reach
 * the agent through getStatus, which carries its own permission.
 */
export type MCPPermission =
  | "getStatus"
  | "commitPositionOpen"
  | "commitPositionClose"
  | "commitAverageBuy"
  | "commitSignalNotify";

/**
 * Registration schema of an MCP (Model Context Protocol) instance.
 *
 * Binds an MCP name to a strategy: status and position commands operate on
 * every live instance of that strategy.
 * - mcpName — registry key; duplicate registration is a validation error.
 * - strategyName — the strategy whose live instances the MCP observes and
 *   trades. Optional: when omitted, the SINGLE registered strategy is used;
 *   with two or more strategies registered every MCP call throws until the
 *   schema names one explicitly — ambiguity is an error, not a guess.
 * - positionCost — entry cost in USD for commitPositionOpen; defaults to
 *   GLOBAL_CONFIG.CC_POSITION_ENTRY_COST when omitted.
 * - multiplier — PNL multiplier (leverage) for commitPositionOpen; defaults to
 *   GLOBAL_CONFIG.CC_SIGNAL_MULTIPLIER when omitted.
 * - permissions — per-method grants for the agent-facing methods; defaults
 *   to ALL of them when omitted. Listing permissions explicitly narrows the
 *   agent to exactly those methods; a call to a method whose permission is
 *   missing throws with an agent-readable denial. The check runs per call,
 *   so an overridden schema applies immediately.
 * - getMessages — renders the portfolio snapshot into agent messages; when
 *   omitted the default renderer emits one text message per symbol.
 * - callbacks — all optional; an omitted callback is simply never fired.
 */
export interface IMCPSchema {
    /** Unique MCP (Model Context Protocol) identifier for the schema registry */
    mcpName: MCPName;
    /** Strategy whose live instances this MCP (Model Context Protocol) observes and trades. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it */
    strategyName?: StrategyName;
    /** Entry cost in USD for opened positions. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST */
    positionCost?: number;
    /** PNL multiplier (leverage) for opened positions. Default: GLOBAL_CONFIG.CC_SIGNAL_MULTIPLIER */
    multiplier?: number;
    /** Estimated time in minutes for a position to reach its TP or SL. */
    minuteEstimatedTime?: number;
    /** Per-method grants for the agent; each permission name gates the agent-facing MCP (Model Context Protocol) method of the same name. Default: all of them */
    permissions?: MCPPermission[];
    /** Renders the portfolio snapshot into messages for the MCP (Model Context Protocol) agent (default: text per symbol) */
    getMessages?: (context: IMCPContext, when: Date, mcpName: MCPName) => IMCPMessage[] | Promise<IMCPMessage[]>;
    /** Lifecycle callbacks (all optional) */
    callbacks?: Partial<IMCPCallbacks>;
}

/**
 * Unique MCP (Model Context Protocol) identifier.
 */
export type MCPName = string;
