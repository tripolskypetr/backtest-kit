@echo off
setlocal enabledelayedexpansion

echo Starting conversion of all markdown files to SVG...
echo.

set count=0
set failed=0

for %%f in (01_overview.md 02_key-features.md 03_architecture-overview.md 04_getting-started.md 05_installation-setup.md 06_your-first-backtest.md 07_quick-start-examples.md 08_core-concepts.md 09_signals-signal-lifecycle.md 10_strategies.md 11_execution-contexts.md 12_time-execution-engine.md 13_vwap-pricing-data-handling.md 14_architecture-deep-dive.md 15_service-layer-dependency-injection.md 16_client-layer.md 17_connection-services-memoization.md 18_event-system-architecture.md 19_data-flow-patterns.md 20_execution-modes.md 21_backtest-mode.md 22_live-trading-mode.md 23_walker-strategy-comparison.md 24_async-generator-patterns.md 25_strategy-development.md 26_strategy-schema-definition.md 27_signal-generation-getsignal.md 28_strategy-callbacks.md 29_multi-timeframe-analysis.md 30_interval-throttling.md 31_risk-management.md 32_risk-profiles-validation.md 33_signal-validation-pipeline.md 34_position-sizing.md 35_portfolio-wide-limits.md 36_exchanges-data-sources.md 37_exchange-configuration.md 38_candle-data-validation.md 39_ccxt-integration.md 40_reporting-monitoring.md 41_event-listeners.md 42_markdown-reports.md 43_statistics-models.md 44_performance-tracking.md 45_portfolio-heatmap.md 46_advanced-features.md 47_llm-powered-strategy-generation.md 48_optimizer-system.md 49_code-generation-templates.md 50_crash-recovery-persistence.md 51_custom-persistence-backends.md 52_configuration-reference.md 53_global_config-parameters.md 54_column-configuration.md 55_logger-configuration.md 56_api-reference.md 57_global-functions.md 58_execution-classes-api.md 59_reporting-classes-api.md 60_core-interfaces.md 61_signal-result-types.md 62_statistics-contract-types.md 63_service-layer-interfaces.md) do (
    set /a count+=1
    echo [!count!/63] Converting %%f...
    node _convert-md-mermaid-to-svg.cjs %%f
    if errorlevel 1 (
        set /a failed+=1
        echo [ERROR] Failed to convert %%f
    )
    echo.
)

echo.
echo ================================================
echo Conversion complete!
echo Total files: %count%
echo Failed: %failed%
echo ================================================

if %failed% gtr 0 (
    exit /b 1
) else (
    exit /b 0
)
