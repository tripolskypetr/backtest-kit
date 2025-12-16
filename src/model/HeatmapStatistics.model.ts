import { IHeatmapStatistics } from "../interfaces/Heatmap.interface";

/**
 * Type alias for heatmap statistics.
 *
 * Re-exports IHeatmapStatistics from Heatmap.interface for consistent API surface.
 * Used for portfolio-wide metrics and per-symbol performance tracking.
 */
export type HeatmapStatistics = IHeatmapStatistics;
