# Training vs Testing Ranges

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.claude/settings.local.json](.claude/settings.local.json)
- [demo/optimization/.env.example](demo/optimization/.env.example)
- [demo/optimization/.gitignore](demo/optimization/.gitignore)
- [demo/optimization/package-lock.json](demo/optimization/package-lock.json)
- [demo/optimization/package.json](demo/optimization/package.json)
- [demo/optimization/src/index.mjs](demo/optimization/src/index.mjs)
- [demo/trade/.gitkeep](demo/trade/.gitkeep)
- [src/contract/ProgressOptimizer.contract.ts](src/contract/ProgressOptimizer.contract.ts)

</details>



This page documents the `rangeTrain` and `rangeTest` configuration parameters in the Optimizer system, which implement walk-forward validation and temporal data splitting for AI-powered strategy generation. These parameters prevent overfitting by segregating historical data into training periods (where the LLM learns market patterns) and testing periods (where generated strategies are validated on unseen data).

For information about the complete AI optimization pipeline, see [AI-Powered Strategy Optimization](#16.5). For details about LLM integration and prompt engineering, see [LLM Integration](#16.5.3). For strategy code generation, see [Strategy Code Generation](#16.5.4).

---

## Purpose and Overview

The Optimizer system uses temporal data splitting to generate robust trading strategies through supervised learning. The `rangeTrain` array defines multiple historical date ranges that the LLM analyzes to identify market patterns, while `rangeTest` defines a separate chronologically-later period for out-of-sample validation. This approach mirrors the train-test split methodology in machine learning, adapted for time-series financial data where temporal ordering must be preserved.

**Sources:** [demo/optimization/src/index.mjs:19-61]()

---

## Configuration Structure

### RangeTrain Array

The `rangeTrain` parameter is an array of date range objects, each representing a distinct training period. Each object contains:

| Field | Type | Description |
|-------|------|-------------|
| `note` | `string` | Human-readable description of the period |
| `startDate` | `Date` | Beginning of the training period (inclusive) |
| `endDate` | `Date` | End of the training period (inclusive) |

```mermaid
graph TB
    subgraph "rangeTrain Configuration"
        RangeArray["rangeTrain: Array&lt;RangeConfig&gt;"]
        
        Range1["Range 0<br/>note: '24 ноября 2025'<br/>startDate: 2025-11-24T00:00:00Z<br/>endDate: 2025-11-24T23:59:59Z"]
        
        Range2["Range 1<br/>note: '25 ноября 2025'<br/>startDate: 2025-11-25T00:00:00Z<br/>endDate: 2025-11-25T23:59:59Z"]
        
        RangeN["Range N-1<br/>note: '30 ноября 2025'<br/>startDate: 2025-11-30T00:00:00Z<br/>endDate: 2025-11-30T23:59:59Z"]
        
        RangeArray --> Range1
        RangeArray --> Range2
        RangeArray -.-> RangeN
    end
    
    subgraph "LLM Processing"
        Range1 --> LLM1["getData() iteration 1<br/>Multi-timeframe fetch"]
        Range2 --> LLM2["getData() iteration 2<br/>Multi-timeframe fetch"]
        RangeN --> LLMN["getData() iteration N<br/>Multi-timeframe fetch"]
        
        LLM1 --> Prompt1["getPrompt() call 1<br/>Strategy generation"]
        LLM2 --> Prompt2["getPrompt() call 2<br/>Strategy generation"]
        LLMN --> PromptN["getPrompt() call N<br/>Strategy generation"]
    end
    
    subgraph "Output"
        Prompt1 --> StrategyList["strategyList: Array&lt;string&gt;"]
        Prompt2 --> StrategyList
        PromptN --> StrategyList
    end
```

**Sources:** [demo/optimization/src/index.mjs:19-55]()

---

### RangeTest Object

The `rangeTest` parameter is a single date range object with identical structure to each `rangeTrain` element. It defines the out-of-sample validation period:

```javascript
const TEST_RANGE = {
  note: "1 декабря 2025",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-01T23:59:59Z"),
};
```

This test range must chronologically follow all training ranges to prevent temporal leakage where future information influences strategy generation.

**Sources:** [demo/optimization/src/index.mjs:57-61]()

---

## Temporal Splitting Methodology

### Walk-Forward Validation

The Optimizer implements walk-forward validation where:

1. **Multiple Training Windows**: Each `rangeTrain` element represents a distinct market regime or trading day
2. **Incremental Learning**: The LLM receives separate prompts for each training period, accumulating diverse market conditions
3. **Temporal Ordering**: Training ranges precede the test range chronologically
4. **No Look-Ahead**: The test range contains data unseen during strategy generation

```mermaid
gantt
    title Temporal Data Splitting Timeline
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    
    section Training Period
    Training Day 1 (rangeTrain[0]) :train1, 2025-11-24, 1d
    Training Day 2 (rangeTrain[1]) :train2, 2025-11-25, 1d
    Training Day 3 (rangeTrain[2]) :train3, 2025-11-26, 1d
    Training Day 4 (rangeTrain[3]) :train4, 2025-11-27, 1d
    Training Day 5 (rangeTrain[4]) :train5, 2025-11-28, 1d
    Training Day 6 (rangeTrain[5]) :train6, 2025-11-29, 1d
    Training Day 7 (rangeTrain[6]) :train7, 2025-11-30, 1d
    
    section Testing Period
    Test Day (rangeTest) :test1, 2025-12-01, 1d
```

**Sources:** [demo/optimization/src/index.mjs:19-61]()

---

## Data Flow Through Training and Testing

### Training Phase Execution

For each element in the `rangeTrain` array, the Optimizer performs:

```mermaid
flowchart TD
    Start["ClientOptimizer.getData()"]
    
    LoopStart["For each rangeTrain element"]
    
    MultiSource["For each source<br/>(1h, 30m, 15m, 1m)"]
    
    Fetch["source.fetch()<br/>symbol, startDate, endDate"]
    
    Format["arrayToMarkdownTable()<br/>Format data as table"]
    
    UserMsg["getUserMessage()<br/>Add user message to history"]
    
    AssistantMsg["getAssistantMessage()<br/>Add assistant response"]
    
    AllSources{"All sources<br/>processed?"}
    
    LLMCall["getPrompt(symbol, messageList)<br/>Call LLM with conversation history"]
    
    AppendStrategy["Append strategy text<br/>to strategyList"]
    
    AllRanges{"All rangeTrain<br/>processed?"}
    
    Return["Return strategyList"]
    
    Start --> LoopStart
    LoopStart --> MultiSource
    MultiSource --> Fetch
    Fetch --> Format
    Format --> UserMsg
    UserMsg --> AssistantMsg
    AssistantMsg --> AllSources
    AllSources -->|No| MultiSource
    AllSources -->|Yes| LLMCall
    LLMCall --> AppendStrategy
    AppendStrategy --> AllRanges
    AllRanges -->|No| LoopStart
    AllRanges -->|Yes| Return
```

Each training range generates one strategy recommendation through multi-timeframe analysis. The LLM receives 4 datasets per training range (1h, 30m, 15m, 1m candles), creating a comprehensive market view before producing strategy logic.

**Sources:** [demo/optimization/src/index.mjs:66-322](), [demo/optimization/src/index.mjs:373-383]()

---

### Testing Phase Execution

After code generation via `OptimizerTemplateService`, the generated strategies are backtested against `rangeTest`:

```mermaid
flowchart LR
    subgraph "Generated Code Structure"
        Frame1["addFrame(rangeTrain[0])<br/>Training frame 1"]
        Frame2["addFrame(rangeTrain[1])<br/>Training frame 2"]
        FrameN["addFrame(rangeTrain[N-1])<br/>Training frame N"]
        
        TestFrame["addFrame(rangeTest)<br/>Test frame"]
        
        Strategy1["addStrategy(strategy1)<br/>LLM-generated logic"]
        Strategy2["addStrategy(strategy2)<br/>LLM-generated logic"]
        
        Walker["addWalker()<br/>strategies: [strategy1, strategy2, ...]<br/>metric: 'sharpeRatio'<br/>frameName: rangeTest.note"]
    end
    
    subgraph "Execution"
        Walker --> BacktestLoop["For each strategy:<br/>BacktestLogicPublicService.run()"]
        BacktestLoop --> TestOnly["Execute on rangeTest only"]
        TestOnly --> Metrics["Extract sharpeRatio<br/>Compare strategies"]
        Metrics --> BestStrategy["Select best strategy"]
    end
    
    Frame1 -.->|Not used in backtest| Walker
    Frame2 -.->|Not used in backtest| Walker
    FrameN -.->|Not used in backtest| Walker
    TestFrame --> Walker
```

The Walker compares all generated strategies exclusively on the `rangeTest` period, ensuring performance metrics reflect out-of-sample results. Training frames are included in the generated code but not used during Walker execution.

**Sources:** [demo/optimization/src/index.mjs:376-377]()

---

## Overfitting Prevention

### Temporal Data Segregation

The separation of `rangeTrain` and `rangeTest` prevents several forms of overfitting:

| Overfitting Type | Prevention Mechanism |
|------------------|---------------------|
| **Look-Ahead Bias** | Test range chronologically follows all training ranges |
| **Data Snooping** | LLM never sees test period data during strategy generation |
| **Regime Optimization** | Multiple training days expose diverse market conditions |
| **Strategy Specialization** | Walker validates on unseen data, penalizing overfitted strategies |

```mermaid
graph TB
    subgraph "Risk: Overfitting"
        SinglePeriod["Single training period<br/>Strategy optimized for one regime"]
        FutureLeak["Test data in training<br/>Look-ahead bias"]
        InSample["Testing on training data<br/>Inflated performance"]
    end
    
    subgraph "Mitigation: rangeTrain Array"
        MultiPeriod["7 training periods<br/>Multiple market regimes<br/>Diverse conditions"]
        TempOrder["Chronological ordering<br/>startDate < endDate < rangeTest.startDate"]
        OutSample["Separate test period<br/>rangeTest != rangeTrain[i]"]
    end
    
    subgraph "Result"
        Robust["Robust strategies<br/>Generalize across conditions"]
        Realistic["Realistic metrics<br/>Out-of-sample validation"]
    end
    
    SinglePeriod -.->|Replaced by| MultiPeriod
    FutureLeak -.->|Prevented by| TempOrder
    InSample -.->|Prevented by| OutSample
    
    MultiPeriod --> Robust
    TempOrder --> Realistic
    OutSample --> Realistic
```

**Sources:** [demo/optimization/src/index.mjs:19-61]()

---

## Configuration Example

### Complete Optimizer Setup

The following demonstrates proper `rangeTrain` and `rangeTest` configuration:

```javascript
addOptimizer({
  optimizerName: "btc-optimizer",

  // Training: 7 consecutive days
  rangeTrain: [
    {
      note: "24 ноября 2025",
      startDate: new Date("2025-11-24T00:00:00Z"),
      endDate: new Date("2025-11-24T23:59:59Z"),
    },
    {
      note: "25 ноября 2025",
      startDate: new Date("2025-11-25T00:00:00Z"),
      endDate: new Date("2025-11-25T23:59:59Z"),
    },
    // ... 5 more days
  ],

  // Testing: Next chronological day
  rangeTest: {
    note: "1 декабря 2025",
    startDate: new Date("2025-12-01T00:00:00Z"),
    endDate: new Date("2025-12-01T23:59:59Z"),
  },

  source: SOURCE_LIST,
  getPrompt: async (symbol, messages) => {
    return await text(symbol, messages);
  },
});
```

This configuration trains on November 24-30, 2025 and validates on December 1, 2025, ensuring temporal integrity.

**Sources:** [demo/optimization/src/index.mjs:373-383]()

---

## Integration with Data Sources

### Multi-Timeframe Data Collection

Each training range triggers data collection across all configured sources:

```mermaid
sequenceDiagram
    participant Optimizer as ClientOptimizer
    participant Source1h as source[0]: long-term-range
    participant Source30m as source[1]: swing-term-range
    participant Source15m as source[2]: short-term-range
    participant Source1m as source[3]: micro-term-range
    participant LLM as Ollama deepseek-v3.1
    
    Note over Optimizer: Processing rangeTrain[0]<br/>2025-11-24
    
    Optimizer->>Source1h: fetch(BTCUSDT, 2025-11-24, 2025-11-24)
    Source1h-->>Optimizer: 1h candles with indicators
    
    Optimizer->>Source30m: fetch(BTCUSDT, 2025-11-24, 2025-11-24)
    Source30m-->>Optimizer: 30m candles with indicators
    
    Optimizer->>Source15m: fetch(BTCUSDT, 2025-11-24, 2025-11-24)
    Source15m-->>Optimizer: 15m candles with indicators
    
    Optimizer->>Source1m: fetch(BTCUSDT, 2025-11-24, 2025-11-24)
    Source1m-->>Optimizer: 1m candles with indicators
    
    Note over Optimizer: Build conversation history<br/>4 user/assistant pairs
    
    Optimizer->>LLM: getPrompt(BTCUSDT, messages)
    Note over LLM: Analyze 4 timeframes<br/>Generate strategy logic
    LLM-->>Optimizer: Strategy text for 2025-11-24
    
    Note over Optimizer: Append to strategyList<br/>Continue to rangeTrain[1]
```

The `startDate` and `endDate` from each training range are passed directly to `source.fetch()` methods, ensuring data alignment with the temporal split.

**Sources:** [demo/optimization/src/index.mjs:66-322]()

---

## Best Practices

### Recommended Configurations

| Configuration | Recommendation | Rationale |
|--------------|---------------|-----------|
| **Number of Training Ranges** | 5-10 periods | Captures diverse market conditions without excessive LLM calls |
| **Range Duration** | 1-7 days | Balances data volume with computational cost |
| **Training-Test Gap** | Consecutive periods | Preserves temporal continuity without artificial gaps |
| **Test Duration** | Same as training ranges | Ensures comparable statistical significance |
| **Chronological Order** | Strictly ascending | Prevents temporal leakage |

### Common Pitfalls

1. **Overlapping Ranges**: Ensure `rangeTrain[i].endDate < rangeTrain[i+1].startDate`
2. **Test Before Training**: Verify `max(rangeTrain[i].endDate) < rangeTest.startDate`
3. **Insufficient Training Data**: Use at least 5 training ranges for robust learning
4. **Test Period Too Long**: Extended test ranges increase overfitting risk through multiple market regimes

**Sources:** [demo/optimization/src/index.mjs:19-61]()

---

## Relationship to Code Generation

The `rangeTrain` and `rangeTest` parameters directly influence the generated code structure. The `OptimizerTemplateService` creates:

```javascript
// Generated by getFrameTemplate() for each rangeTrain element
addFrame({
  frameName: "24 ноября 2025",
  interval: "1m",
  startDate: new Date("2025-11-24T00:00:00Z"),
  endDate: new Date("2025-11-24T23:59:59Z"),
});

// Generated by getFrameTemplate() for rangeTest
addFrame({
  frameName: "1 декабря 2025",
  interval: "1m",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-01T23:59:59Z"),
});

// Generated by getWalkerTemplate() referencing rangeTest.note
addWalker({
  walkerName: "strategy-comparison",
  strategies: ["strategy-1", "strategy-2", "strategy-3"],
  metric: "sharpeRatio",
  exchangeName: "binance",
  frameName: "1 декабря 2025", // References rangeTest.note
});
```

The Walker's `frameName` parameter links to `rangeTest.note`, ensuring backtesting occurs only on the validation period.

**Sources:** [demo/optimization/src/index.mjs:376-377]()

---

## Summary

The `rangeTrain` and `rangeTest` configuration implements walk-forward validation for AI-powered strategy generation:

- **rangeTrain**: Array of chronologically-ordered date ranges for LLM training
- **rangeTest**: Single chronologically-later date range for out-of-sample validation
- **Purpose**: Prevent overfitting through temporal data segregation
- **Execution**: Each training range generates one strategy via multi-timeframe LLM analysis
- **Validation**: Generated strategies compete on the unseen test period
- **Integration**: Walker compares strategies exclusively on `rangeTest` data

This architecture ensures generated strategies demonstrate robust performance on future unseen data rather than memorizing historical patterns.

**Sources:** [demo/optimization/src/index.mjs:19-61](), [demo/optimization/src/index.mjs:373-383]()