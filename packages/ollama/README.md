# 🤖 @backtest-kit/ollama

> Multi-provider LLM context wrapper for trading strategies. Supports 10+ providers with unified HOF API.

![bots](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/bots.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/ollama.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/ollama)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Transform technical analysis into trading decisions with multi-provider LLM support, structured output, and built-in risk management.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

## ✨ Features

- 🔌 10+ LLM Providers: OpenAI, Claude, DeepSeek, Grok, Mistral, Perplexity, Cohere, Alibaba, Hugging Face, Ollama, GLM-4
- ⚡ Higher-Order Functions: Wrap async functions with inference context via `di-scoped`
- 📝 Userspace Prompts: Load prompts from `.cjs` modules in `config/prompt/`
- 🎯 Userspace Schema: Define your own Zod or JSON schema with `addOutline` / `addOutlineSchema`
- 🔄 Token Rotation: Pass array of API keys for automatic rotation
- 🗄️ Memoized Cache: Prompt modules cached with `memoize` from `functools-kit`

## 📦 Installation

```bash
npm install @backtest-kit/ollama backtest-kit agent-swarm-kit
```

## 🚀 Usage

### Signal Schema (userspace)

```typescript
// schema/Signal.schema.ts
import { z } from 'zod';
import { str } from 'functools-kit';

export const SignalSchema = z.object({
  position: z.enum(['long', 'short', 'wait']).describe(
    str.newline(
      'Position direction:',
      'long: bullish signals, uptrend potential',
      'short: bearish signals, downtrend potential',
      'wait: conflicting signals or unfavorable conditions',
    )
  ),
  price_open: z.number().describe(
    str.newline(
      'Entry price in USD',
      'Current market price or limit order price',
    )
  ),
  price_stop_loss: z.number().describe(
    str.newline(
      'Stop-loss price in USD',
      'LONG: below price_open',
      'SHORT: above price_open',
    )
  ),
  price_take_profit: z.number().describe(
    str.newline(
      'Take-profit price in USD',
      'LONG: above price_open',
      'SHORT: below price_open',
    )
  ),
  minute_estimated_time: z.number().describe(
    'Estimated time to reach TP in minutes'
  ),
  risk_note: z.string().describe(
    str.newline(
      'Risk assessment:',
      '- Whale manipulations',
      '- Order book imbalance',
      '- Technical divergences',
      'Provide specific numbers and percentages',
    )
  ),
});

export type TSignalSchema = z.infer<typeof SignalSchema>;
```

### Signal Outline with Zod (userspace)

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
  getOutlineHistory: async ({ history, param: messages = [] }) => {
    await history.push(messages);
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.position === 'long' && data.price_stop_loss >= data.price_open) {
          throw new Error('For LONG, stop_loss must be below price_open');
        }
        if (data.position === 'short' && data.price_stop_loss <= data.price_open) {
          throw new Error('For SHORT, stop_loss must be above price_open');
        }
      },
    },
  ],
});
```

### Signal Outline without Zod (userspace)

```typescript
// outline/signal.outline.ts
import { addOutlineSchema, IOutlineFormat } from 'agent-swarm-kit';
import { CompletionName } from '@backtest-kit/ollama';

const format: IOutlineFormat = {
  type: 'object',
  properties: {
    take_profit_price: { type: 'number', description: 'Take profit price in USD' },
    stop_loss_price: { type: 'number', description: 'Stop-loss price in USD' },
    description: { type: 'string', description: 'User-friendly explanation of risks, min 10 sentences' },
    reasoning: { type: 'string', description: 'Technical analysis, min 15 sentences' },
  },
  required: ['take_profit_price', 'stop_loss_price', 'description', 'reasoning'],
};

addOutlineSchema({
  outlineName: 'SignalOutline',
  format,
  prompt: 'Generate crypto trading signals based on price and volume indicators in JSON format.',
  completion: CompletionName.RunnerOutlineCompletion,
  getOutlineHistory: async ({ history, param }) => {
    const signalReport = await ioc.signalReportService.getSignalReport(param);
    await commitReports(history, signalReport);
    await history.push({ role: 'user', content: 'Generate JSON based on reports.' });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.action !== 'buy') return;
        const stopLossChange = percentDiff(data.current_price, data.stop_loss_price);
        if (stopLossChange > CC_LADDER_STOP_LOSS) {
          throw new Error(`Stop loss must not exceed -${CC_LADDER_STOP_LOSS}%`);
        }
      },
      docDescription: 'Checks stop-loss price against max loss percentage.',
    },
    {
      validate: ({ data }) => {
        if (data.action !== 'buy') return;
        const sellChange = percentDiff(data.current_price, data.take_profit_price);
        if (sellChange > CC_LADDER_TAKE_PROFIT) {
          throw new Error(`Take profit must not exceed +${CC_LADDER_TAKE_PROFIT}%`);
        }
      },
      docDescription: 'Checks take-profit price against max profit percentage.',
    },
  ],
});
```

### Prompt Module (userspace)

```typescript
// config/prompt/signal.prompt.cjs
module.exports = {
  system: (symbol, strategyName, exchangeName, frameName, backtest) => [
    `You are analyzing ${symbol} on ${exchangeName}`,
    `Strategy: ${strategyName}, Timeframe: ${frameName}`,
    backtest ? 'Backtest mode' : 'Live mode',
  ],
  user: (symbol) => `Analyze ${symbol} and return trading decision`,
};
```

### Strategy

```typescript
// strategy.ts
import './outline/signal.outline'; // register outline

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

addStrategy({
  strategyName: 'llm-signal',
  interval: '5m',
  getSignal: deepseek(getSignal, 'deepseek-chat', process.env.DEEPSEEK_API_KEY),
});
```

### Dynamic Prompt

```typescript
// config/prompt/risk.prompt.cjs
module.exports = {
  system: ['You are a risk analyst', 'Be conservative'],
  user: (symbol, strategyName, exchangeName, frameName, backtest) =>
    `Evaluate risk for ${symbol} position on ${frameName} timeframe`,
};
```

### Inline Prompt

```typescript
import { Prompt, commitPrompt, MessageModel } from '@backtest-kit/ollama';

const prompt = Prompt.fromPrompt({
  system: ['You are a trading bot'],
  user: (symbol) => `What is the trend for ${symbol}?`,
});

const messages: MessageModel[] = [];
await commitPrompt(prompt, messages);
```

### Token Rotation

```typescript
import { ollama } from '@backtest-kit/ollama';

const wrappedFn = ollama(myFn, 'llama3.3:70b', ['key1', 'key2', 'key3']);
```

## 🔌 Providers

| Provider | Function | Base URL |
|----------|----------|----------|
| OpenAI | `gpt5()` | `https://api.openai.com/v1/` |
| Claude | `claude()` | `https://api.anthropic.com/v1/` |
| DeepSeek | `deepseek()` | `https://api.deepseek.com/` |
| Grok | `grok()` | `https://api.x.ai/v1/` |
| Mistral | `mistral()` | `https://api.mistral.ai/v1/` |
| Perplexity | `perplexity()` | `https://api.perplexity.ai/` |
| Cohere | `cohere()` | `https://api.cohere.ai/compatibility/v1/` |
| Alibaba | `alibaba()` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/` |
| Hugging Face | `hf()` | `https://router.huggingface.co/v1/` |
| Ollama | `ollama()` | `http://localhost:11434/` |
| Zhipu AI | `glm4()` | `https://open.bigmodel.cn/api/paas/v4/` |

## 📖 API

### Provider HOF

```typescript
ollama | gpt5 | claude | deepseek | grok | mistral | perplexity | cohere | alibaba | hf | glm4
(fn, model, apiKey?) => fn
```

### Module

```typescript
Module.fromPath(path: string, baseDir?: string): Module
```

Default baseDir: `{cwd}/config/prompt/`

### Prompt

```typescript
Prompt.fromPrompt(source: PromptModel): Prompt
```

### commitPrompt

```typescript
async function commitPrompt(source: Module | Prompt, history: MessageModel[]): Promise<void>
```

### PromptModel

```typescript
interface PromptModel {
  system?: string[] | SystemPromptFn;
  user: string | UserPromptFn;
}

type SystemPromptFn = (
  symbol: string,
  strategyName: string,
  exchangeName: string,
  frameName: string,
  backtest: boolean
) => Promise<string[]> | string[];

type UserPromptFn = (
  symbol: string,
  strategyName: string,
  exchangeName: string,
  frameName: string,
  backtest: boolean
) => Promise<string> | string;
```

## 💡 Why Use @backtest-kit/ollama?

Instead of manually integrating LLM SDKs:

**❌ Without ollama (manual work)**

```typescript
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  response_format: { type: 'json_object' }
});
const signal = JSON.parse(response.choices[0].message.content);
// ... manual schema validation
// ... manual error handling
// ... no fallback
```

**✅ With ollama (one line)**

```typescript
const signal = await gpt5(messages, 'gpt-4o');
```

**🔥 Benefits:**

- ⚡ Unified API across 10+ providers
- 🎯 Enforced JSON schema (no parsing errors)
- 🔄 Built-in token rotation (Ollama)
- 🔑 Context-based API keys
- 🛡️ Type-safe TypeScript interfaces
- 📊 Trading-specific output format

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
