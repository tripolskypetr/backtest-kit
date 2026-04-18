---
title: begin/05_forecast_pipeline_outline
group: begin
---

# Forecast Pipeline & Outline

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [logic/contract/ForecastResponse.contract.ts](logic/contract/ForecastResponse.contract.ts)
- [logic/core/outline/forecast.outline.ts](logic/core/outline/forecast.outline.ts)
- [logic/enum/OutlineName.ts](logic/enum/OutlineName.ts)
- [logic/main/forecast.ts](logic/main/forecast.ts)

</details>



The Forecast Pipeline is the core intelligence layer of the system, responsible for transforming unstructured news data into structured market sentiment analysis. It utilizes a specialized LLM "Outline" that acts as a Russian macro-analyst to evaluate geopolitical and economic events.

## Pipeline Overview

The pipeline is initiated via the `forecast` function [logic/main/forecast.ts:5-11](), which calls the `ForecastOutline` using the `agent-swarm-kit` framework. The process follows a strict sequence: gathering news, establishing temporal context, applying a persona-driven prompt, and validating the structured output against a predefined contract.

### Forecast Execution Flow

The following diagram illustrates the transition from the high-level `forecast` call to the internal registration and execution of the `ForecastOutline`.

**Diagram: Forecast Execution Logic**
```mermaid
graph TD
    subgraph "Natural Language Space (LLM Persona)"
        FP["FORECAST_PROMPT (Macro-Analyst)"]
    end

    subgraph "Code Entity Space (logic/)"
        F["forecast() function [logic/main/forecast.ts]"]
        AO["addOutline registration [logic/core/outline/forecast.outline.ts]"]
        CGN["commitGlobalNews [logic/core/outline/forecast.outline.ts]"]
        TNA["TavilyNewsAdvisor [AdvisorName.TavilyNewsAdvisor]"]
        FRC["ForecastResponseContract [logic/contract/ForecastResponse.contract.ts]"]
    end

    F -->|calls json()| AO
    AO -->|executes getOutlineHistory| CGN
    CGN -->|ask| TNA
    TNA -->|returns news| CGN
    CGN -->|push to history| AO
    AO -->|applies| FP
    AO -->|validates against| FRC
```
**Sources:** [logic/main/forecast.ts:5-11](), [logic/core/outline/forecast.outline.ts:50-115](), [logic/contract/ForecastResponse.contract.ts:1-5]()

---

## The Forecast Outline Configuration

The `ForecastOutline` is registered using `addOutline<ForecastResponseContract>` [logic/core/outline/forecast.outline.ts:68](). It defines how the LLM should be prompted, which tools it uses, and how the output is structured.

### 1. Macro-Analyst Persona (`FORECAST_PROMPT`)
The system instructs the LLM to behave as a macro-market analyst [logic/core/outline/forecast.outline.ts:24-25](). The prompt enforces several heuristic rules:
*   **Weighting:** Major events (regulations, macro-stats) outweigh minor noise [logic/core/outline/forecast.outline.ts:30]().
*   **Dominance:** In the case of contradictory news, the LLM must identify the "dominant force" [logic/core/outline/forecast.outline.ts:31]().
*   **Sentiment Categories:** The analyst must choose exactly one from `bullish`, `bearish`, `neutral`, or `sideways` [logic/core/outline/forecast.outline.ts:34-38]().

### 2. Context Injection (`getOutlineHistory`)
Before the prompt is sent, the system prepares the conversation history:
*   **Temporal Context:** Injects the current UTC date and time and the asset name (e.g., "Bitcoin" for BTCUSDT) [logic/core/outline/forecast.outline.ts:96-104]().
*   **News Retrieval:** The `commitGlobalNews` function is invoked [logic/core/outline/forecast.outline.ts:106-112](). It queries the `TavilyNewsAdvisor` for the last 24 hours of global news [logic/core/outline/forecast.outline.ts:50-54]().
*   **Acknowledge Pattern:** The news is pushed to history with a user role, and the assistant is forced to respond with "OK" to acknowledge the data before the final prompt is issued [logic/core/outline/forecast.outline.ts:55-65]().

**Sources:** [logic/core/outline/forecast.outline.ts:24-48](), [logic/core/outline/forecast.outline.ts:50-66](), [logic/core/outline/forecast.outline.ts:91-115]()

---

## Output Schema & Validation

The pipeline ensures high-quality signals by enforcing a strict JSON schema and secondary validation rules.

### ForecastResponseContract
The LLM must return an object conforming to the following structure:

| Property | Type | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `sentiment` | `string` | `bullish`, `bearish`, `neutral`, `sideways` | The primary market direction based on news. |
| `confidence` | `string` | `reliable`, `not_reliable` | Whether the news background is clear or contradictory. |
| `reasoning` | `string` | N/A | Explanation of which news events drove the decision. |

**Sources:** [logic/contract/ForecastResponse.contract.ts:1-5](), [logic/core/outline/forecast.outline.ts:71-90]()

### Validation Rules
After the LLM generates a response, it passes through a `validations` array [logic/core/outline/forecast.outline.ts:116](). These rules act as a guardrail:
1.  **Sentiment Check:** Ensures the value is within the allowed enum [logic/core/outline/forecast.outline.ts:118-132]().
2.  **Confidence Check:** Ensures the confidence level is valid [logic/core/outline/forecast.outline.ts:136-140]().
3.  **Reasoning Check:** Rejects the forecast if the `reasoning` field is empty [logic/core/outline/forecast.outline.ts:144-148]().

**Sources:** [logic/core/outline/forecast.outline.ts:116-151]()

---

## Data Flow & Persistence

Once a forecast is validated, it is automatically persisted for debugging and backtesting purposes.

**Diagram: Forecast Data Flow**
```mermaid
flowchart LR
    A["forecast.ts"] --> B["OllamaOutlineToolCompletion"]
    B --> C{"Validation Engine"}
    C -- "Invalid" --> D["Retry/Error"]
    C -- "Valid" --> E["onValidDocument Callback"]
    E --> F["dumpOutlineResult()"]
    F --> G["./dump/outline/forecast/"]
```

The `onValidDocument` callback [logic/core/outline/forecast.outline.ts:153-159]() uses `dumpOutlineResult` to save the successful forecast to the local file system at `./dump/outline/forecast`. This allows developers to inspect the LLM's reasoning for specific trades after the fact.

**Sources:** [logic/core/outline/forecast.outline.ts:152-160](), [logic/main/forecast.ts:6-10]()