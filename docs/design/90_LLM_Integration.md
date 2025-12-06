# LLM Integration

This document describes the integration of Large Language Model (LLM) services into the backtest-kit optimization pipeline. It covers the Ollama API integration, prompt engineering patterns, conversation history management, and response processing mechanisms that enable AI-driven strategy generation.

For information about the overall optimizer architecture and data collection, see [Optimizer Architecture](#16.5.1) and [Data Collection Pipeline](#16.5.2). For details on how LLM responses are transformed into executable strategy code, see [Strategy Code Generation](#16.5.4).

## Integration Architecture

The LLM integration serves as the intelligence layer that analyzes multi-timeframe market data and generates trading strategy recommendations. The system follows a request-response pattern where historical market data is formatted into prompts, sent to the LLM service, and the responses are captured for code generation.

```mermaid
graph TB
    subgraph "User Code"
        addOptimizer["addOptimizer()"]
        getPrompt["getPrompt callback"]
    end
    
    subgraph "Optimizer Execution"
        ClientOptimizer["ClientOptimizer"]
        getData["getData()"]
        getCode["getCode()"]
    end
    
    subgraph "LLM Integration Layer"
        text["text() helper"]
        json["json() helper"]
        OllamaClient["Ollama Client"]
    end
    
    subgraph "External Service"
        OllamaAPI["Ollama API"]
        Model["deepseek-v3.1:671b"]
    end
    
    subgraph "Data Pipeline"
        MessageList["messages array"]
        UserMessages["user messages"]
        AssistantMessages["assistant messages"]
    end
    
    addOptimizer -->|registers| getPrompt
    getPrompt -->|called by| ClientOptimizer
    
    ClientOptimizer -->|builds| MessageList
    MessageList -->|contains| UserMessages
    MessageList -->|contains| AssistantMessages
    
    ClientOptimizer -->|invokes| getPrompt
    getPrompt -->|calls| text
    
    text -->|configures| OllamaClient
    OllamaClient -->|chat request| OllamaAPI
    OllamaAPI -->|uses| Model
    Model -->|response| OllamaClient
    OllamaClient -->|returns| text
    
    text -->|strategy text| ClientOptimizer
    ClientOptimizer -->|via getData| getCode
    
    style getPrompt fill:#ffe1e1
    style text fill:#e1f5ff
    style OllamaAPI fill:#e1ffe1
```

**Sources:** [demo/optimization/src/index.mjs:324-383](), [demo/optimization/package.json:8-14]()

## Ollama API Configuration

The system integrates with Ollama through the official `ollama` npm package. The client is configured with custom host and authentication headers to support both self-hosted and cloud-based Ollama instances.

```mermaid
flowchart LR
    subgraph "Configuration"
        EnvVar[".env file"]
        APIKey["OLLAMA_API_KEY"]
        Host["host URL"]
    end
    
    subgraph "Client Initialization"
        OllamaConstructor["new Ollama()"]
        Headers["headers config"]
        Authorization["Authorization: Bearer"]
    end
    
    subgraph "Model Configuration"
        Model["model: deepseek-v3.1:671b"]
        Think["think: true"]
        Messages["messages array"]
    end
    
    subgraph "API Communication"
        ChatMethod["ollama.chat()"]
        Response["response.message.content"]
    end
    
    EnvVar -->|provides| APIKey
    APIKey -->|read by| OllamaConstructor
    Host -->|set in| OllamaConstructor
    
    OllamaConstructor -->|creates| Headers
    Headers -->|includes| Authorization
    
    OllamaConstructor -->|used by| ChatMethod
    Model -->|parameter| ChatMethod
    Think -->|parameter| ChatMethod
    Messages -->|parameter| ChatMethod
    
    ChatMethod -->|returns| Response
```

**Configuration Structure:**

| Property | Type | Description |
|----------|------|-------------|
| `host` | string | Ollama service URL (e.g., "https://ollama.com") |
| `headers.Authorization` | string | Bearer token from `OLLAMA_API_KEY` environment variable |
| `model` | string | Model identifier: `"deepseek-v3.1:671b"` |
| `think` | boolean | Enable reasoning mode for deeper analysis |
| `messages` | array | Conversation history with role-based messages |

**Sources:** [demo/optimization/src/index.mjs:325-330](), [demo/optimization/.env.example:1-2]()

## Prompt Engineering System

The LLM integration implements a multi-layer prompt engineering pattern that combines system-level instructions, contextual data formatting, and specific trading analysis requests.

### System Prompts

System prompts establish the operational context and output format requirements. The system uses two sequential system messages:

```mermaid
graph TB
    subgraph "System Message 1: Output Format"
        Format1["В ответ напиши торговую стратегию"]
        Format2["где нет ничего лишнего"]
        Format3["только отчёт готовый для копипасты"]
        Format4["Не здоровайся, не говори что делаешь"]
        Format5["только отчёт!"]
    end
    
    subgraph "System Message 2: Reasoning"
        Reasoning["Reasoning: high"]
    end
    
    subgraph "User Messages"
        DataMessage["Multi-timeframe market data"]
        AnalysisRequest["Запрос на анализ"]
    end
    
    subgraph "LLM Processing"
        DeepThinking["Deep reasoning enabled"]
        StrategyGeneration["Strategy generation"]
    end
    
    Format1 --> Format2
    Format2 --> Format3
    Format3 --> Format4
    Format4 --> Format5
    
    Format5 -->|constrains| LLM
    Reasoning -->|enables| DeepThinking
    DataMessage -->|provides| StrategyGeneration
    AnalysisRequest -->|guides| StrategyGeneration
    
    LLM[("LLM\ndeepseek-v3.1")]
    Format5 --> LLM
    DeepThinking --> LLM
    StrategyGeneration --> LLM
```

**System Prompt Components:**

1. **Output Format Instructions** [demo/optimization/src/index.mjs:338-343]():
   - Requires concise trading strategy output
   - Eliminates greetings and procedural commentary
   - Ensures copy-paste ready format

2. **Reasoning Level** [demo/optimization/src/index.mjs:346-348]():
   - Sets reasoning intensity to "high"
   - Enables deeper analytical processing

**Sources:** [demo/optimization/src/index.mjs:332-348]()

### User Query Construction

The final user message requests specific trading analysis components:

```mermaid
graph LR
    subgraph "Query Components"
        Symbol["Symbol: BTCUSDT"]
        Q1["На каких условиях купить?"]
        Q2["Анализ рынка"]
        Q3["Поддержка/Сопротивление"]
        Q4["Точки входа LONG/SHORT"]
        Q5["Risk/Reward ratio"]
        Q6["Предпочтение: LONG или SHORT"]
        Q7["Фундаментальный анализ"]
        Q8["Стратегическая рекомендация"]
    end
    
    subgraph "Analysis Focus"
        Technical["Technical Analysis"]
        Fundamental["Fundamental Analysis"]
        Strategic["Strategic Recommendations"]
    end
    
    Symbol --> Q1
    Q1 --> Q2
    Q2 --> Q3
    Q3 --> Q4
    Q4 --> Q5
    Q5 --> Q6
    Q6 --> Q7
    Q7 --> Q8
    
    Q2 --> Technical
    Q3 --> Technical
    Q4 --> Technical
    Q5 --> Technical
    Q7 --> Fundamental
    Q8 --> Strategic
```

**Query Structure:**

| Component | Purpose |
|-----------|---------|
| Entry conditions | Specific criteria for position opening |
| Market analysis | Support/resistance levels, trend identification |
| Entry points | LONG and SHORT position entry prices |
| Risk/Reward | Take-profit and stop-loss ratios |
| Directional bias | Preference for LONG vs SHORT positions |
| Fundamental analysis | Non-technical strategic recommendations |

**Sources:** [demo/optimization/src/index.mjs:351-359]()

## Message Structure and Conversation History

The LLM receives a conversation history built from multi-timeframe data sources. Each source contributes a user-assistant message pair to the conversation.

```mermaid
sequenceDiagram
    participant CO as ClientOptimizer
    participant Source1 as long-term-range
    participant Source2 as swing-term-range
    participant Source3 as short-term-range
    participant Source4 as micro-term-range
    participant LLM as Ollama API
    
    Note over CO: Build conversation for date range
    
    CO->>Source1: fetch 1h candles
    Source1-->>CO: data array
    CO->>CO: format to markdown table
    CO->>CO: append user message (1h analysis)
    CO->>CO: append assistant message "OK"
    
    CO->>Source2: fetch 30m candles
    Source2-->>CO: data array
    CO->>CO: format to markdown table
    CO->>CO: append user message (30m analysis)
    CO->>CO: append assistant message "OK"
    
    CO->>Source3: fetch 15m candles
    Source3-->>CO: data array
    CO->>CO: format to markdown table
    CO->>CO: append user message (15m analysis)
    CO->>CO: append assistant message "OK"
    
    CO->>Source4: fetch 1m candles
    Source4-->>CO: data array
    CO->>CO: format to markdown table
    CO->>CO: append user message (1m analysis)
    CO->>CO: append assistant message "OK"
    
    CO->>LLM: chat(systemPrompts + messages + finalQuery)
    LLM-->>CO: strategy recommendation
```

**Message Roles:**

| Role | Content | Purpose |
|------|---------|---------|
| `system` | Output format instructions | Define response constraints |
| `system` | Reasoning level | Configure analysis depth |
| `user` | Markdown table + indicator explanations | Provide timeframe data |
| `assistant` | Acknowledgment message | Confirm data receipt |
| `user` | Analysis request | Request strategy generation |

**User Message Format:**

Each user message contains:
1. Timeframe header (e.g., "# 1-Hour Candles Trading Analysis")
2. Markdown table with OHLCV and technical indicators
3. Data sources section explaining each indicator's calculation period

**Assistant Message Format:**

Each assistant message provides acknowledgment in Russian:
- 1h: "Исторические данные 1-часовых свечей получены"
- 30m: "Исторические данные 30-минутных свечей получены"
- 15m: "Исторические данные 15-минутных свечей получены"
- 1m: "Исторические данные 1-минутных свечей получены"

**Sources:** [demo/optimization/src/index.mjs:86-126](), [demo/optimization/src/index.mjs:147-186](), [demo/optimization/src/index.mjs:207-244](), [demo/optimization/src/index.mjs:265-320]()

## Response Processing

The LLM response undergoes character escaping to ensure safe embedding in generated JavaScript code. The response text becomes part of a string literal in the generated strategy file.

```mermaid
flowchart TB
    subgraph "Response Reception"
        ChatCall["ollama.chat()"]
        ResponseObj["response object"]
        MessageContent["response.message.content"]
        Trim["content.trim()"]
    end
    
    subgraph "Escape Pipeline"
        Backslash["Escape backslashes: \\ -> \\\\"]
        Backticks["Escape backticks: ` -> \\`"]
        Dollar["Escape dollar signs: $ -> \\$"]
        DoubleQuote["Escape double quotes: \" -> \\\""]
        SingleQuote["Escape single quotes: ' -> \\'"]
    end
    
    subgraph "Output"
        EscapedString["Escaped string"]
        StrategyCode["Embedded in strategy code"]
    end
    
    ChatCall --> ResponseObj
    ResponseObj --> MessageContent
    MessageContent --> Trim
    
    Trim --> Backslash
    Backslash --> Backticks
    Backticks --> Dollar
    Dollar --> DoubleQuote
    DoubleQuote --> SingleQuote
    
    SingleQuote --> EscapedString
    EscapedString --> StrategyCode
```

**Escape Sequence:**

| Character | Pattern | Replacement | Purpose |
|-----------|---------|-------------|---------|
| Backslash | `\` | `\\` | Escape existing escape sequences |
| Backtick | `` ` `` | `` \` `` | Prevent template literal injection |
| Dollar sign | `$` | `\$` | Prevent template variable interpolation |
| Double quote | `"` | `\"` | Prevent string literal termination |
| Single quote | `'` | `\'` | Prevent string literal termination |

**Processing Order:**

The escape sequence follows a specific order to prevent double-escaping:
1. Backslashes first (to avoid escaping added backslashes)
2. Template literal characters (backticks, dollar signs)
3. Quote characters (double and single quotes)

**Sources:** [demo/optimization/src/index.mjs:364-370]()

## Helper Functions

The optimizer system provides two helper functions for LLM interaction, available through template customization:

### text() Helper

The `text()` function performs synchronous LLM calls with conversation history:

```mermaid
graph TB
    subgraph "Function Signature"
        TextFn["text(symbol, messages)"]
        Symbol["symbol: string"]
        Messages["messages: array"]
    end
    
    subgraph "Internal Processing"
        OllamaInit["Initialize Ollama client"]
        BuildChat["Build chat request"]
        SystemPrompt["Add system prompts"]
        UserMessages["Add user messages"]
        FinalQuery["Add analysis query"]
        SendRequest["Send to LLM"]
        Escape["Escape response"]
    end
    
    subgraph "Return Value"
        EscapedText["Escaped strategy text"]
    end
    
    TextFn --> Symbol
    TextFn --> Messages
    
    Symbol --> BuildChat
    Messages --> UserMessages
    
    OllamaInit --> BuildChat
    BuildChat --> SystemPrompt
    SystemPrompt --> UserMessages
    UserMessages --> FinalQuery
    FinalQuery --> SendRequest
    SendRequest --> Escape
    
    Escape --> EscapedText
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Trading pair symbol (e.g., "BTCUSDT") |
| `messages` | array | Conversation history with user/assistant messages |

**Returns:** Escaped string containing LLM-generated trading strategy

**Sources:** [demo/optimization/src/index.mjs:324-371]()

### json() Helper

The `json()` function is similar to `text()` but parses the response as JSON. This helper is available for custom template implementations but not used in the default optimizer flow.

```mermaid
graph LR
    subgraph "Template Integration"
        DefaultTemplate["Default OptimizerTemplateService"]
        CustomTemplate["Custom template merger"]
        HelperExport["text/json helper exports"]
    end
    
    subgraph "Usage Context"
        GetPrompt["getPrompt callback"]
        StrategyGeneration["Strategy generation"]
        TextResponse["Text-based response"]
    end
    
    subgraph "Alternative Usage"
        JsonHelper["json() helper"]
        StructuredData["Structured strategy data"]
        CustomProcessing["Custom post-processing"]
    end
    
    DefaultTemplate -->|provides| HelperExport
    CustomTemplate -->|overrides| HelperExport
    
    HelperExport -->|exports| GetPrompt
    GetPrompt -->|calls text()| StrategyGeneration
    StrategyGeneration -->|returns| TextResponse
    
    JsonHelper -.->|alternative| StructuredData
    StructuredData -.->|enables| CustomProcessing
```

**Sources:** Reference implementation pattern from [src/client/ClientOptimizer.ts]() (not shown in provided files)

## Integration Points

The LLM integration connects to the optimizer system through the `IOptimizerSchema` interface:

```mermaid
graph TB
    subgraph "Schema Definition"
        IOptimizerSchema["IOptimizerSchema"]
        GetPromptField["getPrompt: function"]
    end
    
    subgraph "User Implementation"
        addOptimizer["addOptimizer()"]
        GetPromptImpl["getPrompt: async (symbol, messages)"]
        TextCall["await text(symbol, messages)"]
    end
    
    subgraph "Execution Flow"
        OptimizerDump["Optimizer.dump()"]
        ClientOptimizer["ClientOptimizer.getData()"]
        MessageBuild["Build message list"]
        InvokeGetPrompt["Invoke getPrompt"]
        CollectStrategies["Collect strategy list"]
    end
    
    subgraph "Code Generation"
        GetCode["ClientOptimizer.getCode()"]
        StrategyTemplate["getStrategyTemplate()"]
        EmbedPrompt["Embed LLM prompt in code"]
    end
    
    IOptimizerSchema -->|defines| GetPromptField
    GetPromptField -->|implemented by| addOptimizer
    addOptimizer -->|provides| GetPromptImpl
    GetPromptImpl -->|calls| TextCall
    
    OptimizerDump -->|creates| ClientOptimizer
    ClientOptimizer -->|builds| MessageBuild
    MessageBuild -->|calls| InvokeGetPrompt
    InvokeGetPrompt -->|uses| GetPromptImpl
    GetPromptImpl -->|returns| CollectStrategies
    
    CollectStrategies -->|input to| GetCode
    GetCode -->|uses| StrategyTemplate
    StrategyTemplate -->|contains| EmbedPrompt
```

**Integration Contract:**

```typescript
interface IOptimizerSchema {
    optimizerName: string;
    rangeTrain: Array<{ startDate: Date; endDate: Date; note?: string }>;
    rangeTest: { startDate: Date; endDate: Date; note?: string };
    source: Array<{
        name: string;
        fetch: (params) => Promise<any[]>;
        user: (symbol: string, data: any[]) => string;
        assistant: () => string;
    }>;
    getPrompt: (symbol: string, messages: Message[]) => Promise<string>;
}
```

**Callback Sequence:**

1. **Data Collection Phase:** For each training date and source, the optimizer calls `source.fetch()` to retrieve data
2. **Message Formatting:** Formats data using `source.user()` and `source.assistant()`
3. **LLM Invocation:** Calls `getPrompt(symbol, messageList)` with accumulated messages
4. **Strategy Collection:** Stores returned strategy text in internal array
5. **Code Generation:** Embeds strategy text in generated code via template system

**Sources:** [demo/optimization/src/index.mjs:373-383](), [demo/optimization/src/index.mjs:389-395]()

## Progress Monitoring

The LLM integration emits progress events during data collection, allowing external monitoring of the optimization process:

```mermaid
sequenceDiagram
    participant User as listenOptimizerProgress
    participant Emitter as progressOptimizerEmitter
    participant CO as ClientOptimizer
    participant LLM as Ollama API
    
    User->>Emitter: Subscribe to progress
    
    loop For each training date
        loop For each source (1h, 30m, 15m, 1m)
            CO->>CO: Fetch source data
            CO->>Emitter: Emit progress event
            Emitter->>User: { progress, processedSources, totalSources }
        end
        CO->>LLM: Call getPrompt with messages
        LLM-->>CO: Return strategy text
    end
    
    CO->>Emitter: Emit final progress (1.0)
    Emitter->>User: { progress: 1.0, ... }
```

**Progress Event Structure:**

| Field | Type | Description |
|-------|------|-------------|
| `optimizerName` | string | Name of the executing optimizer |
| `symbol` | string | Trading symbol being optimized |
| `totalSources` | number | Total data sources to process |
| `processedSources` | number | Number of sources processed |
| `progress` | number | Completion ratio (0.0 to 1.0) |

**Example Usage:**

```javascript
listenOptimizerProgress(({ progress }) => {
  console.log(`Progress: ${progress * 100}%`);
});
```

**Sources:** [demo/optimization/src/index.mjs:385-387](), [src/contract/ProgressOptimizer.contract.ts:1-31]()