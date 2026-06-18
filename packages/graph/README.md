<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/assignation.svg" height="45px" align="right">

# 🕸️ @backtest-kit/graph

> Compose [backtest-kit](https://www.npmjs.com/package/backtest-kit) computations as a typed directed acyclic graph. Declare **source nodes** that fetch market data and **output nodes** that derive values from them — then resolve the whole graph in topological order, in parallel, fully type-inferred.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/graph.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/graph)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/graph backtest-kit
```

---

## What it's for

A trading signal is rarely one number — it's a small computation: pull 4h trend, pull 15m entry, combine them, maybe gate on RSI. Written inline, that becomes a tangle of `await`s with hand-managed ordering. This package lets you declare it as a **graph of typed nodes**: leaves (`sourceNode`) fetch data, branches (`outputNode`) compute from their children, and `resolve()` walks the tree bottom-up — resolving every node's dependencies **in parallel** (`Promise.all`) before computing the node itself. Swapping a timeframe or adding a filter node needs no change to the strategy wiring, and TypeScript infers the value type through the entire graph.

It plugs straight into a `getSignal` and runs inside backtest-kit's execution context, so a `sourceNode`'s `fetch` automatically receives `(symbol, when, currentPrice, exchangeName)` — the same look-ahead-safe "now" the rest of the engine sees.

---

## Multi-timeframe Pine strategy (the canonical example)

A two-timeframe strategy: a **4h Pine Script** acts as a trend filter, a **15m Pine Script** generates the entry. The output node combines them and returns `null` whenever the trend disagrees with the entry — so a long signal is suppressed in a downtrend and vice-versa.

<details>
<summary>The Code</summary>

```typescript
import { extract, run, toSignalDto, File } from '@backtest-kit/pinets';
import { addStrategySchema, Cache } from 'backtest-kit';
import { randomString } from 'functools-kit';
import { sourceNode, outputNode, resolve } from '@backtest-kit/graph';

// SourceNode — 4h trend filter, cached per candle interval
const higherTimeframe = sourceNode(Cache.fn(async (symbol) => {
  const plots = await run(File.fromPath('timeframe_4h.pine'), { symbol, timeframe: '4h', limit: 100 });
  return extract(plots, { allowLong: 'AllowLong', allowShort: 'AllowShort', noTrades: 'NoTrades' });
}, { interval: '4h', key: ([symbol]) => symbol }));

// SourceNode — 15m entry signal, cached per candle interval
const lowerTimeframe = sourceNode(Cache.fn(async (symbol) => {
  const plots = await run(File.fromPath('timeframe_15m.pine'), { symbol, timeframe: '15m', limit: 100 });
  return extract(plots, { position: 'Signal', priceOpen: 'Close', priceTakeProfit: 'TakeProfit', priceStopLoss: 'StopLoss', minuteEstimatedTime: 'EstimatedTime' });
}, { interval: '15m', key: ([symbol]) => symbol }));

// OutputNode — applies the MTF filter, returns ISignalDto or null
const mtfSignal = outputNode(async ([higher, lower]) => {
  if (higher.noTrades) return null;
  if (lower.position === 0) return null;
  if (higher.allowShort && lower.position === 1) return null;   // long blocked in downtrend
  if (higher.allowLong  && lower.position === -1) return null;  // short blocked in uptrend
  return toSignalDto(randomString(), lower, null);
}, higherTimeframe, lowerTimeframe);

addStrategySchema({
  strategyName: 'mtf_graph_strategy', interval: '5m',
  getSignal: (symbol) => resolve(mtfSignal),
  actions: ['partial_profit_action', 'breakeven_action'],
});
```

Both Pine nodes resolve **in parallel**; their typed results flow into `compute`. Replacing either script — or adding a third filter node — requires no change to the strategy registration.

</details>

---

## The model

Two layers, by design: a **low-level runtime interface** (`INode`) that serializes to a DB and reconstructs without builders, and a **high-level authoring API** (`TypedNode` + `sourceNode`/`outputNode`) that gives full type inference. You write with the builders; the runtime and storage use the interface.

- 📊 **DAG execution** — nodes resolve bottom-up in topological order with `Promise.all` parallelism.
- 🔒 **Type-safe values** — TypeScript infers each node's return type through the graph via generics (`OutputNode<[SourceNode<number>, SourceNode<string>], …>`).
- 💾 **DB-ready** — `serialize`/`deserialize` convert the graph to a flat `IFlatNode[]` list with `id`/`nodeIds`.
- 🔌 **Context-aware fetch** — `SourceNode.fetch` receives `(symbol, when, currentPrice, exchangeName)` from the execution context automatically.

---

## Authoring API

<details>
<summary>Builder API — sourceNode / outputNode / resolve</summary>

`outputNode` infers the type of `values` in `compute` from the nodes you pass:

```typescript
import { sourceNode, outputNode, resolve } from '@backtest-kit/graph';

const closePrice = sourceNode(async (symbol, when, currentPrice, exchangeName) => {
  const candles = await getCandles(symbol, '1h', 1, exchangeName);
  return candles[0].close;                       // SourceNode<number>
});
const volume = sourceNode(async (symbol, when, currentPrice, exchangeName) => {
  const candles = await getCandles(symbol, '1h', 1, exchangeName);
  return candles[0].volume;                      // SourceNode<number>
});

const vwap = outputNode(([price, vol]) => price * vol, closePrice, volume); // price, vol: number
const result = await resolve(vwap);              // Promise<number>, inside a strategy
```

</details>

<details>
<summary>Mixed types — heterogeneous inference by position</summary>

```typescript
const price = sourceNode(async (symbol) => 42);        // SourceNode<number>
const name  = sourceNode(async (symbol) => 'BTCUSDT'); // SourceNode<string>
const flag  = sourceNode(async (symbol) => true);      // SourceNode<boolean>

const result = outputNode(
  ([p, n, f]) => `${n}: ${p} (active: ${f})`,          // p: number, n: string, f: boolean
  price, name, flag,
); // OutputNode<[SourceNode<number>, SourceNode<string>, SourceNode<boolean>], string>
```

</details>

<details>
<summary>Inline anonymous composition — a single object literal</summary>

```typescript
import { NodeType, TypedNode, resolve } from '@backtest-kit/graph';

const signal: TypedNode = {
  type: NodeType.OutputNode,
  nodes: [
    { type: NodeType.SourceNode, fetch: async (symbol) => extract(await run(File.fromPath('timeframe_4h.pine'),  { symbol, timeframe: '4h',  limit: 100 }), { allowLong: 'AllowLong', allowShort: 'AllowShort', noTrades: 'NoTrades' }) },
    { type: NodeType.SourceNode, fetch: async (symbol) => extract(await run(File.fromPath('timeframe_15m.pine'), { symbol, timeframe: '15m', limit: 100 }), { position: 'Signal', priceOpen: 'Close', priceTakeProfit: 'TakeProfit', priceStopLoss: 'StopLoss' }) },
  ],
  compute: ([higher, lower]) => {
    if (higher.noTrades || lower.position === 0) return null;
    if (higher.allowShort && lower.position === 1) return null;
    if (higher.allowLong  && lower.position === -1) return null;
    return lower.position;
  },
};
const result = await resolve(signal);
```

</details>

<details>
<summary>Inside a backtest-kit strategy</summary>

```typescript
import { addStrategy } from 'backtest-kit';
import { sourceNode, outputNode, resolve } from '@backtest-kit/graph';

const rsi = sourceNode(async (symbol, when, currentPrice, exchangeName) => 55.2 /* compute RSI */);
const signal = outputNode(([rsiValue]) => rsiValue < 30 ? 1 : rsiValue > 70 ? -1 : 0, rsi);

addStrategy({
  strategyName: 'graph-rsi', interval: '1h', riskName: 'demo',
  getSignal: async (symbol) => {
    const direction = await resolve(signal);     // 1 | -1 | 0
    return direction === 1 ? { position: 'long', /* … */ } : null;
  },
});
```

</details>

---

## Runtime interface & storage

<details>
<summary>Low-level INode — manual construction (post-deserialize / DI)</summary>

```typescript
import { INode, Value } from '@backtest-kit/graph';
import NodeType from '@backtest-kit/graph/enum/NodeType';

const priceNode: INode = { type: NodeType.SourceNode, description: 'Close price', fetch: async (symbol, when, currentPrice, exchangeName) => 42 };
const doubled:   INode = { type: NodeType.OutputNode, description: 'Doubled price', nodes: [priceNode], compute: ([price]) => (price as number) * 2 };
```

`INode` has no generic parameters — `values` in `compute` is typed as `Value[]` (`string | number | boolean | null`). Use `TypedNode` + builders for full IntelliSense.

</details>

<details>
<summary>DB serialization — serialize / deserialize</summary>

`serialize` flattens the graph into `IFlatNode[]`, replacing object references in `nodes` with `nodeIds`; `deserialize` rebuilds the tree:

```typescript
import { serialize, deserialize, IFlatNode } from '@backtest-kit/graph';

const flat: IFlatNode[] = serialize([vwap]);
// [ { id:'abc', type:'source_node', nodeIds:[] },          // closePrice
//   { id:'def', type:'source_node', nodeIds:[] },          // volume
//   { id:'ghi', type:'output_node', nodeIds:['abc','def'] } ] // vwap
await db.collection('nodes').insertMany(flat);

const stored = await db.collection('nodes').find().toArray();
const roots: INode[] = deserialize(stored);    // nodes[] re-wired from nodeIds
```

`fetch` and `compute` are **not** stored — restore them on the application side after `deserialize`.

</details>

<details>
<summary>deepFlat — topological traversal</summary>

Returns all nodes in topological order (dependencies before parents), deduplicated by reference:

```typescript
import { deepFlat } from '@backtest-kit/graph';
const all = deepFlat([vwap]); // [closePrice, volume, vwap]
all.forEach(node => console.log(node.description));
```

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `sourceNode(fetch)` | Builder — typed source (leaf) node; `fetch(symbol, when, currentPrice, exchangeName)` |
| `outputNode(compute, ...nodes)` | Builder — typed output node; infers `values` types from `nodes` |
| `resolve(node)` | Recursively resolves a graph within backtest-kit execution context |
| `serialize(roots)` | Flattens a node tree into `IFlatNode[]` for DB storage |
| `deserialize(flat)` | Reconstructs a node tree from `IFlatNode[]`, returns root nodes |
| `deepFlat(nodes)` | Returns all nodes in topological order (dependencies first) |
| `INode` | Base runtime interface (untyped; used internally and for serialization) |
| `TypedNode` | Discriminated union for authoring with full IntelliSense |
| `IFlatNode` | Serialized node shape for DB storage (`id`, `type`, `nodeIds`) |
| `NodeType` | Enum — `SourceNode` (`source_node`) / `OutputNode` (`output_node`) |
| `Value` | `string \| number \| boolean \| null` |
| `ExchangeName` | Exchange-name type alias passed to `fetch` |

> **Complete source map.** `enum/NodeType.ts` · `helpers/{node,resolve,serialize,deepFlat}.ts` · `interfaces/{Node,TypedNode,FlatNode}.interface.ts` · `model/ExchangeName.model.ts` · `index.ts` — every export above is one of these files; nothing in `src/` is undocumented.

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
