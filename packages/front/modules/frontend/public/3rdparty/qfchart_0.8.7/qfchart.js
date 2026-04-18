
/* 
 * Copyright (C) 2025 Alaa-eddine KADDOURI
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('echarts')) :
    typeof define === 'function' && define.amd ? define(['exports', 'echarts'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.QFChart = {}, global.echarts));
})(this, (function (exports, echarts) { 'use strict';

    function _interopNamespaceDefault(e) {
        var n = Object.create(null);
        if (e) {
            Object.keys(e).forEach(function (k) {
                if (k !== 'default') {
                    var d = Object.getOwnPropertyDescriptor(e, k);
                    Object.defineProperty(n, k, d.get ? d : {
                        enumerable: true,
                        get: function () { return e[k]; }
                    });
                }
            });
        }
        n.default = e;
        return Object.freeze(n);
    }

    var echarts__namespace = /*#__PURE__*/_interopNamespaceDefault(echarts);

    var __defProp$a = Object.defineProperty;
    var __defNormalProp$a = (obj, key, value) => key in obj ? __defProp$a(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$a = (obj, key, value) => {
      __defNormalProp$a(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class Indicator {
      constructor(id, plots, paneIndex, options = {}) {
        __publicField$a(this, "id");
        __publicField$a(this, "plots");
        __publicField$a(this, "paneIndex");
        __publicField$a(this, "height");
        __publicField$a(this, "collapsed");
        __publicField$a(this, "titleColor");
        __publicField$a(this, "controls");
        this.id = id;
        this.plots = plots;
        this.paneIndex = paneIndex;
        this.height = options.height;
        this.collapsed = options.collapsed || false;
        this.titleColor = options.titleColor;
        this.controls = options.controls;
      }
      toggleCollapse() {
        this.collapsed = !this.collapsed;
      }
      isVisible() {
        return !this.collapsed;
      }
      /**
       * Update indicator data incrementally by merging new points
       *
       * @param plots - New plots data to merge (same structure as constructor)
       *
       * @remarks
       * This method merges new indicator data with existing data by timestamp.
       * - New timestamps are added
       * - Existing timestamps are updated with new values
       * - All data is automatically sorted by time after merge
       *
       * **Important**: This method only updates the indicator's internal data structure.
       * To see the changes reflected in the chart, you MUST call `chart.updateData()`
       * after updating indicator data.
       *
       * **Usage Pattern**:
       * ```typescript
       * // 1. Update indicator data first
       * indicator.updateData({
       *   macd: { data: [{ time: 1234567890, value: 150 }], options: { style: 'line', color: '#2962FF' } }
       * });
       *
       * // 2. Then update chart data to trigger re-render
       * chart.updateData([
       *   { time: 1234567890, open: 100, high: 105, low: 99, close: 103, volume: 1000 }
       * ]);
       * ```
       *
       * **Note**: If you update indicator data without corresponding market data changes,
       * this typically indicates a recalculation scenario. In normal workflows, indicator
       * values are derived from market data, so indicator updates should correspond to
       * new or modified market bars.
       */
      updateData(plots) {
        Object.keys(plots).forEach((plotName) => {
          if (!this.plots[plotName]) {
            this.plots[plotName] = plots[plotName];
          } else {
            const existingPlot = this.plots[plotName];
            const newPlot = plots[plotName];
            if (!existingPlot.data)
              return;
            if (newPlot.options) {
              existingPlot.options = { ...existingPlot.options, ...newPlot.options };
            }
            const existingTimeMap = /* @__PURE__ */ new Map();
            existingPlot.data?.forEach((point) => {
              existingTimeMap.set(point.time, point);
            });
            newPlot.data?.forEach((point) => {
              existingTimeMap.set(point.time, point);
            });
            existingPlot.data = Array.from(existingTimeMap.values()).sort((a, b) => a.time - b.time);
          }
        });
      }
    }

    class AxisUtils {
      // Create min/max functions that apply padding
      static createMinFunction(paddingPercent) {
        return (value) => {
          const range = value.max - value.min;
          const padding = range * (paddingPercent / 100);
          return value.min - padding;
        };
      }
      static createMaxFunction(paddingPercent) {
        return (value) => {
          const range = value.max - value.min;
          const padding = range * (paddingPercent / 100);
          return value.max + padding;
        };
      }
    }

    class LayoutManager {
      static calculate(containerHeight, indicators, options, isMainCollapsed = false, maximizedPaneId = null, marketData) {
        let pixelToPercent = 0;
        if (containerHeight > 0) {
          pixelToPercent = 1 / containerHeight * 100;
        }
        const yAxisPaddingPercent = options.yAxisPadding !== void 0 ? options.yAxisPadding : 5;
        const separatePaneIndices = Array.from(indicators.values()).map((ind) => ind.paneIndex).filter((idx) => idx > 0).sort((a, b) => a - b).filter((value, index, self) => self.indexOf(value) === index);
        const hasSeparatePane = separatePaneIndices.length > 0;
        const dzVisible = options.dataZoom?.visible ?? true;
        const dzPosition = options.dataZoom?.position ?? "top";
        const dzHeight = options.dataZoom?.height ?? 6;
        const dzStart = options.dataZoom?.start ?? 0;
        const dzEnd = options.dataZoom?.end ?? 100;
        let mainPaneTop = 8;
        let chartAreaBottom = 92;
        let maximizeTargetIndex = -1;
        if (maximizedPaneId) {
          if (maximizedPaneId === "main") {
            maximizeTargetIndex = 0;
          } else {
            const ind = indicators.get(maximizedPaneId);
            if (ind) {
              maximizeTargetIndex = ind.paneIndex;
            }
          }
        }
        if (maximizeTargetIndex !== -1) {
          const grid2 = [];
          const xAxis2 = [];
          const yAxis2 = [];
          const dataZoom2 = [];
          const dzStart2 = options.dataZoom?.start ?? 50;
          const dzEnd2 = options.dataZoom?.end ?? 100;
          const zoomOnTouch = options.dataZoom?.zoomOnTouch ?? true;
          if (zoomOnTouch) {
            dataZoom2.push({ type: "inside", xAxisIndex: "all", start: dzStart2, end: dzEnd2 });
          }
          const maxPaneIndex = hasSeparatePane ? Math.max(...separatePaneIndices) : 0;
          const paneConfigs2 = [];
          for (let i = 0; i <= maxPaneIndex; i++) {
            const isTarget = i === maximizeTargetIndex;
            grid2.push({
              left: "10%",
              right: "10%",
              top: isTarget ? "5%" : "0%",
              height: isTarget ? "90%" : "0%",
              show: isTarget,
              containLabel: false
            });
            xAxis2.push({
              type: "category",
              gridIndex: i,
              data: [],
              show: isTarget,
              axisLabel: {
                show: isTarget,
                color: "#94a3b8",
                fontFamily: options.fontFamily
              },
              axisLine: { show: isTarget, lineStyle: { color: "#334155" } },
              splitLine: {
                show: isTarget,
                lineStyle: { color: "#334155", opacity: 0.5 }
              }
            });
            let yMin;
            let yMax;
            if (i === 0 && maximizeTargetIndex === 0) {
              yMin = options.yAxisMin !== void 0 && options.yAxisMin !== "auto" ? options.yAxisMin : AxisUtils.createMinFunction(yAxisPaddingPercent);
              yMax = options.yAxisMax !== void 0 && options.yAxisMax !== "auto" ? options.yAxisMax : AxisUtils.createMaxFunction(yAxisPaddingPercent);
            } else {
              yMin = AxisUtils.createMinFunction(yAxisPaddingPercent);
              yMax = AxisUtils.createMaxFunction(yAxisPaddingPercent);
            }
            yAxis2.push({
              position: "right",
              gridIndex: i,
              show: isTarget,
              scale: true,
              min: yMin,
              max: yMax,
              axisLabel: {
                show: isTarget,
                color: "#94a3b8",
                fontFamily: options.fontFamily,
                formatter: (value) => {
                  if (options.yAxisLabelFormatter) {
                    return options.yAxisLabelFormatter(value);
                  }
                  const decimals = options.yAxisDecimalPlaces !== void 0 ? options.yAxisDecimalPlaces : 2;
                  if (typeof value === "number") {
                    return value.toFixed(decimals);
                  }
                  return String(value);
                }
              },
              splitLine: {
                show: isTarget,
                lineStyle: { color: "#334155", opacity: 0.5 }
              }
            });
            if (i > 0) {
              const ind = Array.from(indicators.values()).find((ind2) => ind2.paneIndex === i);
              if (ind) {
                paneConfigs2.push({
                  index: i,
                  height: isTarget ? 90 : 0,
                  top: isTarget ? 5 : 0,
                  isCollapsed: false,
                  indicatorId: ind.id,
                  titleColor: ind.titleColor,
                  controls: ind.controls
                });
              }
            }
          }
          return {
            grid: grid2,
            xAxis: xAxis2,
            yAxis: yAxis2,
            dataZoom: dataZoom2,
            paneLayout: paneConfigs2,
            mainPaneHeight: maximizeTargetIndex === 0 ? 90 : 0,
            mainPaneTop: maximizeTargetIndex === 0 ? 5 : 0,
            pixelToPercent,
            overlayYAxisMap: /* @__PURE__ */ new Map(),
            // No overlays in maximized view
            separatePaneYAxisOffset: 1
            // In maximized view, no overlays, so separate panes start at 1
          };
        }
        if (dzVisible) {
          if (dzPosition === "top") {
            mainPaneTop = dzHeight + 4;
            chartAreaBottom = 95;
          } else {
            chartAreaBottom = 100 - dzHeight - 2;
            mainPaneTop = 8;
          }
        } else {
          mainPaneTop = 5;
          chartAreaBottom = 95;
        }
        let gapPercent = 5;
        if (containerHeight > 0) {
          gapPercent = 20 / containerHeight * 100;
        }
        let mainHeightVal = 75;
        let paneConfigs = [];
        if (hasSeparatePane) {
          const panes = separatePaneIndices.map((idx) => {
            const ind = Array.from(indicators.values()).find((i) => i.paneIndex === idx);
            return {
              index: idx,
              requestedHeight: ind?.height,
              isCollapsed: ind?.collapsed ?? false,
              indicatorId: ind?.id,
              titleColor: ind?.titleColor,
              controls: ind?.controls
            };
          });
          const resolvedPanes = panes.map((p) => ({
            ...p,
            height: p.isCollapsed ? 3 : p.requestedHeight !== void 0 ? p.requestedHeight : 15
          }));
          const totalIndicatorHeight = resolvedPanes.reduce((sum, p) => sum + p.height, 0);
          const totalGaps = resolvedPanes.length * gapPercent;
          const totalBottomSpace = totalIndicatorHeight + totalGaps;
          const totalAvailable = chartAreaBottom - mainPaneTop;
          mainHeightVal = totalAvailable - totalBottomSpace;
          if (isMainCollapsed) {
            mainHeightVal = 3;
          } else {
            if (mainHeightVal < 20) {
              mainHeightVal = Math.max(mainHeightVal, 10);
            }
          }
          let currentTop = mainPaneTop + mainHeightVal + gapPercent;
          paneConfigs = resolvedPanes.map((p) => {
            const config = {
              index: p.index,
              height: p.height,
              top: currentTop,
              isCollapsed: p.isCollapsed,
              indicatorId: p.indicatorId,
              titleColor: p.titleColor,
              controls: p.controls
            };
            currentTop += p.height + gapPercent;
            return config;
          });
        } else {
          mainHeightVal = chartAreaBottom - mainPaneTop;
          if (isMainCollapsed) {
            mainHeightVal = 3;
          }
        }
        const grid = [];
        grid.push({
          left: "10%",
          right: "10%",
          top: mainPaneTop + "%",
          height: mainHeightVal + "%",
          containLabel: false
          // We handle margins explicitly
        });
        paneConfigs.forEach((pane) => {
          grid.push({
            left: "10%",
            right: "10%",
            top: pane.top + "%",
            height: pane.height + "%",
            containLabel: false
          });
        });
        const allXAxisIndices = [0, ...paneConfigs.map((_, i) => i + 1)];
        const xAxis = [];
        const isMainBottom = paneConfigs.length === 0;
        xAxis.push({
          type: "category",
          data: [],
          // Will be filled by SeriesBuilder or QFChart
          gridIndex: 0,
          scale: true,
          // boundaryGap will be set in QFChart.ts based on padding option
          axisLine: {
            onZero: false,
            show: !isMainCollapsed,
            lineStyle: { color: "#334155" }
          },
          splitLine: {
            show: !isMainCollapsed,
            lineStyle: { color: "#334155", opacity: 0.5 }
          },
          axisLabel: {
            show: !isMainCollapsed,
            color: "#94a3b8",
            fontFamily: options.fontFamily || "sans-serif",
            formatter: (value) => {
              if (options.yAxisLabelFormatter) {
                return options.yAxisLabelFormatter(value);
              }
              const decimals = options.yAxisDecimalPlaces !== void 0 ? options.yAxisDecimalPlaces : 2;
              if (typeof value === "number") {
                return value.toFixed(decimals);
              }
              return String(value);
            }
          },
          axisTick: { show: !isMainCollapsed },
          axisPointer: {
            label: {
              show: isMainBottom,
              fontSize: 11,
              backgroundColor: "#475569"
            }
          }
        });
        paneConfigs.forEach((pane, i) => {
          const isBottom = i === paneConfigs.length - 1;
          xAxis.push({
            type: "category",
            gridIndex: i + 1,
            // 0 is main
            data: [],
            // Shared data
            axisLabel: { show: false },
            // Hide labels on indicator panes
            axisLine: { show: !pane.isCollapsed, lineStyle: { color: "#334155" } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisPointer: {
              label: {
                show: isBottom,
                fontSize: 11,
                backgroundColor: "#475569"
              }
            }
          });
        });
        const yAxis = [];
        let mainYAxisMin;
        let mainYAxisMax;
        if (options.yAxisMin !== void 0 && options.yAxisMin !== "auto") {
          mainYAxisMin = options.yAxisMin;
        } else {
          mainYAxisMin = AxisUtils.createMinFunction(yAxisPaddingPercent);
        }
        if (options.yAxisMax !== void 0 && options.yAxisMax !== "auto") {
          mainYAxisMax = options.yAxisMax;
        } else {
          mainYAxisMax = AxisUtils.createMaxFunction(yAxisPaddingPercent);
        }
        yAxis.push({
          position: "right",
          scale: true,
          min: mainYAxisMin,
          max: mainYAxisMax,
          gridIndex: 0,
          splitLine: {
            show: !isMainCollapsed,
            lineStyle: { color: "#334155", opacity: 0.5 }
          },
          axisLine: { show: !isMainCollapsed, lineStyle: { color: "#334155" } },
          axisLabel: {
            show: !isMainCollapsed,
            color: "#94a3b8",
            fontFamily: options.fontFamily || "sans-serif",
            formatter: (value) => {
              if (options.yAxisLabelFormatter) {
                return options.yAxisLabelFormatter(value);
              }
              const decimals = options.yAxisDecimalPlaces !== void 0 ? options.yAxisDecimalPlaces : 2;
              if (typeof value === "number") {
                return value.toFixed(decimals);
              }
              return String(value);
            }
          }
        });
        let nextYAxisIndex = 1;
        let priceMin = -Infinity;
        let priceMax = Infinity;
        if (marketData && marketData.length > 0) {
          priceMin = Math.min(...marketData.map((d) => d.low));
          priceMax = Math.max(...marketData.map((d) => d.high));
        }
        const overlayYAxisMap = /* @__PURE__ */ new Map();
        indicators.forEach((indicator, id) => {
          if (indicator.paneIndex === 0 && !indicator.collapsed) {
            if (marketData && marketData.length > 0) {
              Object.entries(indicator.plots).forEach(([plotName, plot]) => {
                const plotKey = `${id}::${plotName}`;
                const visualOnlyStyles = ["background", "barcolor", "char"];
                const isShapeWithPriceLocation = plot.options.style === "shape" && (plot.options.location === "abovebar" || plot.options.location === "belowbar");
                if (visualOnlyStyles.includes(plot.options.style)) {
                  if (!overlayYAxisMap.has(plotKey)) {
                    overlayYAxisMap.set(plotKey, nextYAxisIndex);
                    nextYAxisIndex++;
                  }
                  return;
                }
                if (plot.options.style === "shape" && !isShapeWithPriceLocation) {
                  if (!overlayYAxisMap.has(plotKey)) {
                    overlayYAxisMap.set(plotKey, nextYAxisIndex);
                    nextYAxisIndex++;
                  }
                  return;
                }
                const values = [];
                if (plot.data) {
                  Object.values(plot.data).forEach((value) => {
                    if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
                      values.push(value);
                    }
                  });
                }
                if (values.length > 0) {
                  const plotMin = Math.min(...values);
                  const plotMax = Math.max(...values);
                  const plotRange = plotMax - plotMin;
                  const priceRange = priceMax - priceMin;
                  const isWithinBounds = plotMin >= priceMin * 0.5 && plotMax <= priceMax * 1.5;
                  const hasSimilarMagnitude = plotRange > priceRange * 0.01;
                  const isCompatible = isWithinBounds && hasSimilarMagnitude;
                  if (!isCompatible) {
                    if (!overlayYAxisMap.has(plotKey)) {
                      overlayYAxisMap.set(plotKey, nextYAxisIndex);
                      nextYAxisIndex++;
                    }
                  }
                }
              });
            }
          }
        });
        const numOverlayAxes = overlayYAxisMap.size > 0 ? nextYAxisIndex - 1 : 0;
        for (let i = 0; i < numOverlayAxes; i++) {
          yAxis.push({
            position: "left",
            scale: true,
            min: AxisUtils.createMinFunction(yAxisPaddingPercent),
            max: AxisUtils.createMaxFunction(yAxisPaddingPercent),
            gridIndex: 0,
            show: false,
            // Hide the axis visual elements
            splitLine: { show: false },
            axisLine: { show: false },
            axisLabel: { show: false }
          });
        }
        const separatePaneYAxisOffset = nextYAxisIndex;
        paneConfigs.forEach((pane, i) => {
          yAxis.push({
            position: "right",
            scale: true,
            min: AxisUtils.createMinFunction(yAxisPaddingPercent),
            max: AxisUtils.createMaxFunction(yAxisPaddingPercent),
            gridIndex: i + 1,
            splitLine: {
              show: !pane.isCollapsed,
              lineStyle: { color: "#334155", opacity: 0.3 }
            },
            axisLabel: {
              show: !pane.isCollapsed,
              color: "#94a3b8",
              fontFamily: options.fontFamily || "sans-serif",
              fontSize: 10,
              formatter: (value) => {
                if (options.yAxisLabelFormatter) {
                  return options.yAxisLabelFormatter(value);
                }
                const decimals = options.yAxisDecimalPlaces !== void 0 ? options.yAxisDecimalPlaces : 2;
                if (typeof value === "number") {
                  return value.toFixed(decimals);
                }
                return String(value);
              }
            },
            axisLine: { show: !pane.isCollapsed, lineStyle: { color: "#334155" } }
          });
        });
        const dataZoom = [];
        if (dzVisible) {
          const zoomOnTouch = options.dataZoom?.zoomOnTouch ?? true;
          if (zoomOnTouch) {
            dataZoom.push({
              type: "inside",
              xAxisIndex: allXAxisIndices,
              start: dzStart,
              end: dzEnd
            });
          }
          if (dzPosition === "top") {
            dataZoom.push({
              type: "slider",
              xAxisIndex: allXAxisIndices,
              top: "1%",
              height: dzHeight + "%",
              start: dzStart,
              end: dzEnd,
              borderColor: "#334155",
              textStyle: { color: "#cbd5e1" },
              brushSelect: false
            });
          } else {
            dataZoom.push({
              type: "slider",
              xAxisIndex: allXAxisIndices,
              bottom: "1%",
              height: dzHeight + "%",
              start: dzStart,
              end: dzEnd,
              borderColor: "#334155",
              textStyle: { color: "#cbd5e1" },
              brushSelect: false
            });
          }
        }
        return {
          grid,
          xAxis,
          yAxis,
          dataZoom,
          paneLayout: paneConfigs,
          mainPaneHeight: mainHeightVal,
          mainPaneTop,
          pixelToPercent,
          overlayYAxisMap,
          separatePaneYAxisOffset
        };
      }
      static calculateMaximized(containerHeight, options, targetPaneIndex) {
        return {
          grid: [],
          xAxis: [],
          yAxis: [],
          dataZoom: [],
          paneLayout: [],
          mainPaneHeight: 0,
          mainPaneTop: 0,
          pixelToPercent: 0
        };
      }
    }

    class LineRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, plotOptions } = context;
        const defaultColor = "#2962ff";
        return {
          name: seriesName,
          type: "custom",
          xAxisIndex,
          yAxisIndex,
          renderItem: (params, api) => {
            const index = params.dataIndex;
            if (index === 0)
              return;
            const y2 = api.value(1);
            const y1 = api.value(2);
            if (y2 === null || isNaN(y2) || y1 === null || isNaN(y1))
              return;
            const p1 = api.coord([index - 1, y1]);
            const p2 = api.coord([index, y2]);
            return {
              type: "line",
              shape: {
                x1: p1[0],
                y1: p1[1],
                x2: p2[0],
                y2: p2[1]
              },
              style: {
                stroke: colorArray[index] || plotOptions.color || defaultColor,
                lineWidth: plotOptions.linewidth || 1
              },
              silent: true
            };
          },
          // Data format: [index, value, prevValue]
          data: dataArray.map((val, i) => [i, val, i > 0 ? dataArray[i - 1] : null])
        };
      }
    }

    class StepRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, plotOptions } = context;
        const defaultColor = "#2962ff";
        return {
          name: seriesName,
          type: "custom",
          xAxisIndex,
          yAxisIndex,
          renderItem: (params, api) => {
            const x = api.value(0);
            const y = api.value(1);
            if (isNaN(y) || y === null)
              return;
            const coords = api.coord([x, y]);
            const width = api.size([1, 0])[0];
            return {
              type: "line",
              shape: {
                x1: coords[0] - width / 2,
                y1: coords[1],
                x2: coords[0] + width / 2,
                y2: coords[1]
              },
              style: {
                stroke: colorArray[params.dataIndex] || plotOptions.color || defaultColor,
                lineWidth: plotOptions.linewidth || 1
              },
              silent: true
            };
          },
          data: dataArray.map((val, i) => [i, val])
        };
      }
    }

    class HistogramRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, plotOptions } = context;
        const defaultColor = "#2962ff";
        return {
          name: seriesName,
          type: "bar",
          xAxisIndex,
          yAxisIndex,
          data: dataArray.map((val, i) => ({
            value: val,
            itemStyle: colorArray[i] ? { color: colorArray[i] } : void 0
          })),
          itemStyle: { color: plotOptions.color || defaultColor }
        };
      }
    }

    const imageCache = /* @__PURE__ */ new Map();
    function textToBase64Image(text, color = "#00da3c", fontSize = "64px") {
      if (typeof document === "undefined")
        return "";
      const cacheKey = `${text}-${color}-${fontSize}`;
      if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = 32;
      canvas.height = 32;
      if (ctx) {
        ctx.font = "bold " + fontSize + " Arial";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 16, 16);
        const dataUrl = canvas.toDataURL("image/png");
        imageCache.set(cacheKey, dataUrl);
        return dataUrl;
      }
      return "";
    }

    class ScatterRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, plotOptions } = context;
        const defaultColor = "#2962ff";
        const style = plotOptions.style;
        if (style === "char") {
          return {
            name: seriesName,
            type: "scatter",
            xAxisIndex,
            yAxisIndex,
            symbolSize: 0,
            // Invisible
            data: dataArray.map((val, i) => ({
              value: [i, val],
              itemStyle: { opacity: 0 }
            })),
            silent: true
            // No interaction
          };
        }
        const scatterData = dataArray.map((val, i) => {
          if (val === null)
            return null;
          const pointColor = colorArray[i] || plotOptions.color || defaultColor;
          const item = {
            value: [i, val],
            itemStyle: { color: pointColor }
          };
          if (style === "cross") {
            item.symbol = `image://${textToBase64Image("+", pointColor, "24px")}`;
            item.symbolSize = 16;
          } else {
            item.symbol = "circle";
            item.symbolSize = 6;
          }
          return item;
        }).filter((item) => item !== null);
        return {
          name: seriesName,
          type: "scatter",
          xAxisIndex,
          yAxisIndex,
          data: scatterData
        };
      }
    }

    class OHLCBarRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, optionsArray, plotOptions } = context;
        const defaultColor = "#2962ff";
        const isCandle = plotOptions.style === "candle";
        const ohlcData = dataArray.map((val, i) => {
          if (val === null || !Array.isArray(val) || val.length !== 4)
            return null;
          const [open, high, low, close] = val;
          const pointOpts = optionsArray[i] || {};
          const color = pointOpts.color || colorArray[i] || plotOptions.color || defaultColor;
          const wickColor = pointOpts.wickcolor || plotOptions.wickcolor || color;
          const borderColor = pointOpts.bordercolor || plotOptions.bordercolor || wickColor;
          return [i, open, close, low, high, color, wickColor, borderColor];
        }).filter((item) => item !== null);
        return {
          name: seriesName,
          type: "custom",
          xAxisIndex,
          yAxisIndex,
          renderItem: (params, api) => {
            const xValue = api.value(0);
            const openValue = api.value(1);
            const closeValue = api.value(2);
            const lowValue = api.value(3);
            const highValue = api.value(4);
            const color = api.value(5);
            const wickColor = api.value(6);
            const borderColor = api.value(7);
            if (isNaN(openValue) || isNaN(closeValue) || isNaN(lowValue) || isNaN(highValue)) {
              return null;
            }
            const xPos = api.coord([xValue, 0])[0];
            const openPos = api.coord([xValue, openValue])[1];
            const closePos = api.coord([xValue, closeValue])[1];
            const lowPos = api.coord([xValue, lowValue])[1];
            const highPos = api.coord([xValue, highValue])[1];
            const barWidth = api.size([1, 0])[0] * 0.6;
            if (isCandle) {
              const bodyTop = Math.min(openPos, closePos);
              const bodyBottom = Math.max(openPos, closePos);
              const bodyHeight = Math.abs(closePos - openPos);
              return {
                type: "group",
                children: [
                  // Upper wick
                  {
                    type: "line",
                    shape: {
                      x1: xPos,
                      y1: highPos,
                      x2: xPos,
                      y2: bodyTop
                    },
                    style: {
                      stroke: wickColor,
                      lineWidth: 1
                    }
                  },
                  // Lower wick
                  {
                    type: "line",
                    shape: {
                      x1: xPos,
                      y1: bodyBottom,
                      x2: xPos,
                      y2: lowPos
                    },
                    style: {
                      stroke: wickColor,
                      lineWidth: 1
                    }
                  },
                  // Body
                  {
                    type: "rect",
                    shape: {
                      x: xPos - barWidth / 2,
                      y: bodyTop,
                      width: barWidth,
                      height: bodyHeight || 1
                      // Minimum height for doji
                    },
                    style: {
                      fill: color,
                      stroke: borderColor,
                      lineWidth: 1
                    }
                  }
                ]
              };
            } else {
              const tickWidth = barWidth * 0.5;
              return {
                type: "group",
                children: [
                  // Vertical line (low to high)
                  {
                    type: "line",
                    shape: {
                      x1: xPos,
                      y1: lowPos,
                      x2: xPos,
                      y2: highPos
                    },
                    style: {
                      stroke: color,
                      lineWidth: 1
                    }
                  },
                  // Open tick (left)
                  {
                    type: "line",
                    shape: {
                      x1: xPos - tickWidth,
                      y1: openPos,
                      x2: xPos,
                      y2: openPos
                    },
                    style: {
                      stroke: color,
                      lineWidth: 1
                    }
                  },
                  // Close tick (right)
                  {
                    type: "line",
                    shape: {
                      x1: xPos,
                      y1: closePos,
                      x2: xPos + tickWidth,
                      y2: closePos
                    },
                    style: {
                      stroke: color,
                      lineWidth: 1
                    }
                  }
                ]
              };
            }
          },
          data: ohlcData
        };
      }
    }

    class ShapeUtils {
      static getShapeSymbol(shape) {
        switch (shape) {
          case "arrowdown":
            return "path://M12 24l-12-12h8v-12h8v12h8z";
          case "arrowup":
            return "path://M12 0l12 12h-8v12h-8v-12h-8z";
          case "circle":
            return "circle";
          case "cross":
            return "path://M11 2h2v9h9v2h-9v9h-2v-9h-9v-2h9z";
          case "diamond":
            return "diamond";
          case "flag":
            return "path://M6 2v20h2v-8h12l-2-6 2-6h-12z";
          case "labeldown":
            return "path://M4 2h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6l-2 4l-2 -4h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z";
          case "labelup":
            return "path://M12 2l2 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h6z";
          case "square":
            return "rect";
          case "triangledown":
            return "path://M12 21l-10-18h20z";
          case "triangleup":
            return "triangle";
          case "xcross":
            return "path://M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
          default:
            return "circle";
        }
      }
      static getShapeRotation(shape) {
        return 0;
      }
      static getShapeSize(size, width, height) {
        if (width !== void 0 && height !== void 0) {
          return [width, height];
        }
        let baseSize;
        switch (size) {
          case "tiny":
            baseSize = 8;
            break;
          case "small":
            baseSize = 12;
            break;
          case "normal":
          case "auto":
            baseSize = 16;
            break;
          case "large":
            baseSize = 24;
            break;
          case "huge":
            baseSize = 32;
            break;
          default:
            baseSize = 16;
        }
        if (width !== void 0) {
          return [width, width];
        }
        if (height !== void 0) {
          return [height, height];
        }
        return baseSize;
      }
      // Helper to determine label position and distance relative to shape BASED ON LOCATION
      static getLabelConfig(shape, location) {
        switch (location) {
          case "abovebar":
            return { position: "top", distance: 5 };
          case "belowbar":
            return { position: "bottom", distance: 5 };
          case "top":
            return { position: "bottom", distance: 5 };
          case "bottom":
            return { position: "top", distance: 5 };
          case "absolute":
          default:
            if (shape === "labelup" || shape === "labeldown") {
              return { position: "inside", distance: 0 };
            }
            return { position: "top", distance: 5 };
        }
      }
    }

    class ShapeRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray, optionsArray, plotOptions, candlestickData } = context;
        const defaultColor = "#2962ff";
        const shapeData = dataArray.map((val, i) => {
          const pointOpts = optionsArray[i] || {};
          const globalOpts = plotOptions;
          const location = pointOpts.location || globalOpts.location || "absolute";
          if (location !== "absolute" && !val) {
            return null;
          }
          if (val === null || val === void 0) {
            return null;
          }
          const color = pointOpts.color || globalOpts.color || defaultColor;
          const shape = pointOpts.shape || globalOpts.shape || "circle";
          const size = pointOpts.size || globalOpts.size || "normal";
          const text = pointOpts.text || globalOpts.text;
          const textColor = pointOpts.textcolor || globalOpts.textcolor || "white";
          const width = pointOpts.width || globalOpts.width;
          const height = pointOpts.height || globalOpts.height;
          let yValue = val;
          let symbolOffset = [0, 0];
          if (location === "abovebar") {
            if (candlestickData && candlestickData[i]) {
              yValue = candlestickData[i].high;
            }
            symbolOffset = [0, "-150%"];
          } else if (location === "belowbar") {
            if (candlestickData && candlestickData[i]) {
              yValue = candlestickData[i].low;
            }
            symbolOffset = [0, "150%"];
          } else if (location === "top") {
            yValue = val;
            symbolOffset = [0, 0];
          } else if (location === "bottom") {
            yValue = val;
            symbolOffset = [0, 0];
          }
          const symbol = ShapeUtils.getShapeSymbol(shape);
          const symbolSize = ShapeUtils.getShapeSize(size, width, height);
          const rotate = ShapeUtils.getShapeRotation(shape);
          let finalSize = symbolSize;
          if (shape.includes("label")) {
            if (Array.isArray(symbolSize)) {
              finalSize = [symbolSize[0] * 2.5, symbolSize[1] * 2.5];
            } else {
              finalSize = symbolSize * 2.5;
            }
          }
          const labelConfig = ShapeUtils.getLabelConfig(shape, location);
          const item = {
            value: [i, yValue],
            symbol,
            symbolSize: finalSize,
            symbolRotate: rotate,
            symbolOffset,
            itemStyle: {
              color
            },
            label: {
              show: !!text,
              position: labelConfig.position,
              distance: labelConfig.distance,
              formatter: text,
              color: textColor,
              fontSize: 10,
              fontWeight: "bold"
            }
          };
          return item;
        }).filter((item) => item !== null);
        return {
          name: seriesName,
          type: "scatter",
          xAxisIndex,
          yAxisIndex,
          data: shapeData
        };
      }
    }

    class BackgroundRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, dataArray, colorArray } = context;
        return {
          name: seriesName,
          type: "custom",
          xAxisIndex,
          yAxisIndex,
          z: -10,
          renderItem: (params, api) => {
            const xVal = api.value(0);
            if (isNaN(xVal))
              return;
            const start = api.coord([xVal, 0]);
            const size = api.size([1, 0]);
            const width = size[0];
            const sys = params.coordSys;
            const x = start[0] - width / 2;
            const barColor = colorArray[params.dataIndex];
            const val = api.value(1);
            if (!barColor || val === null || val === void 0 || isNaN(val))
              return;
            return {
              type: "rect",
              shape: {
                x,
                y: sys.y,
                width,
                height: sys.height
              },
              style: {
                fill: barColor,
                opacity: 0.3
              },
              silent: true
            };
          },
          data: dataArray.map((val, i) => [i, val])
        };
      }
    }

    class ColorUtils {
      /**
       * Parse color string and extract opacity
       * Supports: hex (#RRGGBB), named colors (green, red), rgba(r,g,b,a), rgb(r,g,b)
       */
      static parseColor(colorStr) {
        if (!colorStr) {
          return { color: "#888888", opacity: 0.2 };
        }
        const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = rgbaMatch[1];
          const g = rgbaMatch[2];
          const b = rgbaMatch[3];
          const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
          return {
            color: `rgb(${r},${g},${b})`,
            opacity: a
          };
        }
        return {
          color: colorStr,
          opacity: 0.3
        };
      }
    }

    class FillRenderer {
      render(context) {
        const { seriesName, xAxisIndex, yAxisIndex, plotOptions, plotDataArrays, indicatorId, plotName } = context;
        const totalDataLength = context.dataArray.length;
        const plot1Key = plotOptions.plot1 ? `${indicatorId}::${plotOptions.plot1}` : null;
        const plot2Key = plotOptions.plot2 ? `${indicatorId}::${plotOptions.plot2}` : null;
        if (!plot1Key || !plot2Key) {
          console.warn(`Fill plot "${plotName}" missing plot1 or plot2 reference`);
          return null;
        }
        const plot1Data = plotDataArrays?.get(plot1Key);
        const plot2Data = plotDataArrays?.get(plot2Key);
        if (!plot1Data || !plot2Data) {
          console.warn(`Fill plot "${plotName}" references non-existent plots: ${plotOptions.plot1}, ${plotOptions.plot2}`);
          return null;
        }
        const { color: fillColor, opacity: fillOpacity } = ColorUtils.parseColor(plotOptions.color || "rgba(128, 128, 128, 0.2)");
        const fillDataWithPrev = [];
        for (let i = 0; i < totalDataLength; i++) {
          const y1 = plot1Data[i];
          const y2 = plot2Data[i];
          const prevY1 = i > 0 ? plot1Data[i - 1] : null;
          const prevY2 = i > 0 ? plot2Data[i - 1] : null;
          fillDataWithPrev.push([i, y1, y2, prevY1, prevY2]);
        }
        return {
          name: seriesName,
          type: "custom",
          xAxisIndex,
          yAxisIndex,
          z: -5,
          // Render behind lines but above background
          renderItem: (params, api) => {
            const index = params.dataIndex;
            if (index === 0)
              return null;
            const y1 = api.value(1);
            const y2 = api.value(2);
            const prevY1 = api.value(3);
            const prevY2 = api.value(4);
            if (y1 === null || y2 === null || prevY1 === null || prevY2 === null || isNaN(y1) || isNaN(y2) || isNaN(prevY1) || isNaN(prevY2)) {
              return null;
            }
            const p1Prev = api.coord([index - 1, prevY1]);
            const p1Curr = api.coord([index, y1]);
            const p2Curr = api.coord([index, y2]);
            const p2Prev = api.coord([index - 1, prevY2]);
            return {
              type: "polygon",
              shape: {
                points: [
                  p1Prev,
                  // Top-left
                  p1Curr,
                  // Top-right
                  p2Curr,
                  // Bottom-right
                  p2Prev
                  // Bottom-left
                ]
              },
              style: {
                fill: fillColor,
                opacity: fillOpacity
              },
              silent: true
            };
          },
          data: fillDataWithPrev
        };
      }
    }

    var __defProp$9 = Object.defineProperty;
    var __defNormalProp$9 = (obj, key, value) => key in obj ? __defProp$9(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$9 = (obj, key, value) => {
      __defNormalProp$9(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    const _SeriesRendererFactory = class _SeriesRendererFactory {
      static register(style, renderer) {
        this.renderers.set(style, renderer);
      }
      static get(style) {
        return this.renderers.get(style) || this.renderers.get("line");
      }
    };
    __publicField$9(_SeriesRendererFactory, "renderers", /* @__PURE__ */ new Map());
    _SeriesRendererFactory.register("line", new LineRenderer());
    _SeriesRendererFactory.register("step", new StepRenderer());
    _SeriesRendererFactory.register("histogram", new HistogramRenderer());
    _SeriesRendererFactory.register("columns", new HistogramRenderer());
    _SeriesRendererFactory.register("circles", new ScatterRenderer());
    _SeriesRendererFactory.register("cross", new ScatterRenderer());
    _SeriesRendererFactory.register("char", new ScatterRenderer());
    _SeriesRendererFactory.register("bar", new OHLCBarRenderer());
    _SeriesRendererFactory.register("candle", new OHLCBarRenderer());
    _SeriesRendererFactory.register("shape", new ShapeRenderer());
    _SeriesRendererFactory.register("background", new BackgroundRenderer());
    _SeriesRendererFactory.register("fill", new FillRenderer());
    let SeriesRendererFactory = _SeriesRendererFactory;

    var __defProp$8 = Object.defineProperty;
    var __defNormalProp$8 = (obj, key, value) => key in obj ? __defProp$8(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$8 = (obj, key, value) => {
      __defNormalProp$8(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    const _SeriesBuilder = class _SeriesBuilder {
      static buildCandlestickSeries(marketData, options, totalLength) {
        const upColor = options.upColor || "#00da3c";
        const downColor = options.downColor || "#ec0000";
        const data = marketData.map((d) => [d.open, d.close, d.low, d.high]);
        if (totalLength && totalLength > data.length) {
          const padding = totalLength - data.length;
          for (let i = 0; i < padding; i++) {
            data.push(null);
          }
        }
        let markLine = void 0;
        if (options.lastPriceLine?.visible !== false && marketData.length > 0) {
          const lastBar = marketData[marketData.length - 1];
          const lastClose = lastBar.close;
          const isUp = lastBar.close >= lastBar.open;
          const lineColor = options.lastPriceLine?.color || (isUp ? upColor : downColor);
          let lineStyleType = options.lastPriceLine?.lineStyle || "dashed";
          if (lineStyleType.startsWith("linestyle_")) {
            lineStyleType = lineStyleType.replace("linestyle_", "");
          }
          markLine = {
            symbol: ["none", "none"],
            data: [
              {
                yAxis: lastClose,
                label: {
                  show: true,
                  position: "end",
                  // Right side
                  formatter: (params) => {
                    if (options.yAxisLabelFormatter) {
                      return options.yAxisLabelFormatter(params.value);
                    }
                    const decimals = options.yAxisDecimalPlaces !== void 0 ? options.yAxisDecimalPlaces : 2;
                    return typeof params.value === "number" ? params.value.toFixed(decimals) : params.value;
                  },
                  color: "#fff",
                  backgroundColor: lineColor,
                  padding: [2, 4],
                  borderRadius: 2,
                  fontSize: 11,
                  fontWeight: "bold"
                },
                lineStyle: {
                  color: lineColor,
                  type: lineStyleType,
                  width: 1,
                  opacity: 0.8
                }
              }
            ],
            animation: false,
            silent: true
            // Disable interaction
          };
        }
        return {
          type: "candlestick",
          name: options.title || "Market",
          data,
          itemStyle: {
            color: upColor,
            color0: downColor,
            borderColor: upColor,
            borderColor0: downColor
          },
          markLine,
          xAxisIndex: 0,
          yAxisIndex: 0,
          z: 5
        };
      }
      static buildIndicatorSeries(indicators, timeToIndex, paneLayout, totalDataLength, dataIndexOffset = 0, candlestickData, overlayYAxisMap, separatePaneYAxisOffset = 1) {
        const series = [];
        const barColors = new Array(totalDataLength).fill(null);
        const plotDataArrays = /* @__PURE__ */ new Map();
        indicators.forEach((indicator, id) => {
          if (indicator.collapsed)
            return;
          const sortedPlots = Object.keys(indicator.plots).sort((a, b) => {
            const plotA = indicator.plots[a];
            const plotB = indicator.plots[b];
            const isFillA = plotA.options.style === "fill";
            const isFillB = plotB.options.style === "fill";
            if (isFillA && !isFillB)
              return 1;
            if (!isFillA && isFillB)
              return -1;
            return 0;
          });
          sortedPlots.forEach((plotName) => {
            const plot = indicator.plots[plotName];
            const seriesName = `${id}::${plotName}`;
            let xAxisIndex = 0;
            let yAxisIndex = 0;
            const plotOverlay = plot.options.overlay;
            const isPlotOverlay = plotOverlay !== void 0 ? plotOverlay : indicator.paneIndex === 0;
            if (isPlotOverlay) {
              xAxisIndex = 0;
              if (overlayYAxisMap && overlayYAxisMap.has(seriesName)) {
                yAxisIndex = overlayYAxisMap.get(seriesName);
              } else {
                yAxisIndex = 0;
              }
            } else {
              const confIndex = paneLayout.findIndex((p) => p.index === indicator.paneIndex);
              if (confIndex !== -1) {
                xAxisIndex = confIndex + 1;
                yAxisIndex = separatePaneYAxisOffset + confIndex;
              }
            }
            const dataArray = new Array(totalDataLength).fill(null);
            const colorArray = new Array(totalDataLength).fill(null);
            const optionsArray = new Array(totalDataLength).fill(null);
            plot.data?.forEach((point) => {
              const index = timeToIndex.get(point.time);
              if (index !== void 0) {
                const plotOffset = point.options?.offset ?? plot.options.offset ?? 0;
                const offsetIndex = index + dataIndexOffset + plotOffset;
                if (offsetIndex >= 0 && offsetIndex < totalDataLength) {
                  let value = point.value;
                  const pointColor = point.options?.color;
                  const isNaColor = pointColor === null || pointColor === "na" || pointColor === "NaN" || typeof pointColor === "number" && isNaN(pointColor);
                  if (isNaColor) {
                    value = null;
                  }
                  dataArray[offsetIndex] = value;
                  colorArray[offsetIndex] = pointColor || plot.options.color || _SeriesBuilder.DEFAULT_COLOR;
                  optionsArray[offsetIndex] = point.options || {};
                }
              }
            });
            plotDataArrays.set(`${id}::${plotName}`, dataArray);
            if (plot.options?.style?.startsWith("style_")) {
              plot.options.style = plot.options.style.replace("style_", "");
            }
            if (plot.options.style === "barcolor") {
              plot.data?.forEach((point) => {
                const index = timeToIndex.get(point.time);
                if (index !== void 0) {
                  const plotOffset = point.options?.offset ?? plot.options.offset ?? 0;
                  const offsetIndex = index + dataIndexOffset + plotOffset;
                  if (offsetIndex >= 0 && offsetIndex < totalDataLength) {
                    const pointColor = point.options?.color || plot.options.color || _SeriesBuilder.DEFAULT_COLOR;
                    const isNaColor = pointColor === null || pointColor === "na" || pointColor === "NaN" || typeof pointColor === "number" && isNaN(pointColor);
                    if (!isNaColor && point.value !== null && point.value !== void 0) {
                      barColors[offsetIndex] = pointColor;
                    }
                  }
                }
              });
              return;
            }
            const renderer = SeriesRendererFactory.get(plot.options.style);
            const seriesConfig = renderer.render({
              seriesName,
              xAxisIndex,
              yAxisIndex,
              dataArray,
              colorArray,
              optionsArray,
              plotOptions: plot.options,
              candlestickData,
              plotDataArrays,
              indicatorId: id,
              plotName
            });
            if (seriesConfig) {
              series.push(seriesConfig);
            }
          });
        });
        return { series, barColors };
      }
    };
    __publicField$8(_SeriesBuilder, "DEFAULT_COLOR", "#2962ff");
    let SeriesBuilder = _SeriesBuilder;

    class GraphicBuilder {
      static build(layout, options, onToggle, isMainCollapsed = false, maximizedPaneId = null) {
        const graphic = [];
        const pixelToPercent = layout.pixelToPercent;
        const mainPaneTop = layout.mainPaneTop;
        const showMain = !maximizedPaneId || maximizedPaneId === "main";
        if (showMain) {
          const titleTopMargin = 10 * pixelToPercent;
          graphic.push({
            type: "text",
            left: "8.5%",
            top: mainPaneTop + titleTopMargin + "%",
            z: 10,
            style: {
              text: options.title || "Market",
              fill: options.titleColor || "#fff",
              font: `bold 16px ${options.fontFamily || "sans-serif"}`,
              textVerticalAlign: "top"
            }
          });
          if (options.watermark !== false) {
            const bottomY = layout.mainPaneTop + layout.mainPaneHeight;
            graphic.push({
              type: "text",
              right: "11%",
              top: bottomY - 3 + "%",
              // Position 5% from bottom of main chart
              z: 10,
              style: {
                text: "QFChart",
                fill: options.fontColor || "#cbd5e1",
                font: `bold 16px sans-serif`,
                opacity: 0.1
              },
              cursor: "pointer",
              onclick: () => {
                window.open("https://quantforge.org", "_blank");
              }
            });
          }
          const controls = [];
          if (options.controls?.collapse) {
            controls.push({
              type: "group",
              children: [
                {
                  type: "rect",
                  shape: { width: 20, height: 20, r: 2 },
                  style: { fill: "#334155", stroke: "#475569", lineWidth: 1 },
                  onclick: () => onToggle("main", "collapse")
                },
                {
                  type: "text",
                  style: {
                    text: isMainCollapsed ? "+" : "\u2212",
                    fill: "#cbd5e1",
                    font: `bold 14px ${options.fontFamily}`,
                    x: 10,
                    y: 10,
                    textAlign: "center",
                    textVerticalAlign: "middle"
                  },
                  silent: true
                }
              ]
            });
          }
          if (options.controls?.maximize) {
            const isMaximized = maximizedPaneId === "main";
            const xOffset = options.controls?.collapse ? 25 : 0;
            controls.push({
              type: "group",
              x: xOffset,
              children: [
                {
                  type: "rect",
                  shape: { width: 20, height: 20, r: 2 },
                  style: { fill: "#334155", stroke: "#475569", lineWidth: 1 },
                  onclick: () => onToggle("main", "maximize")
                },
                {
                  type: "text",
                  style: {
                    text: isMaximized ? "\u2750" : "\u25A1",
                    // Simple chars for now
                    fill: "#cbd5e1",
                    font: `14px ${options.fontFamily}`,
                    x: 10,
                    y: 10,
                    textAlign: "center",
                    textVerticalAlign: "middle"
                  },
                  silent: true
                }
              ]
            });
          }
          if (options.controls?.fullscreen) {
            let xOffset = 0;
            if (options.controls?.collapse)
              xOffset += 25;
            if (options.controls?.maximize)
              xOffset += 25;
            controls.push({
              type: "group",
              x: xOffset,
              children: [
                {
                  type: "rect",
                  shape: { width: 20, height: 20, r: 2 },
                  style: { fill: "#334155", stroke: "#475569", lineWidth: 1 },
                  onclick: () => onToggle("main", "fullscreen")
                },
                {
                  type: "text",
                  style: {
                    text: "\u26F6",
                    fill: "#cbd5e1",
                    font: `14px ${options.fontFamily}`,
                    x: 10,
                    y: 10,
                    textAlign: "center",
                    textVerticalAlign: "middle"
                  },
                  silent: true
                }
              ]
            });
          }
          if (controls.length > 0) {
            graphic.push({
              type: "group",
              right: "10.5%",
              top: mainPaneTop + "%",
              children: controls
            });
          }
        }
        layout.paneLayout.forEach((pane) => {
          if (maximizedPaneId && pane.indicatorId !== maximizedPaneId) {
            return;
          }
          graphic.push({
            type: "text",
            left: "8.5%",
            top: pane.top + 10 * pixelToPercent + "%",
            z: 10,
            style: {
              text: pane.indicatorId || "",
              fill: pane.titleColor || "#fff",
              font: `bold 12px ${options.fontFamily || "sans-serif"}`,
              textVerticalAlign: "top"
            }
          });
          const controls = [];
          if (pane.controls?.collapse) {
            controls.push({
              type: "group",
              children: [
                {
                  type: "rect",
                  shape: { width: 20, height: 20, r: 2 },
                  style: { fill: "#334155", stroke: "#475569", lineWidth: 1 },
                  onclick: () => pane.indicatorId && onToggle(pane.indicatorId, "collapse")
                },
                {
                  type: "text",
                  style: {
                    text: pane.isCollapsed ? "+" : "\u2212",
                    fill: "#cbd5e1",
                    font: `bold 14px ${options.fontFamily}`,
                    x: 10,
                    y: 10,
                    textAlign: "center",
                    textVerticalAlign: "middle"
                  },
                  silent: true
                }
              ]
            });
          }
          if (pane.controls?.maximize) {
            const isMaximized = maximizedPaneId === pane.indicatorId;
            const xOffset = pane.controls?.collapse ? 25 : 0;
            controls.push({
              type: "group",
              x: xOffset,
              children: [
                {
                  type: "rect",
                  shape: { width: 20, height: 20, r: 2 },
                  style: { fill: "#334155", stroke: "#475569", lineWidth: 1 },
                  onclick: () => pane.indicatorId && onToggle(pane.indicatorId, "maximize")
                },
                {
                  type: "text",
                  style: {
                    text: isMaximized ? "\u2750" : "\u25A1",
                    fill: "#cbd5e1",
                    font: `14px ${options.fontFamily}`,
                    x: 10,
                    y: 10,
                    textAlign: "center",
                    textVerticalAlign: "middle"
                  },
                  silent: true
                }
              ]
            });
          }
          if (controls.length > 0) {
            graphic.push({
              type: "group",
              right: "10.5%",
              top: pane.top + "%",
              children: controls
            });
          }
        });
        return graphic;
      }
    }

    class TooltipFormatter {
      static format(params, options) {
        if (!params || params.length === 0)
          return "";
        const marketName = options.title || "Market";
        const upColor = options.upColor || "#00da3c";
        const downColor = options.downColor || "#ec0000";
        const fontFamily = options.fontFamily || "sans-serif";
        const date = params[0].axisValue;
        let html = `<div style="font-weight: bold; margin-bottom: 5px; color: #cbd5e1; font-family: ${fontFamily};">${date}</div>`;
        const marketSeries = params.find(
          (p) => p.seriesType === "candlestick"
        );
        const indicatorParams = params.filter(
          (p) => p.seriesType !== "candlestick"
        );
        if (marketSeries) {
          const [_, open, close, low, high] = marketSeries.value;
          const color = close >= open ? upColor : downColor;
          html += `
            <div style="margin-bottom: 8px; font-family: ${fontFamily};">
                <div style="display:flex; justify-content:space-between; color:${color}; font-weight:bold;">
                    <span>${marketName}</span>
                </div>
                <div style="display: grid; grid-template-columns: auto auto; gap: 2px 15px; font-size: 0.9em; color: #cbd5e1;">
                    <span>Open:</span> <span style="text-align: right; color: ${close >= open ? upColor : downColor}">${open}</span>
                    <span>High:</span> <span style="text-align: right; color: ${upColor}">${high}</span>
                    <span>Low:</span> <span style="text-align: right; color: ${downColor}">${low}</span>
                    <span>Close:</span> <span style="text-align: right; color: ${close >= open ? upColor : downColor}">${close}</span>
                </div>
            </div>
            `;
        }
        if (indicatorParams.length > 0) {
          html += `<div style="border-top: 1px solid #334155; margin: 5px 0; padding-top: 5px;"></div>`;
          const indicators = {};
          indicatorParams.forEach((p) => {
            const parts = p.seriesName.split("::");
            const indId = parts.length > 1 ? parts[0] : "Unknown";
            const plotName = parts.length > 1 ? parts[1] : p.seriesName;
            if (!indicators[indId])
              indicators[indId] = [];
            indicators[indId].push({ ...p, displayName: plotName });
          });
          Object.keys(indicators).forEach((indId) => {
            html += `
            <div style="margin-top: 8px; font-family: ${fontFamily};">
                <div style="font-weight:bold; color: #fff; margin-bottom: 2px;">${indId}</div>
            `;
            indicators[indId].forEach((p) => {
              let val = p.value;
              if (Array.isArray(val)) {
                val = val[1];
              }
              if (val === null || val === void 0)
                return;
              const valStr = typeof val === "number" ? val.toLocaleString(void 0, { maximumFractionDigits: 4 }) : val;
              html += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; padding-left: 8px;">
                    <div>${p.marker} <span style="color: #cbd5e1;">${p.displayName}</span></div>
                    <div style="font-size: 10px; color: #fff;padding-left:10px;">${valStr}</div>
                </div>`;
            });
            html += `</div>`;
          });
        }
        return html;
      }
    }

    var __defProp$7 = Object.defineProperty;
    var __defNormalProp$7 = (obj, key, value) => key in obj ? __defProp$7(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$7 = (obj, key, value) => {
      __defNormalProp$7(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class PluginManager {
      constructor(context, toolbarContainer) {
        __publicField$7(this, "plugins", /* @__PURE__ */ new Map());
        __publicField$7(this, "activePluginId", null);
        __publicField$7(this, "context");
        __publicField$7(this, "toolbarContainer");
        __publicField$7(this, "tooltipElement", null);
        __publicField$7(this, "hideTimeout", null);
        this.context = context;
        this.toolbarContainer = toolbarContainer;
        this.createTooltip();
        this.renderToolbar();
      }
      createTooltip() {
        this.tooltipElement = document.createElement("div");
        Object.assign(this.tooltipElement.style, {
          position: "fixed",
          display: "none",
          backgroundColor: "#1e293b",
          color: "#e2e8f0",
          padding: "6px 10px",
          borderRadius: "6px",
          fontSize: "13px",
          lineHeight: "1.4",
          fontWeight: "500",
          border: "1px solid #334155",
          zIndex: "9999",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.15)",
          fontFamily: this.context.getOptions().fontFamily || "sans-serif",
          transition: "opacity 0.15s ease-in-out, transform 0.15s ease-in-out",
          opacity: "0",
          transform: "translateX(-5px)"
        });
        document.body.appendChild(this.tooltipElement);
      }
      destroy() {
        if (this.tooltipElement && this.tooltipElement.parentNode) {
          this.tooltipElement.parentNode.removeChild(this.tooltipElement);
        }
        this.tooltipElement = null;
      }
      showTooltip(target, text) {
        if (!this.tooltipElement)
          return;
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
        const rect = target.getBoundingClientRect();
        this.tooltipElement.textContent = text;
        this.tooltipElement.style.display = "block";
        const tooltipRect = this.tooltipElement.getBoundingClientRect();
        const top = rect.top + (rect.height - tooltipRect.height) / 2;
        const left = rect.right + 10;
        this.tooltipElement.style.top = `${top}px`;
        this.tooltipElement.style.left = `${left}px`;
        requestAnimationFrame(() => {
          if (this.tooltipElement) {
            this.tooltipElement.style.opacity = "1";
            this.tooltipElement.style.transform = "translateX(0)";
          }
        });
      }
      hideTooltip() {
        if (!this.tooltipElement)
          return;
        this.tooltipElement.style.opacity = "0";
        this.tooltipElement.style.transform = "translateX(-5px)";
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
        }
        this.hideTimeout = setTimeout(() => {
          if (this.tooltipElement) {
            this.tooltipElement.style.display = "none";
          }
          this.hideTimeout = null;
        }, 150);
      }
      register(plugin) {
        if (this.plugins.has(plugin.id)) {
          console.warn(`Plugin with id ${plugin.id} is already registered.`);
          return;
        }
        this.plugins.set(plugin.id, plugin);
        plugin.init(this.context);
        this.addButton(plugin);
      }
      unregister(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
          if (this.activePluginId === pluginId) {
            this.deactivatePlugin();
          }
          plugin.destroy?.();
          this.plugins.delete(pluginId);
          this.removeButton(pluginId);
        }
      }
      activatePlugin(pluginId) {
        if (this.activePluginId === pluginId) {
          this.deactivatePlugin();
          return;
        }
        if (this.activePluginId) {
          this.deactivatePlugin();
        }
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
          this.activePluginId = pluginId;
          this.setButtonActive(pluginId, true);
          plugin.activate?.();
        }
      }
      deactivatePlugin() {
        if (this.activePluginId) {
          const plugin = this.plugins.get(this.activePluginId);
          plugin?.deactivate?.();
          this.setButtonActive(this.activePluginId, false);
          this.activePluginId = null;
        }
      }
      // --- UI Handling ---
      renderToolbar() {
        this.toolbarContainer.innerHTML = "";
        this.toolbarContainer.classList.add("qfchart-toolbar");
        this.toolbarContainer.style.display = "flex";
        this.toolbarContainer.style.flexDirection = "column";
        this.toolbarContainer.style.width = "40px";
        this.toolbarContainer.style.backgroundColor = this.context.getOptions().backgroundColor || "#1e293b";
        this.toolbarContainer.style.borderRight = "1px solid #334155";
        this.toolbarContainer.style.padding = "5px";
        this.toolbarContainer.style.boxSizing = "border-box";
        this.toolbarContainer.style.gap = "5px";
        this.toolbarContainer.style.flexShrink = "0";
      }
      addButton(plugin) {
        const btn = document.createElement("button");
        btn.id = `qfchart-plugin-btn-${plugin.id}`;
        btn.style.width = "30px";
        btn.style.height = "30px";
        btn.style.padding = "4px";
        btn.style.border = "1px solid transparent";
        btn.style.borderRadius = "4px";
        btn.style.backgroundColor = "transparent";
        btn.style.cursor = "pointer";
        btn.style.color = this.context.getOptions().fontColor || "#cbd5e1";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        if (plugin.icon) {
          btn.innerHTML = plugin.icon;
        } else {
          btn.innerText = (plugin.name || plugin.id).substring(0, 2).toUpperCase();
        }
        btn.addEventListener("mouseenter", () => {
          if (this.activePluginId !== plugin.id) {
            btn.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
          }
          this.showTooltip(btn, plugin.name || plugin.id);
        });
        btn.addEventListener("mouseleave", () => {
          if (this.activePluginId !== plugin.id) {
            btn.style.backgroundColor = "transparent";
          }
          this.hideTooltip();
        });
        btn.onclick = () => this.activatePlugin(plugin.id);
        this.toolbarContainer.appendChild(btn);
      }
      removeButton(pluginId) {
        const btn = this.toolbarContainer.querySelector(`#qfchart-plugin-btn-${pluginId}`);
        if (btn) {
          btn.remove();
        }
      }
      setButtonActive(pluginId, active) {
        const btn = this.toolbarContainer.querySelector(`#qfchart-plugin-btn-${pluginId}`);
        if (btn) {
          if (active) {
            btn.style.backgroundColor = "#2563eb";
            btn.style.color = "#ffffff";
          } else {
            btn.style.backgroundColor = "transparent";
            btn.style.color = this.context.getOptions().fontColor || "#cbd5e1";
          }
        }
      }
    }

    var __defProp$6 = Object.defineProperty;
    var __defNormalProp$6 = (obj, key, value) => key in obj ? __defProp$6(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$6 = (obj, key, value) => {
      __defNormalProp$6(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class DrawingEditor {
      constructor(context) {
        __publicField$6(this, "context");
        __publicField$6(this, "isEditing", false);
        __publicField$6(this, "currentDrawing", null);
        __publicField$6(this, "editingPointIndex", null);
        __publicField$6(this, "zr");
        // Temporary ZRender elements for visual feedback during drag
        __publicField$6(this, "editGroup", null);
        __publicField$6(this, "editLine", null);
        __publicField$6(this, "editStartPoint", null);
        __publicField$6(this, "editEndPoint", null);
        __publicField$6(this, "isMovingShape", false);
        __publicField$6(this, "dragStart", null);
        __publicField$6(this, "initialPixelPoints", []);
        __publicField$6(this, "onDrawingMouseDown", (payload) => {
          if (this.isEditing)
            return;
          const drawing = this.context.getDrawing(payload.id);
          if (!drawing)
            return;
          this.isEditing = true;
          this.isMovingShape = true;
          this.currentDrawing = JSON.parse(JSON.stringify(drawing));
          this.dragStart = { x: payload.x, y: payload.y };
          this.initialPixelPoints = drawing.points.map((p) => {
            const pixel = this.context.coordinateConversion.dataToPixel(p);
            return pixel ? { x: pixel.x, y: pixel.y } : { x: 0, y: 0 };
          });
          this.context.lockChart();
          this.createEditGraphic();
          this.zr.on("mousemove", this.onMouseMove);
          this.zr.on("mouseup", this.onMouseUp);
        });
        __publicField$6(this, "onPointMouseDown", (payload) => {
          if (this.isEditing)
            return;
          const drawing = this.context.getDrawing(payload.id);
          if (!drawing)
            return;
          this.isEditing = true;
          this.currentDrawing = JSON.parse(JSON.stringify(drawing));
          this.editingPointIndex = payload.pointIndex;
          this.context.lockChart();
          this.createEditGraphic();
          this.zr.on("mousemove", this.onMouseMove);
          this.zr.on("mouseup", this.onMouseUp);
        });
        __publicField$6(this, "onMouseMove", (e) => {
          if (!this.isEditing || !this.currentDrawing)
            return;
          const x = e.offsetX;
          const y = e.offsetY;
          if (this.isMovingShape && this.dragStart) {
            const dx = x - this.dragStart.x;
            const dy = y - this.dragStart.y;
            const newP1 = {
              x: this.initialPixelPoints[0].x + dx,
              y: this.initialPixelPoints[0].y + dy
            };
            const newP2 = {
              x: this.initialPixelPoints[1].x + dx,
              y: this.initialPixelPoints[1].y + dy
            };
            this.editLine.setShape({
              x1: newP1.x,
              y1: newP1.y,
              x2: newP2.x,
              y2: newP2.y
            });
            this.editStartPoint.setShape({ cx: newP1.x, cy: newP1.y });
            this.editEndPoint.setShape({ cx: newP2.x, cy: newP2.y });
          } else if (this.editingPointIndex !== null) {
            if (this.editingPointIndex === 0) {
              this.editLine.setShape({ x1: x, y1: y });
              this.editStartPoint.setShape({ cx: x, cy: y });
            } else {
              this.editLine.setShape({ x2: x, y2: y });
              this.editEndPoint.setShape({ cx: x, cy: y });
            }
          }
        });
        __publicField$6(this, "onMouseUp", (e) => {
          if (!this.isEditing)
            return;
          this.finishEditing(e.offsetX, e.offsetY);
        });
        this.context = context;
        this.zr = this.context.getChart().getZr();
        this.bindEvents();
      }
      bindEvents() {
        this.context.events.on("drawing:point:mousedown", this.onPointMouseDown);
        this.context.events.on("drawing:mousedown", this.onDrawingMouseDown);
      }
      createEditGraphic() {
        if (!this.currentDrawing)
          return;
        this.editGroup = new echarts__namespace.graphic.Group();
        const p1Data = this.currentDrawing.points[0];
        const p2Data = this.currentDrawing.points[1];
        const p1 = this.context.coordinateConversion.dataToPixel(p1Data);
        const p2 = this.context.coordinateConversion.dataToPixel(p2Data);
        if (!p1 || !p2)
          return;
        this.editLine = new echarts__namespace.graphic.Line({
          shape: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
          style: {
            stroke: this.currentDrawing.style?.color || "#3b82f6",
            lineWidth: this.currentDrawing.style?.lineWidth || 2,
            lineDash: [4, 4]
            // Dashed to indicate editing
          },
          silent: true
          // Events pass through to handlers
        });
        this.editStartPoint = new echarts__namespace.graphic.Circle({
          shape: { cx: p1.x, cy: p1.y, r: 5 },
          style: { fill: "#fff", stroke: "#3b82f6", lineWidth: 2 },
          z: 1e3
        });
        this.editEndPoint = new echarts__namespace.graphic.Circle({
          shape: { cx: p2.x, cy: p2.y, r: 5 },
          style: { fill: "#fff", stroke: "#3b82f6", lineWidth: 2 },
          z: 1e3
        });
        this.editGroup.add(this.editLine);
        this.editGroup.add(this.editStartPoint);
        this.editGroup.add(this.editEndPoint);
        this.zr.add(this.editGroup);
      }
      finishEditing(finalX, finishY) {
        if (!this.currentDrawing)
          return;
        if (this.isMovingShape && this.dragStart) {
          const dx = finalX - this.dragStart.x;
          const dy = finishY - this.dragStart.y;
          const newPoints = this.initialPixelPoints.map((p, i) => {
            const newX = p.x + dx;
            const newY = p.y + dy;
            return this.context.coordinateConversion.pixelToData({
              x: newX,
              y: newY
            });
          });
          if (newPoints.every((p) => p !== null)) {
            if (newPoints[0] && newPoints[1]) {
              this.currentDrawing.points[0] = newPoints[0];
              this.currentDrawing.points[1] = newPoints[1];
              if (newPoints[0].paneIndex !== void 0) {
                this.currentDrawing.paneIndex = newPoints[0].paneIndex;
              }
              this.context.updateDrawing(this.currentDrawing);
            }
          }
        } else if (this.editingPointIndex !== null) {
          const newData = this.context.coordinateConversion.pixelToData({
            x: finalX,
            y: finishY
          });
          if (newData) {
            this.currentDrawing.points[this.editingPointIndex] = newData;
            if (this.editingPointIndex === 0 && newData.paneIndex !== void 0) {
              this.currentDrawing.paneIndex = newData.paneIndex;
            }
            this.context.updateDrawing(this.currentDrawing);
          }
        }
        this.isEditing = false;
        this.isMovingShape = false;
        this.dragStart = null;
        this.initialPixelPoints = [];
        this.currentDrawing = null;
        this.editingPointIndex = null;
        if (this.editGroup) {
          this.zr.remove(this.editGroup);
          this.editGroup = null;
        }
        this.zr.off("mousemove", this.onMouseMove);
        this.zr.off("mouseup", this.onMouseUp);
        this.context.unlockChart();
      }
    }

    var __defProp$5 = Object.defineProperty;
    var __defNormalProp$5 = (obj, key, value) => key in obj ? __defProp$5(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$5 = (obj, key, value) => {
      __defNormalProp$5(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class EventBus {
      constructor() {
        __publicField$5(this, "handlers", /* @__PURE__ */ new Map());
      }
      on(event, handler) {
        if (!this.handlers.has(event)) {
          this.handlers.set(event, /* @__PURE__ */ new Set());
        }
        this.handlers.get(event).add(handler);
      }
      off(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
          handlers.delete(handler);
        }
      }
      emit(event, payload) {
        const handlers = this.handlers.get(event);
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(payload);
            } catch (e) {
              console.error(`Error in EventBus handler for ${event}:`, e);
            }
          });
        }
      }
      clear() {
        this.handlers.clear();
      }
    }

    var __defProp$4 = Object.defineProperty;
    var __defNormalProp$4 = (obj, key, value) => key in obj ? __defProp$4(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$4 = (obj, key, value) => {
      __defNormalProp$4(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class QFChart {
      constructor(container, options = {}) {
        __publicField$4(this, "chart");
        __publicField$4(this, "options");
        __publicField$4(this, "marketData", []);
        __publicField$4(this, "indicators", /* @__PURE__ */ new Map());
        __publicField$4(this, "timeToIndex", /* @__PURE__ */ new Map());
        __publicField$4(this, "pluginManager");
        __publicField$4(this, "drawingEditor");
        __publicField$4(this, "events", new EventBus());
        __publicField$4(this, "isMainCollapsed", false);
        __publicField$4(this, "maximizedPaneId", null);
        __publicField$4(this, "countdownInterval", null);
        __publicField$4(this, "selectedDrawingId", null);
        // Track selected drawing
        // Drawing System
        __publicField$4(this, "drawings", []);
        __publicField$4(this, "coordinateConversion", {
          pixelToData: (point) => {
            const option = this.chart.getOption();
            if (!option || !option.grid)
              return null;
            const gridCount = option.grid.length;
            for (let i = 0; i < gridCount; i++) {
              if (this.chart.containPixel({ gridIndex: i }, [point.x, point.y])) {
                this.chart.convertFromPixel({ seriesIndex: i }, [point.x, point.y]);
                const pGrid = this.chart.convertFromPixel({ gridIndex: i }, [point.x, point.y]);
                if (pGrid) {
                  return { timeIndex: Math.round(pGrid[0]), value: pGrid[1], paneIndex: i };
                }
              }
            }
            return null;
          },
          dataToPixel: (point) => {
            const paneIdx = point.paneIndex || 0;
            const p = this.chart.convertToPixel({ gridIndex: paneIdx }, [point.timeIndex, point.value]);
            if (p) {
              return { x: p[0], y: p[1] };
            }
            return null;
          }
        });
        // Default colors and constants
        __publicField$4(this, "upColor", "#00da3c");
        __publicField$4(this, "downColor", "#ec0000");
        __publicField$4(this, "defaultPadding", 0);
        __publicField$4(this, "padding");
        __publicField$4(this, "dataIndexOffset", 0);
        // Offset for phantom padding data
        // DOM Elements for Layout
        __publicField$4(this, "rootContainer");
        __publicField$4(this, "layoutContainer");
        __publicField$4(this, "toolbarContainer");
        // New Toolbar
        __publicField$4(this, "leftSidebar");
        __publicField$4(this, "rightSidebar");
        __publicField$4(this, "chartContainer");
        __publicField$4(this, "onKeyDown", (e) => {
          if ((e.key === "Delete" || e.key === "Backspace") && this.selectedDrawingId) {
            this.removeDrawing(this.selectedDrawingId);
            this.selectedDrawingId = null;
            this.render();
          }
        });
        __publicField$4(this, "onFullscreenChange", () => {
          this.render();
        });
        // --- Interaction Locking ---
        __publicField$4(this, "isLocked", false);
        __publicField$4(this, "lockedState", null);
        this.rootContainer = container;
        this.options = {
          title: "Market",
          height: "600px",
          backgroundColor: "#1e293b",
          upColor: "#00da3c",
          downColor: "#ec0000",
          fontColor: "#cbd5e1",
          fontFamily: "sans-serif",
          padding: 0.01,
          dataZoom: {
            visible: true,
            position: "top",
            height: 6
          },
          layout: {
            mainPaneHeight: "50%",
            gap: 13
          },
          watermark: true,
          ...options
        };
        if (this.options.upColor)
          this.upColor = this.options.upColor;
        if (this.options.downColor)
          this.downColor = this.options.downColor;
        this.padding = this.options.padding !== void 0 ? this.options.padding : this.defaultPadding;
        if (this.options.height) {
          if (typeof this.options.height === "number") {
            this.rootContainer.style.height = `${this.options.height}px`;
          } else {
            this.rootContainer.style.height = this.options.height;
          }
        }
        this.rootContainer.innerHTML = "";
        this.layoutContainer = document.createElement("div");
        this.layoutContainer.style.display = "flex";
        this.layoutContainer.style.width = "100%";
        this.layoutContainer.style.height = "100%";
        this.layoutContainer.style.overflow = "hidden";
        this.rootContainer.appendChild(this.layoutContainer);
        this.leftSidebar = document.createElement("div");
        this.leftSidebar.style.display = "none";
        this.leftSidebar.style.width = "250px";
        this.leftSidebar.style.flexShrink = "0";
        this.leftSidebar.style.overflowY = "auto";
        this.leftSidebar.style.backgroundColor = this.options.backgroundColor || "#1e293b";
        this.leftSidebar.style.borderRight = "1px solid #334155";
        this.leftSidebar.style.padding = "10px";
        this.leftSidebar.style.boxSizing = "border-box";
        this.leftSidebar.style.color = "#cbd5e1";
        this.leftSidebar.style.fontSize = "12px";
        this.leftSidebar.style.fontFamily = this.options.fontFamily || "sans-serif";
        this.layoutContainer.appendChild(this.leftSidebar);
        this.toolbarContainer = document.createElement("div");
        this.layoutContainer.appendChild(this.toolbarContainer);
        this.chartContainer = document.createElement("div");
        this.chartContainer.style.flexGrow = "1";
        this.chartContainer.style.height = "100%";
        this.chartContainer.style.overflow = "hidden";
        this.layoutContainer.appendChild(this.chartContainer);
        this.rightSidebar = document.createElement("div");
        this.rightSidebar.style.display = "none";
        this.rightSidebar.style.width = "250px";
        this.rightSidebar.style.flexShrink = "0";
        this.rightSidebar.style.overflowY = "auto";
        this.rightSidebar.style.backgroundColor = this.options.backgroundColor || "#1e293b";
        this.rightSidebar.style.borderLeft = "1px solid #334155";
        this.rightSidebar.style.padding = "10px";
        this.rightSidebar.style.boxSizing = "border-box";
        this.rightSidebar.style.color = "#cbd5e1";
        this.rightSidebar.style.fontSize = "12px";
        this.rightSidebar.style.fontFamily = this.options.fontFamily || "sans-serif";
        this.layoutContainer.appendChild(this.rightSidebar);
        this.chart = echarts__namespace.init(this.chartContainer);
        this.pluginManager = new PluginManager(this, this.toolbarContainer);
        this.drawingEditor = new DrawingEditor(this);
        this.chart.on("dataZoom", (params) => {
          this.events.emit("chart:dataZoom", params);
          const triggerOn = this.options.databox?.triggerOn;
          const position = this.options.databox?.position;
          if (triggerOn === "click" && position === "floating") {
            this.chart.dispatchAction({
              type: "hideTip"
            });
          }
        });
        this.chart.on("finished", (params) => this.events.emit("chart:updated", params));
        this.chart.getZr().on("mousedown", (params) => this.events.emit("mouse:down", params));
        this.chart.getZr().on("mousemove", (params) => this.events.emit("mouse:move", params));
        this.chart.getZr().on("mouseup", (params) => this.events.emit("mouse:up", params));
        this.chart.getZr().on("click", (params) => this.events.emit("mouse:click", params));
        const zr = this.chart.getZr();
        const originalSetCursorStyle = zr.setCursorStyle;
        zr.setCursorStyle = function(cursorStyle) {
          if (cursorStyle === "grab") {
            cursorStyle = "crosshair";
          }
          originalSetCursorStyle.call(this, cursorStyle);
        };
        this.bindDrawingEvents();
        window.addEventListener("resize", this.resize.bind(this));
        document.addEventListener("fullscreenchange", this.onFullscreenChange);
        document.addEventListener("keydown", this.onKeyDown);
      }
      bindDrawingEvents() {
        let hideTimeout = null;
        const getDrawingInfo = (params) => {
          if (!params || params.componentType !== "series" || !params.seriesName?.startsWith("drawings")) {
            return null;
          }
          params.seriesIndex;
          const match = params.seriesName.match(/drawings-pane-(\d+)/);
          if (!match)
            return null;
          const paneIdx = parseInt(match[1]);
          const paneDrawings = this.drawings.filter((d) => (d.paneIndex || 0) === paneIdx);
          const drawing = paneDrawings[params.dataIndex];
          if (!drawing)
            return null;
          const targetName = params.event?.target?.name;
          return { drawing, targetName, paneIdx };
        };
        this.chart.on("mouseover", (params) => {
          const info = getDrawingInfo(params);
          if (!info)
            return;
          const group = params.event?.target?.parent;
          if (group) {
            const isSelected = info.drawing.id === this.selectedDrawingId;
            if (hideTimeout) {
              clearTimeout(hideTimeout);
              hideTimeout = null;
            }
            if (!isSelected) {
              group.children().forEach((child) => {
                if (child.name && child.name.startsWith("point")) {
                  child.attr("style", { opacity: 1 });
                }
              });
            }
          }
          if (info.targetName === "line") {
            this.events.emit("drawing:hover", {
              id: info.drawing.id,
              type: info.drawing.type
            });
            this.chart.getZr().setCursorStyle("move");
          } else if (info.targetName?.startsWith("point")) {
            const pointIdx = info.targetName === "point-start" ? 0 : 1;
            this.events.emit("drawing:point:hover", {
              id: info.drawing.id,
              pointIndex: pointIdx
            });
            this.chart.getZr().setCursorStyle("pointer");
          }
        });
        this.chart.on("mouseout", (params) => {
          const info = getDrawingInfo(params);
          if (!info)
            return;
          const group = params.event?.target?.parent;
          if (info.drawing.id === this.selectedDrawingId) {
            return;
          }
          hideTimeout = setTimeout(() => {
            if (group) {
              if (this.selectedDrawingId === info.drawing.id)
                return;
              group.children().forEach((child) => {
                if (child.name && child.name.startsWith("point")) {
                  child.attr("style", { opacity: 0 });
                }
              });
            }
          }, 50);
          if (info.targetName === "line") {
            this.events.emit("drawing:mouseout", { id: info.drawing.id });
          } else if (info.targetName?.startsWith("point")) {
            const pointIdx = info.targetName === "point-start" ? 0 : 1;
            this.events.emit("drawing:point:mouseout", {
              id: info.drawing.id,
              pointIndex: pointIdx
            });
          }
          this.chart.getZr().setCursorStyle("default");
        });
        this.chart.on("mousedown", (params) => {
          const info = getDrawingInfo(params);
          if (!info)
            return;
          const event = params.event?.event || params.event;
          const x = event?.offsetX;
          const y = event?.offsetY;
          if (info.targetName === "line") {
            this.events.emit("drawing:mousedown", {
              id: info.drawing.id,
              x,
              y
            });
          } else if (info.targetName?.startsWith("point")) {
            const pointIdx = info.targetName === "point-start" ? 0 : 1;
            this.events.emit("drawing:point:mousedown", {
              id: info.drawing.id,
              pointIndex: pointIdx,
              x,
              y
            });
          }
        });
        this.chart.on("click", (params) => {
          const info = getDrawingInfo(params);
          if (!info)
            return;
          if (this.selectedDrawingId !== info.drawing.id) {
            this.selectedDrawingId = info.drawing.id;
            this.events.emit("drawing:selected", { id: info.drawing.id });
            this.render();
          }
          if (info.targetName === "line") {
            this.events.emit("drawing:click", { id: info.drawing.id });
          } else if (info.targetName?.startsWith("point")) {
            const pointIdx = info.targetName === "point-start" ? 0 : 1;
            this.events.emit("drawing:point:click", {
              id: info.drawing.id,
              pointIndex: pointIdx
            });
          }
        });
        this.chart.getZr().on("click", (params) => {
          if (!params.target) {
            if (this.selectedDrawingId) {
              this.events.emit("drawing:deselected", { id: this.selectedDrawingId });
              this.selectedDrawingId = null;
              this.render();
            }
          }
        });
      }
      // --- Plugin System Integration ---
      getChart() {
        return this.chart;
      }
      getMarketData() {
        return this.marketData;
      }
      getTimeToIndex() {
        return this.timeToIndex;
      }
      getOptions() {
        return this.options;
      }
      disableTools() {
        this.pluginManager.deactivatePlugin();
      }
      registerPlugin(plugin) {
        this.pluginManager.register(plugin);
      }
      // --- Drawing System ---
      addDrawing(drawing) {
        this.drawings.push(drawing);
        this.render();
      }
      removeDrawing(id) {
        const index = this.drawings.findIndex((d) => d.id === id);
        if (index !== -1) {
          const drawing = this.drawings[index];
          this.drawings.splice(index, 1);
          this.events.emit("drawing:deleted", { id: drawing.id });
          this.render();
        }
      }
      getDrawing(id) {
        return this.drawings.find((d) => d.id === id);
      }
      updateDrawing(drawing) {
        const index = this.drawings.findIndex((d) => d.id === drawing.id);
        if (index !== -1) {
          this.drawings[index] = drawing;
          this.render();
        }
      }
      lockChart() {
        if (this.isLocked)
          return;
        this.isLocked = true;
        const option = this.chart.getOption();
        this.chart.setOption({
          dataZoom: option.dataZoom.map((dz) => ({ ...dz, disabled: true })),
          tooltip: { show: false }
          // Hide tooltip during drag
          // We can also disable series interaction if needed, but custom series is handled by us.
        });
      }
      unlockChart() {
        if (!this.isLocked)
          return;
        this.isLocked = false;
        const option = this.chart.getOption();
        const dzConfig = this.options.dataZoom || {};
        dzConfig.visible ?? true;
        if (option.dataZoom) {
          this.chart.setOption({
            dataZoom: option.dataZoom.map((dz) => ({
              ...dz,
              disabled: false
            })),
            tooltip: { show: true }
          });
        }
      }
      // --------------------------------
      setZoom(start, end) {
        this.chart.dispatchAction({
          type: "dataZoom",
          start,
          end
        });
      }
      setMarketData(data) {
        this.marketData = data;
        this.rebuildTimeIndex();
        this.render();
      }
      /**
       * Update market data incrementally without full re-render
       * Merges new/updated OHLCV data with existing data by timestamp
       *
       * @param data - Array of OHLCV data to merge
       *
       * @remarks
       * **Performance Optimization**: This method only triggers a chart update if the data array contains
       * new or modified bars. If an empty array is passed, no update occurs (expected behavior).
       *
       * **Usage Pattern for Updating Indicators**:
       * When updating both market data and indicators, follow this order:
       *
       * 1. Update indicator data first using `indicator.updateData(plots)`
       * 2. Then call `chart.updateData(newBars)` with the new/modified market data
       *
       * The chart update will trigger a re-render that includes the updated indicator data.
       *
       * **Important**: If you update indicator data without updating market data (e.g., recalculation
       * with same bars), you must still call `chart.updateData([...])` with at least one bar
       * to trigger the re-render. Calling with an empty array will NOT trigger an update.
       *
       * @example
       * ```typescript
       * // Step 1: Update indicator data
       * macdIndicator.updateData({
       *   macd: { data: [{ time: 1234567890, value: 150 }], options: { style: 'line', color: '#2962FF' } }
       * });
       *
       * // Step 2: Update market data (triggers re-render with new indicator data)
       * chart.updateData([
       *   { time: 1234567890, open: 100, high: 105, low: 99, close: 103, volume: 1000 }
       * ]);
       * ```
       *
       * @example
       * ```typescript
       * // If only updating existing bar (e.g., real-time tick updates):
       * const lastBar = { ...existingBar, close: newPrice, high: Math.max(existingBar.high, newPrice) };
       * chart.updateData([lastBar]); // Updates by timestamp
       * ```
       */
      updateData(data) {
        if (data.length === 0)
          return;
        const existingTimeMap = /* @__PURE__ */ new Map();
        this.marketData.forEach((bar) => {
          existingTimeMap.set(bar.time, bar);
        });
        data.forEach((bar) => {
          if (!existingTimeMap.has(bar.time)) ;
          existingTimeMap.set(bar.time, bar);
        });
        this.marketData = Array.from(existingTimeMap.values()).sort((a, b) => a.time - b.time);
        this.rebuildTimeIndex();
        const paddingPoints = this.dataIndexOffset;
        const candlestickSeries = SeriesBuilder.buildCandlestickSeries(this.marketData, this.options);
        const emptyCandle = { value: [NaN, NaN, NaN, NaN], itemStyle: { opacity: 0 } };
        const paddedCandlestickData = [
          ...Array(paddingPoints).fill(emptyCandle),
          ...candlestickSeries.data,
          ...Array(paddingPoints).fill(emptyCandle)
        ];
        const categoryData = [
          ...Array(paddingPoints).fill(""),
          ...this.marketData.map((k) => new Date(k.time).toLocaleString()),
          ...Array(paddingPoints).fill("")
        ];
        const currentOption = this.chart.getOption();
        const layout = LayoutManager.calculate(
          this.chart.getHeight(),
          this.indicators,
          this.options,
          this.isMainCollapsed,
          this.maximizedPaneId,
          this.marketData
        );
        const paddedOHLCVForShapes = [...Array(paddingPoints).fill(null), ...this.marketData, ...Array(paddingPoints).fill(null)];
        const { series: indicatorSeries, barColors } = SeriesBuilder.buildIndicatorSeries(
          this.indicators,
          this.timeToIndex,
          layout.paneLayout,
          categoryData.length,
          paddingPoints,
          paddedOHLCVForShapes,
          // Pass padded OHLCV data
          layout.overlayYAxisMap,
          // Pass overlay Y-axis mapping
          layout.separatePaneYAxisOffset
          // Pass Y-axis offset for separate panes
        );
        const coloredCandlestickData = paddedCandlestickData.map((candle, i) => {
          if (barColors[i]) {
            return {
              value: candle.value || candle,
              itemStyle: {
                color: barColors[i],
                color0: barColors[i],
                borderColor: barColors[i],
                borderColor0: barColors[i]
              }
            };
          }
          return candle;
        });
        const updateOption = {
          xAxis: currentOption.xAxis.map((axis, index) => ({
            data: categoryData
          })),
          series: [
            {
              data: coloredCandlestickData,
              markLine: candlestickSeries.markLine
              // Ensure markLine is updated
            },
            ...indicatorSeries.map((s) => {
              const update = { data: s.data };
              if (s.renderItem) {
                update.renderItem = s.renderItem;
              }
              return update;
            })
          ]
        };
        this.chart.setOption(updateOption, { notMerge: false });
        this.startCountdown();
      }
      startCountdown() {
        this.stopCountdown();
        if (!this.options.lastPriceLine?.showCountdown || !this.options.interval || this.marketData.length === 0) {
          return;
        }
        const updateLabel = () => {
          if (this.marketData.length === 0)
            return;
          const lastBar = this.marketData[this.marketData.length - 1];
          const nextCloseTime = lastBar.time + (this.options.interval || 0);
          const now = Date.now();
          const diff = nextCloseTime - now;
          if (diff <= 0) {
            return;
          }
          const absDiff = Math.abs(diff);
          const hours = Math.floor(absDiff / 36e5);
          const minutes = Math.floor(absDiff % 36e5 / 6e4);
          const seconds = Math.floor(absDiff % 6e4 / 1e3);
          const timeString = `${hours > 0 ? hours.toString().padStart(2, "0") + ":" : ""}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
          const currentOption = this.chart.getOption();
          if (!currentOption || !currentOption.series)
            return;
          const candleSeriesIndex = currentOption.series.findIndex((s) => s.type === "candlestick");
          if (candleSeriesIndex === -1)
            return;
          const candleSeries = currentOption.series[candleSeriesIndex];
          if (!candleSeries.markLine || !candleSeries.markLine.data || !candleSeries.markLine.data[0])
            return;
          const markLineData = candleSeries.markLine.data[0];
          markLineData.label.formatter;
          const price = markLineData.yAxis;
          let priceStr = "";
          if (this.options.yAxisLabelFormatter) {
            priceStr = this.options.yAxisLabelFormatter(price);
          } else {
            const decimals = this.options.yAxisDecimalPlaces !== void 0 ? this.options.yAxisDecimalPlaces : 2;
            priceStr = typeof price === "number" ? price.toFixed(decimals) : price;
          }
          const labelText = `${priceStr}
${timeString}`;
          this.chart.setOption({
            series: [
              {
                name: this.options.title || "Market",
                markLine: {
                  data: [
                    {
                      ...markLineData,
                      // Preserve lineStyle (color), symbol, yAxis, etc.
                      label: {
                        ...markLineData.label,
                        // Preserve existing label styles including backgroundColor
                        formatter: labelText
                        // Update only the text
                      }
                    }
                  ]
                }
              }
            ]
          });
        };
        updateLabel();
        this.countdownInterval = setInterval(updateLabel, 1e3);
      }
      stopCountdown() {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
      }
      addIndicator(id, plots, options = {}) {
        const isOverlay = options.overlay !== void 0 ? options.overlay : options.isOverlay ?? false;
        let paneIndex = 0;
        if (!isOverlay) {
          let maxPaneIndex = 0;
          this.indicators.forEach((ind) => {
            if (ind.paneIndex > maxPaneIndex) {
              maxPaneIndex = ind.paneIndex;
            }
          });
          paneIndex = maxPaneIndex + 1;
        }
        const indicator = new Indicator(id, plots, paneIndex, {
          height: options.height,
          collapsed: false,
          titleColor: options.titleColor,
          controls: options.controls
        });
        this.indicators.set(id, indicator);
        this.render();
        return indicator;
      }
      /** @deprecated Use addIndicator instead */
      setIndicator(id, plot, isOverlay = false) {
        this.addIndicator(id, { [id]: plot }, { overlay: isOverlay });
      }
      removeIndicator(id) {
        this.indicators.delete(id);
        this.render();
      }
      toggleIndicator(id, action = "collapse") {
        if (action === "fullscreen") {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            this.rootContainer.requestFullscreen();
          }
          return;
        }
        if (action === "maximize") {
          if (this.maximizedPaneId === id) {
            this.maximizedPaneId = null;
          } else {
            this.maximizedPaneId = id;
          }
          this.render();
          return;
        }
        if (id === "main") {
          this.isMainCollapsed = !this.isMainCollapsed;
          this.render();
          return;
        }
        const indicator = this.indicators.get(id);
        if (indicator) {
          indicator.toggleCollapse();
          this.render();
        }
      }
      resize() {
        this.chart.resize();
      }
      destroy() {
        this.stopCountdown();
        window.removeEventListener("resize", this.resize.bind(this));
        document.removeEventListener("fullscreenchange", this.onFullscreenChange);
        document.removeEventListener("keydown", this.onKeyDown);
        this.pluginManager.deactivatePlugin();
        this.pluginManager.destroy();
        this.chart.dispose();
      }
      rebuildTimeIndex() {
        this.timeToIndex.clear();
        this.marketData.forEach((k, index) => {
          this.timeToIndex.set(k.time, index);
        });
        const dataLength = this.marketData.length;
        const paddingPoints = Math.ceil(dataLength * this.padding);
        this.dataIndexOffset = paddingPoints;
      }
      render() {
        if (this.marketData.length === 0)
          return;
        let currentZoomState = null;
        try {
          const currentOption = this.chart.getOption();
          if (currentOption && currentOption.dataZoom && currentOption.dataZoom.length > 0) {
            const zoomComponent = currentOption.dataZoom.find((dz) => dz.type === "slider" || dz.type === "inside");
            if (zoomComponent) {
              currentZoomState = {
                start: zoomComponent.start,
                end: zoomComponent.end
              };
            }
          }
        } catch (e) {
        }
        const tooltipPos = this.options.databox?.position;
        const prevLeftDisplay = this.leftSidebar.style.display;
        const prevRightDisplay = this.rightSidebar.style.display;
        const newLeftDisplay = tooltipPos === "left" ? "block" : "none";
        const newRightDisplay = tooltipPos === "right" ? "block" : "none";
        if (prevLeftDisplay !== newLeftDisplay || prevRightDisplay !== newRightDisplay) {
          this.leftSidebar.style.display = newLeftDisplay;
          this.rightSidebar.style.display = newRightDisplay;
          this.chart.resize();
        }
        const paddingPoints = this.dataIndexOffset;
        const categoryData = [
          ...Array(paddingPoints).fill(""),
          // Left padding
          ...this.marketData.map((k) => new Date(k.time).toLocaleString()),
          ...Array(paddingPoints).fill("")
          // Right padding
        ];
        const layout = LayoutManager.calculate(
          this.chart.getHeight(),
          this.indicators,
          this.options,
          this.isMainCollapsed,
          this.maximizedPaneId,
          this.marketData
        );
        if (!currentZoomState && layout.dataZoom && this.marketData.length > 0) {
          const realDataLength = this.marketData.length;
          const totalLength = categoryData.length;
          const paddingRatio = paddingPoints / totalLength;
          const dataRatio = realDataLength / totalLength;
          layout.dataZoom.forEach((dz) => {
            if (dz.start !== void 0) {
              const userStartFraction = dz.start / 100;
              const actualStartFraction = paddingRatio + userStartFraction * dataRatio;
              dz.start = actualStartFraction * 100;
            }
            if (dz.end !== void 0) {
              const userEndFraction = dz.end / 100;
              const actualEndFraction = paddingRatio + userEndFraction * dataRatio;
              dz.end = actualEndFraction * 100;
            }
          });
        }
        if (currentZoomState && layout.dataZoom) {
          layout.dataZoom.forEach((dz) => {
            dz.start = currentZoomState.start;
            dz.end = currentZoomState.end;
          });
        }
        layout.xAxis.forEach((axis) => {
          axis.data = categoryData;
          axis.boundaryGap = false;
        });
        const candlestickSeries = SeriesBuilder.buildCandlestickSeries(this.marketData, this.options);
        const emptyCandle = { value: [NaN, NaN, NaN, NaN], itemStyle: { opacity: 0 } };
        candlestickSeries.data = [...Array(paddingPoints).fill(emptyCandle), ...candlestickSeries.data, ...Array(paddingPoints).fill(emptyCandle)];
        const paddedOHLCVForShapes = [...Array(paddingPoints).fill(null), ...this.marketData, ...Array(paddingPoints).fill(null)];
        const { series: indicatorSeries, barColors } = SeriesBuilder.buildIndicatorSeries(
          this.indicators,
          this.timeToIndex,
          layout.paneLayout,
          categoryData.length,
          paddingPoints,
          paddedOHLCVForShapes,
          // Pass padded OHLCV
          layout.overlayYAxisMap,
          // Pass overlay Y-axis mapping
          layout.separatePaneYAxisOffset
          // Pass Y-axis offset for separate panes
        );
        candlestickSeries.data = candlestickSeries.data.map((candle, i) => {
          if (barColors[i]) {
            return {
              value: candle.value || candle,
              itemStyle: {
                color: barColors[i],
                color0: barColors[i],
                borderColor: barColors[i],
                borderColor0: barColors[i]
              }
            };
          }
          return candle;
        });
        const graphic = GraphicBuilder.build(layout, this.options, this.toggleIndicator.bind(this), this.isMainCollapsed, this.maximizedPaneId);
        const drawingsByPane = /* @__PURE__ */ new Map();
        this.drawings.forEach((d) => {
          const paneIdx = d.paneIndex || 0;
          if (!drawingsByPane.has(paneIdx)) {
            drawingsByPane.set(paneIdx, []);
          }
          drawingsByPane.get(paneIdx).push(d);
        });
        const drawingSeriesList = [];
        drawingsByPane.forEach((drawings, paneIndex) => {
          drawingSeriesList.push({
            type: "custom",
            name: `drawings-pane-${paneIndex}`,
            xAxisIndex: paneIndex,
            yAxisIndex: paneIndex,
            clip: true,
            renderItem: (params, api) => {
              const drawing = drawings[params.dataIndex];
              if (!drawing)
                return;
              const start = drawing.points[0];
              const end = drawing.points[1];
              if (!start || !end)
                return;
              const p1 = api.coord([start.timeIndex, start.value]);
              const p2 = api.coord([end.timeIndex, end.value]);
              const isSelected = drawing.id === this.selectedDrawingId;
              if (drawing.type === "line") {
                return {
                  type: "group",
                  children: [
                    {
                      type: "line",
                      name: "line",
                      shape: {
                        x1: p1[0],
                        y1: p1[1],
                        x2: p2[0],
                        y2: p2[1]
                      },
                      style: {
                        stroke: drawing.style?.color || "#3b82f6",
                        lineWidth: drawing.style?.lineWidth || 2
                      }
                    },
                    {
                      type: "circle",
                      name: "point-start",
                      shape: { cx: p1[0], cy: p1[1], r: 4 },
                      style: {
                        fill: "#fff",
                        stroke: drawing.style?.color || "#3b82f6",
                        lineWidth: 1,
                        opacity: isSelected ? 1 : 0
                        // Show if selected
                      }
                    },
                    {
                      type: "circle",
                      name: "point-end",
                      shape: { cx: p2[0], cy: p2[1], r: 4 },
                      style: {
                        fill: "#fff",
                        stroke: drawing.style?.color || "#3b82f6",
                        lineWidth: 1,
                        opacity: isSelected ? 1 : 0
                        // Show if selected
                      }
                    }
                  ]
                };
              } else if (drawing.type === "fibonacci") {
                const x1 = p1[0];
                const y1 = p1[1];
                const x2 = p2[0];
                const y2 = p2[1];
                const startX = Math.min(x1, x2);
                const endX = Math.max(x1, x2);
                const width = endX - startX;
                const diffY = y2 - y1;
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                const colors = ["#787b86", "#f44336", "#ff9800", "#4caf50", "#2196f3", "#00bcd4", "#787b86"];
                const children = [];
                children.push({
                  type: "line",
                  name: "line",
                  // Use 'line' name to enable dragging logic in DrawingEditor
                  shape: { x1, y1, x2, y2 },
                  style: {
                    stroke: "#999",
                    lineWidth: 1,
                    lineDash: [4, 4]
                  }
                });
                children.push({
                  type: "circle",
                  name: "point-start",
                  shape: { cx: x1, cy: y1, r: 4 },
                  style: {
                    fill: "#fff",
                    stroke: drawing.style?.color || "#3b82f6",
                    lineWidth: 1,
                    opacity: isSelected ? 1 : 0
                  },
                  z: 100
                  // Ensure on top
                });
                children.push({
                  type: "circle",
                  name: "point-end",
                  shape: { cx: x2, cy: y2, r: 4 },
                  style: {
                    fill: "#fff",
                    stroke: drawing.style?.color || "#3b82f6",
                    lineWidth: 1,
                    opacity: isSelected ? 1 : 0
                  },
                  z: 100
                });
                levels.forEach((level, index) => {
                  const levelY = y2 - diffY * level;
                  const color = colors[index % colors.length];
                  children.push({
                    type: "line",
                    name: "fib-line",
                    // distinct name, maybe we don't want to drag by clicking these lines? or yes? 'line' triggers drag. 'fib-line' won't unless we update logic.
                    // The user asked for "fib levels between start and end".
                    shape: { x1: startX, y1: levelY, x2: endX, y2: levelY },
                    style: { stroke: color, lineWidth: 1 },
                    silent: true
                    // Make internal lines silent so clicks pass to background/diagonal?
                  });
                  const startVal = drawing.points[0].value;
                  const endVal = drawing.points[1].value;
                  const valDiff = endVal - startVal;
                  const price = endVal - valDiff * level;
                  children.push({
                    type: "text",
                    style: {
                      text: `${level} (${price.toFixed(2)})`,
                      x: startX + 5,
                      y: levelY - 10,
                      fill: color,
                      fontSize: 10
                    },
                    silent: true
                  });
                  if (index < levels.length - 1) {
                    const nextLevel = levels[index + 1];
                    const nextY = y2 - diffY * nextLevel;
                    const rectH = Math.abs(nextY - levelY);
                    const rectY = Math.min(levelY, nextY);
                    children.push({
                      type: "rect",
                      shape: { x: startX, y: rectY, width, height: rectH },
                      style: {
                        fill: colors[(index + 1) % colors.length],
                        opacity: 0.1
                      },
                      silent: true
                      // Let clicks pass through?
                    });
                  }
                });
                const backgrounds = [];
                const linesAndText = [];
                levels.forEach((level, index) => {
                  const levelY = y2 - diffY * level;
                  const color = colors[index % colors.length];
                  linesAndText.push({
                    type: "line",
                    shape: { x1: startX, y1: levelY, x2: endX, y2: levelY },
                    style: { stroke: color, lineWidth: 1 },
                    silent: true
                  });
                  const startVal = drawing.points[0].value;
                  const endVal = drawing.points[1].value;
                  const valDiff = endVal - startVal;
                  const price = endVal - valDiff * level;
                  linesAndText.push({
                    type: "text",
                    style: {
                      text: `${level} (${price.toFixed(2)})`,
                      x: startX + 5,
                      y: levelY - 10,
                      fill: color,
                      fontSize: 10
                    },
                    silent: true
                  });
                  if (index < levels.length - 1) {
                    const nextLevel = levels[index + 1];
                    const nextY = y2 - diffY * nextLevel;
                    const rectH = Math.abs(nextY - levelY);
                    const rectY = Math.min(levelY, nextY);
                    backgrounds.push({
                      type: "rect",
                      name: "line",
                      // Enable dragging by clicking background!
                      shape: { x: startX, y: rectY, width, height: rectH },
                      style: {
                        fill: colors[(index + 1) % colors.length],
                        opacity: 0.1
                      }
                    });
                  }
                });
                return {
                  type: "group",
                  children: [
                    ...backgrounds,
                    ...linesAndText,
                    {
                      type: "line",
                      name: "line",
                      shape: { x1, y1, x2, y2 },
                      style: { stroke: "#999", lineWidth: 1, lineDash: [4, 4] }
                    },
                    {
                      type: "circle",
                      name: "point-start",
                      shape: { cx: x1, cy: y1, r: 4 },
                      style: {
                        fill: "#fff",
                        stroke: drawing.style?.color || "#3b82f6",
                        lineWidth: 1,
                        opacity: isSelected ? 1 : 0
                      },
                      z: 100
                    },
                    {
                      type: "circle",
                      name: "point-end",
                      shape: { cx: x2, cy: y2, r: 4 },
                      style: {
                        fill: "#fff",
                        stroke: drawing.style?.color || "#3b82f6",
                        lineWidth: 1,
                        opacity: isSelected ? 1 : 0
                      },
                      z: 100
                    }
                  ]
                };
              }
            },
            data: drawings.map((d) => [d.points[0].timeIndex, d.points[0].value, d.points[1].timeIndex, d.points[1].value]),
            z: 100,
            silent: false
          });
        });
        const tooltipFormatter = (params) => {
          const html = TooltipFormatter.format(params, this.options);
          const mode = this.options.databox?.position;
          if (mode === "left") {
            this.leftSidebar.innerHTML = html;
            return "";
          }
          if (mode === "right") {
            this.rightSidebar.innerHTML = html;
            return "";
          }
          if (!this.options.databox) {
            return "";
          }
          return `<div style="min-width: 200px;">${html}</div>`;
        };
        const option = {
          backgroundColor: this.options.backgroundColor,
          animation: false,
          legend: {
            show: false
            // Hide default legend as we use tooltip
          },
          tooltip: {
            show: true,
            showContent: !!this.options.databox,
            // Show content only if databox is present
            trigger: "axis",
            triggerOn: this.options.databox?.triggerOn ?? "mousemove",
            // Control when to show tooltip/crosshair
            axisPointer: { type: "cross", label: { backgroundColor: "#475569" } },
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            borderWidth: 1,
            borderColor: "#334155",
            padding: 10,
            textStyle: {
              color: "#fff",
              fontFamily: this.options.fontFamily || "sans-serif"
            },
            formatter: tooltipFormatter,
            extraCssText: tooltipPos !== "floating" && tooltipPos !== void 0 ? "display: none !important;" : void 0,
            position: (pos, params, el, elRect, size) => {
              const mode = this.options.databox?.position;
              if (mode === "floating") {
                const obj = { top: 10 };
                obj[["left", "right"][+(pos[0] < size.viewSize[0] / 2)]] = 30;
                return obj;
              }
              return null;
            }
          },
          axisPointer: {
            link: { xAxisIndex: "all" },
            label: { backgroundColor: "#475569" }
          },
          graphic,
          grid: layout.grid,
          xAxis: layout.xAxis,
          yAxis: layout.yAxis,
          dataZoom: layout.dataZoom,
          series: [candlestickSeries, ...indicatorSeries, ...drawingSeriesList]
        };
        this.chart.setOption(option, true);
      }
    }

    var __defProp$3 = Object.defineProperty;
    var __defNormalProp$3 = (obj, key, value) => key in obj ? __defProp$3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$3 = (obj, key, value) => {
      __defNormalProp$3(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class AbstractPlugin {
      constructor(config) {
        __publicField$3(this, "id");
        __publicField$3(this, "name");
        __publicField$3(this, "icon");
        __publicField$3(this, "context");
        __publicField$3(this, "eventListeners", []);
        this.id = config.id;
        this.name = config.name;
        this.icon = config.icon;
      }
      init(context) {
        this.context = context;
        this.onInit();
      }
      /**
       * Lifecycle hook called after context is initialized.
       * Override this instead of init().
       */
      onInit() {
      }
      activate() {
        this.onActivate();
        this.context.events.emit("plugin:activated", this.id);
      }
      /**
       * Lifecycle hook called when the plugin is activated.
       */
      onActivate() {
      }
      deactivate() {
        this.onDeactivate();
        this.context.events.emit("plugin:deactivated", this.id);
      }
      /**
       * Lifecycle hook called when the plugin is deactivated.
       */
      onDeactivate() {
      }
      destroy() {
        this.removeAllListeners();
        this.onDestroy();
      }
      /**
       * Lifecycle hook called when the plugin is destroyed.
       */
      onDestroy() {
      }
      // --- Helper Methods ---
      /**
       * Register an event listener that will be automatically cleaned up on destroy.
       */
      on(event, handler) {
        this.context.events.on(event, handler);
        this.eventListeners.push({ event, handler });
      }
      /**
       * Remove a specific event listener.
       */
      off(event, handler) {
        this.context.events.off(event, handler);
        this.eventListeners = this.eventListeners.filter(
          (l) => l.event !== event || l.handler !== handler
        );
      }
      /**
       * Remove all listeners registered by this plugin.
       */
      removeAllListeners() {
        this.eventListeners.forEach(({ event, handler }) => {
          this.context.events.off(event, handler);
        });
        this.eventListeners = [];
      }
      /**
       * Access to the ECharts instance.
       */
      get chart() {
        return this.context.getChart();
      }
      /**
       * Access to market data.
       */
      get marketData() {
        return this.context.getMarketData();
      }
    }

    var __defProp$2 = Object.defineProperty;
    var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$2 = (obj, key, value) => {
      __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class MeasureTool extends AbstractPlugin {
      // End Arrow
      constructor(options) {
        super({
          id: "measure",
          name: options?.name || "Measure",
          icon: options?.icon || `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M160-240q-33 0-56.5-23.5T80-320v-320q0-33 23.5-56.5T160-720h640q33 0 56.5 23.5T880-640v320q0 33-23.5 56.5T800-240H160Zm0-80h640v-320H680v160h-80v-160h-80v160h-80v-160h-80v160h-80v-160H160v320Zm120-160h80-80Zm160 0h80-80Zm160 0h80-80Zm-120 0Z"/></svg>`
        });
        __publicField$2(this, "zr");
        __publicField$2(this, "state", "idle");
        __publicField$2(this, "startPoint", null);
        __publicField$2(this, "endPoint", null);
        // ZRender Elements
        __publicField$2(this, "group", null);
        __publicField$2(this, "rect", null);
        // Measurement Box
        __publicField$2(this, "labelRect", null);
        // Label Background
        __publicField$2(this, "labelText", null);
        // Label Text
        __publicField$2(this, "lineV", null);
        // Vertical Arrow Line
        __publicField$2(this, "lineH", null);
        // Horizontal Arrow Line
        __publicField$2(this, "arrowStart", null);
        // Start Arrow
        __publicField$2(this, "arrowEnd", null);
        // --- Interaction Handlers ---
        __publicField$2(this, "onMouseDown", () => {
          if (this.state === "finished") {
            this.removeGraphic();
          }
        });
        __publicField$2(this, "onChartInteraction", () => {
          if (this.group) {
            this.removeGraphic();
          }
        });
        __publicField$2(this, "onClick", (params) => {
          if (this.state === "idle") {
            this.state = "drawing";
            this.startPoint = [params.offsetX, params.offsetY];
            this.endPoint = [params.offsetX, params.offsetY];
            this.initGraphic();
            this.updateGraphic();
          } else if (this.state === "drawing") {
            this.state = "finished";
            this.endPoint = [params.offsetX, params.offsetY];
            this.updateGraphic();
            this.context.disableTools();
            this.enableClearListeners();
          }
        });
        __publicField$2(this, "clearHandlers", {});
        __publicField$2(this, "onMouseMove", (params) => {
          if (this.state !== "drawing")
            return;
          this.endPoint = [params.offsetX, params.offsetY];
          this.updateGraphic();
        });
      }
      onInit() {
        this.zr = this.chart.getZr();
      }
      onActivate() {
        this.state = "idle";
        this.chart.getZr().setCursorStyle("crosshair");
        this.zr.on("click", this.onClick);
        this.zr.on("mousemove", this.onMouseMove);
      }
      onDeactivate() {
        this.state = "idle";
        this.chart.getZr().setCursorStyle("default");
        this.zr.off("click", this.onClick);
        this.zr.off("mousemove", this.onMouseMove);
        this.disableClearListeners();
        if (this.state === "drawing") {
          this.removeGraphic();
        }
      }
      onDestroy() {
        this.removeGraphic();
      }
      enableClearListeners() {
        const clickHandler = () => {
          this.removeGraphic();
        };
        setTimeout(() => {
          this.zr.on("click", clickHandler);
        }, 10);
        this.zr.on("mousedown", this.onMouseDown);
        this.context.events.on("chart:dataZoom", this.onChartInteraction);
        this.clearHandlers = {
          click: clickHandler,
          mousedown: this.onMouseDown,
          dataZoom: this.onChartInteraction
        };
      }
      disableClearListeners() {
        if (this.clearHandlers.click)
          this.zr.off("click", this.clearHandlers.click);
        if (this.clearHandlers.mousedown)
          this.zr.off("mousedown", this.clearHandlers.mousedown);
        if (this.clearHandlers.dataZoom) {
          this.context.events.off("chart:dataZoom", this.clearHandlers.dataZoom);
        }
        this.clearHandlers = {};
      }
      // --- Graphics ---
      initGraphic() {
        if (this.group)
          return;
        this.group = new echarts__namespace.graphic.Group();
        this.rect = new echarts__namespace.graphic.Rect({
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: "rgba(0,0,0,0)", stroke: "transparent", lineWidth: 0 },
          z: 100
        });
        this.lineV = new echarts__namespace.graphic.Line({
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          style: { stroke: "#fff", lineWidth: 1, lineDash: [4, 4] },
          z: 101
        });
        this.lineH = new echarts__namespace.graphic.Line({
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          style: { stroke: "#fff", lineWidth: 1, lineDash: [4, 4] },
          z: 101
        });
        this.arrowStart = new echarts__namespace.graphic.Polygon({
          shape: {
            points: [
              [0, 0],
              [-5, 10],
              [5, 10]
            ]
          },
          style: { fill: "#fff" },
          z: 102
        });
        this.arrowEnd = new echarts__namespace.graphic.Polygon({
          shape: {
            points: [
              [0, 0],
              [-5, -10],
              [5, -10]
            ]
          },
          style: { fill: "#fff" },
          z: 102
        });
        this.labelRect = new echarts__namespace.graphic.Rect({
          shape: { x: 0, y: 0, width: 0, height: 0, r: 4 },
          style: {
            fill: "transparent",
            stroke: "transparent",
            lineWidth: 0,
            shadowBlur: 5,
            shadowColor: "rgba(0,0,0,0.3)"
          },
          z: 102
        });
        this.labelText = new echarts__namespace.graphic.Text({
          style: {
            x: 0,
            y: 0,
            text: "",
            fill: "#fff",
            font: "12px sans-serif",
            align: "center",
            verticalAlign: "middle"
          },
          z: 103
        });
        this.group.add(this.rect);
        this.group.add(this.lineV);
        this.group.add(this.lineH);
        this.group.add(this.arrowStart);
        this.group.add(this.arrowEnd);
        this.group.add(this.labelRect);
        this.group.add(this.labelText);
        this.zr.add(this.group);
      }
      removeGraphic() {
        if (this.group) {
          this.zr.remove(this.group);
          this.group = null;
          this.disableClearListeners();
        }
      }
      updateGraphic() {
        if (!this.startPoint || !this.endPoint || !this.group)
          return;
        const [x1, y1] = this.startPoint;
        const [x2, y2] = this.endPoint;
        const p1 = this.context.coordinateConversion.pixelToData({ x: x1, y: y1 });
        const p2 = this.context.coordinateConversion.pixelToData({ x: x2, y: y2 });
        if (!p1 || !p2)
          return;
        const idx1 = Math.round(p1.timeIndex);
        const idx2 = Math.round(p2.timeIndex);
        const val1 = p1.value;
        const val2 = p2.value;
        const bars = idx2 - idx1;
        const priceDiff = val2 - val1;
        const priceChangePercent = priceDiff / val1 * 100;
        const isUp = priceDiff >= 0;
        const color = isUp ? "rgba(33, 150, 243, 0.2)" : "rgba(236, 0, 0, 0.2)";
        const strokeColor = isUp ? "#2196F3" : "#ec0000";
        this.rect.setShape({
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1)
        });
        this.rect.setStyle({ fill: color });
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        this.lineV.setShape({ x1: midX, y1, x2: midX, y2 });
        this.lineV.setStyle({ stroke: strokeColor });
        this.lineH.setShape({ x1, y1: midY, x2, y2: midY });
        this.lineH.setStyle({ stroke: strokeColor });
        const topY = Math.min(y1, y2);
        const bottomY = Math.max(y1, y2);
        this.arrowStart.setStyle({ fill: "none" });
        this.arrowEnd.setStyle({ fill: "none" });
        if (isUp) {
          this.arrowStart.setShape({
            points: [
              [midX, topY],
              [midX - 4, topY + 6],
              [midX + 4, topY + 6]
            ]
          });
          this.arrowStart.setStyle({ fill: strokeColor });
        } else {
          this.arrowEnd.setShape({
            points: [
              [midX, bottomY],
              [midX - 4, bottomY - 6],
              [midX + 4, bottomY - 6]
            ]
          });
          this.arrowEnd.setStyle({ fill: strokeColor });
        }
        const textContent = [`${priceDiff.toFixed(2)} (${priceChangePercent.toFixed(2)}%)`, `${bars} bars, ${(bars * 0).toFixed(0)}d`].join("\n");
        const labelW = 140;
        const labelH = 40;
        const rectBottomY = Math.max(y1, y2);
        const rectTopY = Math.min(y1, y2);
        const rectCenterX = (x1 + x2) / 2;
        let labelX = rectCenterX - labelW / 2;
        let labelY = rectBottomY + 10;
        const canvasHeight = this.chart.getHeight();
        if (labelY + labelH > canvasHeight) {
          labelY = rectTopY - labelH - 10;
        }
        this.labelRect.setShape({
          x: labelX,
          y: labelY,
          width: labelW,
          height: labelH
        });
        this.labelRect.setStyle({
          fill: "#1e293b",
          stroke: strokeColor,
          lineWidth: 1
        });
        this.labelText.setStyle({
          x: labelX + labelW / 2,
          y: labelY + labelH / 2,
          text: textContent,
          fill: "#fff"
        });
      }
    }

    var __defProp$1 = Object.defineProperty;
    var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$1 = (obj, key, value) => {
      __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class LineTool extends AbstractPlugin {
      constructor(options) {
        super({
          id: "trend-line",
          name: options?.name || "Trend Line",
          icon: options?.icon || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="22" x2="22" y2="2" /></svg>`
        });
        __publicField$1(this, "zr");
        __publicField$1(this, "state", "idle");
        __publicField$1(this, "startPoint", null);
        __publicField$1(this, "endPoint", null);
        // ZRender Elements
        __publicField$1(this, "group", null);
        __publicField$1(this, "line", null);
        __publicField$1(this, "startCircle", null);
        __publicField$1(this, "endCircle", null);
        // --- Interaction Handlers ---
        __publicField$1(this, "onMouseDown", () => {
        });
        __publicField$1(this, "onChartInteraction", () => {
        });
        __publicField$1(this, "onClick", (params) => {
          if (this.state === "idle") {
            this.state = "drawing";
            this.startPoint = [params.offsetX, params.offsetY];
            this.endPoint = [params.offsetX, params.offsetY];
            this.initGraphic();
            this.updateGraphic();
          } else if (this.state === "drawing") {
            this.state = "finished";
            this.endPoint = [params.offsetX, params.offsetY];
            this.updateGraphic();
            if (this.startPoint && this.endPoint) {
              const start = this.context.coordinateConversion.pixelToData({
                x: this.startPoint[0],
                y: this.startPoint[1]
              });
              const end = this.context.coordinateConversion.pixelToData({
                x: this.endPoint[0],
                y: this.endPoint[1]
              });
              if (start && end) {
                const paneIndex = start.paneIndex || 0;
                this.context.addDrawing({
                  id: `line-${Date.now()}`,
                  type: "line",
                  points: [start, end],
                  paneIndex,
                  style: {
                    color: "#3b82f6",
                    lineWidth: 2
                  }
                });
              }
            }
            this.removeGraphic();
            this.context.disableTools();
          }
        });
        __publicField$1(this, "clearHandlers", {});
        __publicField$1(this, "onMouseMove", (params) => {
          if (this.state !== "drawing")
            return;
          this.endPoint = [params.offsetX, params.offsetY];
          this.updateGraphic();
        });
      }
      onInit() {
        this.zr = this.chart.getZr();
      }
      onActivate() {
        this.state = "idle";
        this.chart.getZr().setCursorStyle("crosshair");
        this.zr.on("click", this.onClick);
        this.zr.on("mousemove", this.onMouseMove);
      }
      onDeactivate() {
        this.state = "idle";
        this.chart.getZr().setCursorStyle("default");
        this.zr.off("click", this.onClick);
        this.zr.off("mousemove", this.onMouseMove);
        this.disableClearListeners();
        if (this.state === "drawing") {
          this.removeGraphic();
        }
      }
      onDestroy() {
        this.removeGraphic();
      }
      saveDataCoordinates() {
      }
      updateGraphicFromData() {
      }
      enableClearListeners() {
      }
      disableClearListeners() {
      }
      // --- Graphics ---
      initGraphic() {
        if (this.group)
          return;
        this.group = new echarts__namespace.graphic.Group();
        this.line = new echarts__namespace.graphic.Line({
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          style: { stroke: "#3b82f6", lineWidth: 2 },
          z: 100
        });
        this.startCircle = new echarts__namespace.graphic.Circle({
          shape: { cx: 0, cy: 0, r: 4 },
          style: { fill: "#fff", stroke: "#3b82f6", lineWidth: 1 },
          z: 101
        });
        this.endCircle = new echarts__namespace.graphic.Circle({
          shape: { cx: 0, cy: 0, r: 4 },
          style: { fill: "#fff", stroke: "#3b82f6", lineWidth: 1 },
          z: 101
        });
        this.group.add(this.line);
        this.group.add(this.startCircle);
        this.group.add(this.endCircle);
        this.zr.add(this.group);
      }
      removeGraphic() {
        if (this.group) {
          this.zr.remove(this.group);
          this.group = null;
          this.disableClearListeners();
        }
      }
      updateGraphic() {
        if (!this.startPoint || !this.endPoint || !this.group)
          return;
        const [x1, y1] = this.startPoint;
        const [x2, y2] = this.endPoint;
        this.line.setShape({ x1, y1, x2, y2 });
        this.startCircle.setShape({ cx: x1, cy: y1 });
        this.endCircle.setShape({ cx: x2, cy: y2 });
      }
    }

    var __defProp = Object.defineProperty;
    var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField = (obj, key, value) => {
      __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    class FibonacciTool extends AbstractPlugin {
      constructor(options = {}) {
        super({
          id: "fibonacci-tool",
          name: options.name || "Fibonacci Retracement",
          icon: options.icon || `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M120-80v-80h720v80H120Zm0-240v-80h720v80H120Zm0-240v-80h720v80H120Zm0-240v-80h720v80H120Z"/></svg>`
        });
        __publicField(this, "startPoint", null);
        __publicField(this, "endPoint", null);
        __publicField(this, "state", "idle");
        // Temporary ZRender elements
        __publicField(this, "graphicGroup", null);
        // Fib levels config
        __publicField(this, "levels", [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
        __publicField(this, "colors", [
          "#787b86",
          // 0
          "#f44336",
          // 0.236
          "#ff9800",
          // 0.382
          "#4caf50",
          // 0.5
          "#2196f3",
          // 0.618
          "#00bcd4",
          // 0.786
          "#787b86"
          // 1
        ]);
        __publicField(this, "onClick", (params) => {
          if (this.state === "idle") {
            this.state = "drawing";
            this.startPoint = [params.offsetX, params.offsetY];
            this.endPoint = [params.offsetX, params.offsetY];
            this.initGraphic();
            this.updateGraphic();
          } else if (this.state === "drawing") {
            this.state = "finished";
            this.endPoint = [params.offsetX, params.offsetY];
            this.updateGraphic();
            this.saveDrawing();
            this.removeGraphic();
            this.context.disableTools();
          }
        });
        __publicField(this, "onMouseMove", (params) => {
          if (this.state === "drawing") {
            this.endPoint = [params.offsetX, params.offsetY];
            this.updateGraphic();
          }
        });
      }
      onActivate() {
        this.state = "idle";
        this.startPoint = null;
        this.endPoint = null;
        this.context.getChart().getZr().setCursorStyle("crosshair");
        this.bindEvents();
      }
      onDeactivate() {
        this.state = "idle";
        this.startPoint = null;
        this.endPoint = null;
        this.removeGraphic();
        this.unbindEvents();
        this.context.getChart().getZr().setCursorStyle("default");
      }
      bindEvents() {
        const zr = this.context.getChart().getZr();
        zr.on("click", this.onClick);
        zr.on("mousemove", this.onMouseMove);
      }
      unbindEvents() {
        const zr = this.context.getChart().getZr();
        zr.off("click", this.onClick);
        zr.off("mousemove", this.onMouseMove);
      }
      initGraphic() {
        this.graphicGroup = new echarts__namespace.graphic.Group();
        this.context.getChart().getZr().add(this.graphicGroup);
      }
      removeGraphic() {
        if (this.graphicGroup) {
          this.context.getChart().getZr().remove(this.graphicGroup);
          this.graphicGroup = null;
        }
      }
      updateGraphic() {
        if (!this.graphicGroup || !this.startPoint || !this.endPoint)
          return;
        this.graphicGroup.removeAll();
        const x1 = this.startPoint[0];
        const y1 = this.startPoint[1];
        const x2 = this.endPoint[0];
        const y2 = this.endPoint[1];
        const trendLine = new echarts__namespace.graphic.Line({
          shape: { x1, y1, x2, y2 },
          style: {
            stroke: "#999",
            lineWidth: 1,
            lineDash: [4, 4]
          },
          silent: true
        });
        this.graphicGroup.add(trendLine);
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        const width = endX - startX;
        const diffY = y2 - y1;
        this.levels.forEach((level, index) => {
          const levelY = y2 - diffY * level;
          const color = this.colors[index % this.colors.length];
          const line = new echarts__namespace.graphic.Line({
            shape: { x1: startX, y1: levelY, x2: endX, y2: levelY },
            style: {
              stroke: color,
              lineWidth: 1
            },
            silent: true
          });
          this.graphicGroup.add(line);
          if (index < this.levels.length - 1) {
            const nextLevel = this.levels[index + 1];
            const nextY = y2 - diffY * nextLevel;
            const rectH = Math.abs(nextY - levelY);
            const rectY = Math.min(levelY, nextY);
            const rect = new echarts__namespace.graphic.Rect({
              shape: { x: startX, y: rectY, width, height: rectH },
              style: {
                fill: this.colors[(index + 1) % this.colors.length],
                // Use next level's color
                opacity: 0.1
              },
              silent: true
            });
            this.graphicGroup.add(rect);
          }
        });
      }
      saveDrawing() {
        if (!this.startPoint || !this.endPoint)
          return;
        const start = this.context.coordinateConversion.pixelToData({
          x: this.startPoint[0],
          y: this.startPoint[1]
        });
        const end = this.context.coordinateConversion.pixelToData({
          x: this.endPoint[0],
          y: this.endPoint[1]
        });
        if (start && end) {
          const paneIndex = start.paneIndex || 0;
          this.context.addDrawing({
            id: `fib-${Date.now()}`,
            type: "fibonacci",
            points: [start, end],
            paneIndex,
            style: {
              color: "#3b82f6",
              // Default color, though individual lines use specific colors
              lineWidth: 1
            }
          });
        }
      }
    }

    exports.AbstractPlugin = AbstractPlugin;
    exports.FibonacciTool = FibonacciTool;
    exports.LineTool = LineTool;
    exports.MeasureTool = MeasureTool;
    exports.QFChart = QFChart;

}));
//# sourceMappingURL=qfchart.dev.browser.js.map
