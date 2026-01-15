# 🤖 @backtest-kit/ollama

> Multi-provider LLM inference library for AI-powered trading strategies. Supports 10+ providers including OpenAI, Claude, DeepSeek, Grok, and more with unified API and automatic token rotation.

![bots](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/bots.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/ollama.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/ollama)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Transform technical analysis into trading decisions with multi-provider LLM support, structured output, and built-in risk management.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

## ✨ Features

- 🔌 **10+ LLM Providers**: OpenAI, Claude, DeepSeek, Grok, Mistral, Perplexity, Cohere, Alibaba, Hugging Face, Ollama
- 🔄 **Token Rotation**: Automatic API key rotation for Ollama (others throw clear errors)
- 🎯 **Structured Output**: Enforced JSON schema for trading signals (position, price levels, risk notes)
- 🔑 **Flexible Auth**: Context-based API keys or environment variables
- ⚡ **Unified API**: Single interface across all providers
- 📊 **Trading-First**: Built for backtest-kit with position sizing and risk management
- 🛡️ **Type Safe**: Full TypeScript support with exported types

## 📋 What It Does

`@backtest-kit/ollama` provides a unified interface to call multiple LLM providers and receive structured trading signals:

| Provider | Function | Base URL |
|----------|----------|----------|
| **OpenAI** | `gpt5()` | `https://api.openai.com/v1/` |
| **Claude** | `claude()` | `https://api.anthropic.com/v1/` |
| **DeepSeek** | `deepseek()` | `https://api.deepseek.com/` |
| **Grok** | `grok()` | `https://api.x.ai/v1/` |
| **Mistral** | `mistral()` | `https://api.mistral.ai/v1/` |
| **Perplexity** | `perplexity()` | `https://api.perplexity.ai/` |
| **Cohere** | `cohere()` | `https://api.cohere.ai/compatibility/v1/` |
| **Alibaba** | `alibaba()` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/` |
| **Hugging Face** | `hf()` | `https://router.huggingface.co/v1/` |
| **Ollama** | `ollama()` | `https://ollama.com/` |
| **Zhipu AI** | `glm4()` | `https://api.z.ai/api/paas/v4/` |

**Output Schema:**

```typescript
{
  id: string;              // Unique signal ID
  position: "long" | "short";  // Trading direction
  minuteEstimatedTime: number; // Hold duration estimate
  priceStopLoss: number;       // Stop loss price
  priceTakeProfit: number;     // Take profit price
  note: string;                // Risk assessment note
  priceOpen: number;           // Entry price
}
```

## 🚀 Installation

```bash
npm install @backtest-kit/ollama agent-swarm-kit backtest-kit
```

## 📖 Usage

### Quick Start - OpenAI

```typescript
import { gpt5 } from '@backtest-kit/ollama';
import { commitHistorySetup } from '@backtest-kit/signals';

// Build context with technical analysis
const messages = [
  {
    role: 'system',
    content: 'You are a trading bot. Analyze indicators and return JSON: { position: "long"|"short", priceStopLoss, priceTakeProfit, minuteEstimatedTime, priceOpen, note }'
  }
];

await commitHistorySetup('BTCUSDT', messages);

// Get trading signal from GPT-5
const signal = await gpt5(messages, 'gpt-4o', process.env.CC_OPENAI_API_KEY);

console.log(signal);
// {
//   id: "abc-123",
//   position: "long",
//   priceStopLoss: 49000,
//   priceTakeProfit: 51000,
//   minuteEstimatedTime: 60,
//   priceOpen: 50000,
//   note: "Strong bullish momentum with RSI oversold recovery"
// }
```

### Multi-Provider Strategy

```typescript
import { gpt5, claude, deepseek } from '@backtest-kit/ollama';
import { addStrategy } from 'backtest-kit';
import { commitHistorySetup } from '@backtest-kit/signals';

addStrategy({
  strategyName: 'multi-llm',
  interval: '5m',
  riskName: 'aggressive',
  getSignal: async (symbol) => {
    const messages = [
      {
        role: 'system',
        content: 'Analyze technical data and return trading signal as JSON'
      }
    ];

    await commitHistorySetup(symbol, messages);

    // Try multiple providers with fallback
    try {
      return await deepseek(messages, 'deepseek-chat');
    } catch (err) {
      console.warn('DeepSeek failed, trying Claude:', err);
      try {
        return await claude(messages, 'claude-3-5-sonnet-20241022');
      } catch (err2) {
        console.warn('Claude failed, using GPT-5:', err2);
        return await gpt5(messages, 'gpt-4o');
      }
    }
  }
});
```

### Token Rotation (Ollama Only)

Ollama supports automatic API key rotation by passing an array:

```typescript
import { ollama } from '@backtest-kit/ollama';

const signal = await ollama(
  messages,
  'llama3.3:70b',
  ['key1', 'key2', 'key3']  // Rotates through keys
);

// Other providers throw error:
// "Claude provider does not support token rotation"
```

### Custom Logger

Enable logging for debugging:

```typescript
import { setLogger } from '@backtest-kit/ollama';

setLogger({
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
});
```

## 💡 Why Use @backtest-kit/ollama?

Instead of manually integrating LLM SDKs:

```typescript
// ❌ Without ollama (manual work)
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

```typescript
// ✅ With ollama (one line)
const signal = await gpt5(messages, 'gpt-4o');
```

**Benefits:**

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
