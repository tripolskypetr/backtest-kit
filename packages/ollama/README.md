<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/monade.svg" height="45px" align="right">

# 🤖 @backtest-kit/ollama

> Universal LLM adapter for [backtest-kit](https://www.npmjs.com/package/backtest-kit) trading strategies. One higher-order-function API across **12 providers**, schema-enforced structured output, userspace prompt modules, token rotation — plus an **LLM strategy optimizer** that generates runnable strategy code.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/ollama.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/ollama)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/ollama backtest-kit agent-swarm-kit
```

---

## Why

AI strategies normally mean per-provider SDK boilerplate and JSON you can't trust. This package collapses all of it: wrap any async function with a provider HOF and it runs inside that provider's inference context — swap `deepseek()` → `claude()` → `gpt5()` with no other change. Structured output is schema-enforced (Zod or JSON schema via `agent-swarm-kit`'s `addOutline`), prompts live as memoized userspace modules

- 🔌 **12 providers** — OpenAI, Claude, DeepSeek, Grok, Groq, Mistral, Perplexity, Cohere, Alibaba, Hugging Face, Ollama (local), GLM-4 (Z.ai).
- ⚡ **Higher-order functions** — wrap an async fn with inference context via `di-scoped`; same signature in, same out.
- 🎯 **Userspace schema** — define your own Zod or JSON schema; structured output enforced with auto-retry + custom validations.
- 📝 **Userspace prompts** — load from `.cjs` modules in `config/prompt/`, or inline; memoized via `functools-kit`.
- 🔄 **Token rotation** — pass an array of API keys for automatic rotation.
- 🧬 **Strategy optimizer** — `Optimizer` generates *complete executable strategy code* from LLM analysis across training ranges.

---

## The provider HOF

The whole adapter is one shape, repeated for 12 providers: `provider(fn, model, apiKey?) => fn`. It returns a function with the **same signature** as `fn`, executed inside the provider's inference context (so any `agent-swarm-kit` completion inside resolves to that provider).

```typescript
import { deepseek } from '@backtest-kit/ollama';
import { addStrategy } from 'backtest-kit';

addStrategy({
  strategyName: 'llm-signal', interval: '5m',
  // swap deepseek() → claude() / gpt5() / ollama() / groq() with no other change
  getSignal: deepseek(getSignal, 'deepseek-chat', process.env.DEEPSEEK_API_KEY),
});
```

<details>
<summary>All 12 providers, base URLs & token rotation</summary>

| Provider | Function | Inference | Base URL |
|----------|----------|-----------|----------|
| OpenAI | `gpt5()` | `gpt5_inference` | `https://api.openai.com/v1/` |
| Claude | `claude()` | `claude_inference` | `https://api.anthropic.com/v1/` |
| DeepSeek | `deepseek()` | `deepseek_inference` | `https://api.deepseek.com/` |
| Grok (xAI) | `grok()` | `grok_inference` | `https://api.x.ai/v1/` |
| Groq | `groq()` | `groq_inference` | `https://api.groq.com/` |
| Mistral | `mistral()` | `mistral_inference` | `https://api.mistral.ai/v1/` |
| Perplexity | `perplexity()` | `perplexity_inference` | `https://api.perplexity.ai/` |
| Cohere | `cohere()` | `cohere_inference` | `https://api.cohere.ai/compatibility/v1/` |
| Alibaba (Qwen) | `alibaba()` | `alibaba_inference` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/` |
| Hugging Face | `hf()` | `hf_inference` | `https://router.huggingface.co/v1/` |
| Ollama (local) | `ollama()` | `ollama_inference` | `http://localhost:11434/` |
| GLM-4 (Z.ai) | `glm4()` | `glm4_inference` | `https://open.bigmodel.cn/api/paas/v4/` |

```typescript
// apiKey accepts a single key OR an array → automatic rotation across calls
const wrappedFn = ollama(myFn, 'llama3.3:70b', ['key1', 'key2', 'key3']);
```

All twelve share one signature — `<T>(fn: T, model: string, apiKey?: string | string[]) => T` — and run `fn` inside `ContextService.runInContext({ apiKey, inference, model })`. The matching `InferenceName` enum + per-provider `client/*Provider.client.ts` + `config/*.ts` resolve the actual SDK call.

</details>

---

## Structured output

Define a schema (Zod or raw JSON), register it as an outline against this package's `CompletionName`, and the LLM is forced to return valid JSON — with custom validations that reject bad signals (e.g. "SL must be below entry for LONG").

<details>
<summary>Zod outline</summary>

```typescript
// schema/Signal.schema.ts
import { z } from 'zod';
export const SignalSchema = z.object({
  position: z.enum(['long', 'short', 'wait']).describe('long: bullish · short: bearish · wait: unclear'),
  price_open: z.number().describe('Entry price in USD'),
  price_stop_loss: z.number().describe('LONG: below entry · SHORT: above entry'),
  price_take_profit: z.number().describe('LONG: above entry · SHORT: below entry'),
  minute_estimated_time: z.number().describe('Estimated minutes to reach TP'),
  risk_note: z.string().describe('Whale manipulation, order-book imbalance, divergences — with numbers'),
});
export type TSignalSchema = z.infer<typeof SignalSchema>;
```

```typescript
// outline/signal.outline.ts
import { addOutline } from 'agent-swarm-kit';
import { zodResponseFormat } from 'openai/helpers/zod';
import { SignalSchema, TSignalSchema } from '../schema/Signal.schema';
import { CompletionName } from '@backtest-kit/ollama';

addOutline<TSignalSchema>({
  outlineName: 'SignalOutline',
  completion: CompletionName.RunnerOutlineCompletion,
  format: zodResponseFormat(SignalSchema, 'position_decision'),
  getOutlineHistory: async ({ history, param: messages = [] }) => { await history.push(messages); },
  validations: [{
    validate: ({ data }) => {
      if (data.position === 'long'  && data.price_stop_loss >= data.price_open) throw new Error('LONG: SL must be below entry');
      if (data.position === 'short' && data.price_stop_loss <= data.price_open) throw new Error('SHORT: SL must be above entry');
    },
  }],
});
```

</details>

<details>
<summary>Raw JSON-schema outline (no Zod)</summary>

```typescript
import { addOutline, IOutlineFormat } from 'agent-swarm-kit';
import { CompletionName } from '@backtest-kit/ollama';

const format: IOutlineFormat = {
  type: 'object',
  properties: {
    take_profit_price: { type: 'number', description: 'Take profit price in USD' },
    stop_loss_price:   { type: 'number', description: 'Stop-loss price in USD' },
    description:       { type: 'string', description: 'User-friendly risk explanation, min 10 sentences' },
    reasoning:         { type: 'string', description: 'Technical analysis, min 15 sentences' },
  },
  required: ['take_profit_price', 'stop_loss_price', 'description', 'reasoning'],
};

addOutline({
  outlineName: 'SignalOutline', format, completion: CompletionName.RunnerOutlineCompletion,
  prompt: 'Generate crypto trading signals from price & volume indicators in JSON.',
  getOutlineHistory: async ({ history, param }) => {
    const report = await ioc.signalReportService.getSignalReport(param);
    await commitReports(history, report);
    await history.push({ role: 'user', content: 'Generate JSON based on reports.' });
  },
  validations: [
    { docDescription: 'Stop-loss vs max loss %',  validate: ({ data }) => { if (data.action === 'buy' && percentDiff(data.current_price, data.stop_loss_price)   > CC_LADDER_STOP_LOSS)   throw new Error(`SL must not exceed -${CC_LADDER_STOP_LOSS}%`); } },
    { docDescription: 'Take-profit vs max profit %', validate: ({ data }) => { if (data.action === 'buy' && percentDiff(data.current_price, data.take_profit_price) > CC_LADDER_TAKE_PROFIT) throw new Error(`TP must not exceed +${CC_LADDER_TAKE_PROFIT}%`); } },
  ],
});
```

</details>

---

## Prompts

Prompt modules receive trading context automatically. `system` may be a string array or a function of `(symbol, strategyName, exchangeName, frameName, backtest)`; `user` likewise.

<details>
<summary>Module file, inline prompt & commitPrompt</summary>

```javascript
// config/prompt/signal.prompt.cjs
module.exports = {
  system: (symbol, strategyName, exchangeName, frameName, backtest) => [
    `You are analyzing ${symbol} on ${exchangeName}`,
    `Strategy: ${strategyName}, Timeframe: ${frameName}`,
    backtest ? 'Backtest mode' : 'Live mode',
  ],
  user: (symbol) => `Analyze ${symbol} and return a trading decision`,
};
```

```typescript
import { Module, Prompt, commitPrompt, MessageModel } from '@backtest-kit/ollama';

// from a .cjs module (default baseDir: {cwd}/config/prompt/), memoized
const signalModule = Module.fromPath('./signal.prompt.cjs');
// or inline
const inline = Prompt.fromPrompt({ system: ['You are a trading bot'], user: (symbol) => `Trend for ${symbol}?` });

const messages: MessageModel[] = [];
await commitPrompt(signalModule, messages);   // pushes rendered system + user messages with context
```

Full strategy: register the outline, build messages from a prompt, request structured JSON, wrap with a provider HOF:

```typescript
import './outline/signal.outline';
import { deepseek, Module, commitPrompt, MessageModel } from '@backtest-kit/ollama';
import { addStrategy } from 'backtest-kit';
import { json } from 'agent-swarm-kit';

const signalModule = Module.fromPath('./signal.prompt.cjs');
const getSignal = async () => {
  const messages: MessageModel[] = [];
  await commitPrompt(signalModule, messages);
  const { data } = await json('SignalOutline', messages);
  return data;
};
addStrategy({ strategyName: 'llm-signal', interval: '5m',
  getSignal: deepseek(getSignal, 'deepseek-chat', process.env.DEEPSEEK_API_KEY) });
```

</details>

---

## Debugging — dump the conversation

`dumpSignalData(signalId, history, signal, outputDir?)` archives the full LLM conversation attached to a signal, so an opaque model decision becomes a readable record. Skips if the directory already exists (never overwrites prior runs).

<details>
<summary>What it writes</summary>

Into `{outputDir}/{signalId}/` (default `./dump/strategy`): `00_system_prompt.md` (system messages + output summary), numbered `XX_user_message.md` / `XX_assistant_message.md` per turn, and a final `XX_llm_output.md` with the signal DTO. Call it from `getSignal` right before returning the signal.

</details>

---

## Strategy optimizer — generate runnable strategy code

The most powerful piece, and the one the rest of the package feeds: `Optimizer` uses an LLM to analyze a symbol across training ranges and emit a **complete, executable strategy file** — imports, helpers, strategies, walker, and launcher — that you can run with backtest-kit directly.

<details>
<summary>Optimizer API + addOptimizerSchema + progress events</summary>

```typescript
import { Optimizer, addOptimizerSchema, listenOptimizerProgress } from '@backtest-kit/ollama';

// describe sources, training ranges, strategy/template generation (see IOptimizer* interfaces)
addOptimizerSchema({ optimizerName: 'my-optimizer', /* sources, ranges, strategy, template */ });

listenOptimizerProgress((p) => console.log(p)); // ProgressOptimizerContract

const strategies = await Optimizer.getData('BTCUSDT', { optimizerName: 'my-optimizer' }); // metadata + LLM context per range
const code       = await Optimizer.getCode('BTCUSDT', { optimizerName: 'my-optimizer' }); // full TS/JS source as string
await Optimizer.dump('BTCUSDT', { optimizerName: 'my-optimizer' }, './output');           // writes {optimizerName}_{symbol}.mjs
```

`getData` fetches from all sources and builds the LLM conversation per training range; `getCode` assembles the executable strategy; `dump` writes it to `{optimizerName}_{symbol}.mjs`. Companion registry functions: `getOptimizerSchema`, `listOptimizerSchema`, and `listenError`. The engine behind it is `common/ClientOptimizer.ts` driven by the `IOptimizer*` interfaces (`IOptimizerSchema`, `IOptimizerSource`, `IOptimizerStrategy`, `IOptimizerTemplate`, `IOptimizerRange`, `IOptimizerData`, `IOptimizerFetchArgs`, `IOptimizerFilterArgs`, `IOptimizerCallbacks`).

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `ollama` `gpt5` `claude` `deepseek` `grok` `groq` `mistral` `perplexity` `cohere` `alibaba` `hf` `glm4` | Provider HOFs — `(fn, model, apiKey?) => fn` |
| `CompletionName` | Completion-name enum for `agent-swarm-kit` outlines (`RunnerOutlineCompletion`, …) |
| `Module.fromPath(path, baseDir?)` | Load a prompt `.cjs` module (default baseDir `{cwd}/config/prompt/`) |
| `Prompt.fromPrompt(source)` | Build a prompt from an inline `PromptModel` |
| `commitPrompt(source, history)` | Render a Module/Prompt's system+user messages into `history` |
| `dumpSignalData(id, history, signal, dir?)` | Archive the LLM conversation for one signal |
| `validate(...)` | Validate an outline result |
| `Optimizer` | `.getData` / `.getCode` / `.dump` — LLM strategy-code generation |
| `addOptimizerSchema` · `getOptimizerSchema` · `listOptimizerSchema` | Optimizer schema registry |
| `listenOptimizerProgress` · `listenError` | Optimizer progress / error events |
| `MessageModel` `MessageRole` `PromptModel` | Message & prompt models |
| `IOptimizer*` · `ProgressOptimizerContract` | Optimizer interfaces & progress contract |
| `lib` | The internal engine (IoC container) for advanced use |

<details>
<summary>Complete source map</summary>

- `function/signal.function.ts` — the 12 provider HOFs. `function/{add,get,list,event,setup,validate,history,dump,signal}.ts` — registry, events, `setLogger`, `commitPrompt`, `dumpSignalData`.
- `client/*Provider.client.ts` (12) — per-provider SDK adapters. `config/*.ts` — per-provider base URLs/params, `ollama.rotate.ts` (token rotation), `params.ts`, `emitters.ts`.
- `classes/` — `Module`, `Prompt`, `Optimizer`. `common/ClientOptimizer.ts` — the optimizer engine.
- `enum/` — `InferenceName` (12), `CompletionName`. `interface/Optimizer.interface.ts`, `contract/ProgressOptimizer.contract.ts`, `model/{Message,Prompt}.model.ts`.
- `helpers/{toLintMarkdown,toPlainString}.ts`, `lib/` (IoC: `core/{di,provide,types}`, services). Nothing in `src/` is undocumented.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
