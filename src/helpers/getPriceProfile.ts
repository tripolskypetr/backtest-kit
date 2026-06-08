/**
 * Price-profile metrics derived purely from a series of trade closes — no
 * candles, no exchange queries. Designed for `BacktestMarkdownService`,
 * `LiveMarkdownService` and per-symbol Heat: all three already have a
 * chronological series of `(closeAt, close)` points and nothing else.
 *
 * Conventions
 * -----------
 * - Pressure: fraction of up-moves vs down-moves (frequency).
 * - Strength: fraction of upward magnitude vs total movement.
 * - A divergence between pressure and strength surfaces asymmetry — e.g.
 *   frequent shallow up-moves vs rare deep down-moves is "rising on weak
 *   buys, falling on strong sells".
 * - Trend: linear regression of log(close) vs days. Slope in %/day,
 *   confidence in R². Classification is bivariate (slope × R²): neither
 *   axis alone fires, both must agree. Slope threshold is normalised by
 *   medianStepSize so the metric self-tunes to the instrument's typical
 *   move size.
 */

export type PriceTrend = "bullish" | "bearish" | "sideways" | "neutral";

export interface PriceProfile {
  /** Median |close[i] - close[i-1]| / close[i-1] across the series, in %.
   *  Robust to outliers — describes the typical close-to-close step. */
  medianStepSize: number | null;
  /** Fraction of up-moves among decisive moves (excludes flats). 0..1. */
  buyerPressure: number | null;
  /** Fraction of down-moves among decisive moves. 0..1. Equals 1 - buyerPressure. */
  sellerPressure: number | null;
  /** Share of upward absolute movement in total movement. 0..1. */
  buyerStrength: number | null;
  /** Share of downward absolute movement in total movement. 0..1. */
  sellerStrength: number | null;
  /** buyerStrength - sellerStrength, in [-1, 1]. Positive = bullish bias. */
  pressureImbalance: number | null;
  /** Bivariate classification of slope × R². See module header. */
  trend: PriceTrend | null;
  /** Log-price regression slope, in %/day. */
  trendStrength: number | null;
  /** R² of the log-price regression, in [0, 1]. */
  trendConfidence: number | null;
}

/** Minimum samples to surface any price-profile metric. Below this the
 *  per-trade step-distribution and the regression are statistically noisy. */
const MIN_SIGNALS = 10;

/** R² gate for declaring any trend at all. Below this the regression is
 *  too weak to claim a direction — treat the series as sideways even if
 *  the slope is large. 0.30 is the conventional weak-to-moderate-fit
 *  boundary in econometrics (Cohen's f² ≈ 0.43). */
const R2_TREND_GATE = 0.30;

/** Slope-magnitude threshold relative to medianStepSize for declaring the
 *  trend strong enough to call bullish/bearish. Below this the regression
 *  fits but the actual drift is weaker than the typical daily step, so we
 *  downgrade to "neutral" (a real but uninteresting tilt). */
const SLOPE_VS_STEP_GATE = 0.25;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const median = (values: number[]): number => {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const emptyProfile = (): PriceProfile => ({
  medianStepSize: null,
  buyerPressure: null,
  sellerPressure: null,
  buyerStrength: null,
  sellerStrength: null,
  pressureImbalance: null,
  trend: null,
  trendStrength: null,
  trendConfidence: null,
});

/**
 * Computes the price-profile bundle for a chronological series of trade
 * closes. The input is expected to be sorted by `closeAt` ascending; the
 * function does not sort defensively (the markdown services already sort).
 *
 * @param series - One point per closed trade: timestamp (ms) and close price.
 * @returns A bundle of nine metrics, each `null` when the input is too small
 *   or numerically unsafe.
 */
export const getPriceProfile = (
  series: Array<{ closeAt: number; close: number }>,
): PriceProfile => {
  const valid = series.filter(
    (p) =>
      isFiniteNumber(p.closeAt) &&
      p.closeAt > 0 &&
      isFiniteNumber(p.close) &&
      p.close > 0,
  );
  if (valid.length < MIN_SIGNALS) return emptyProfile();

  const n = valid.length;
  const closes = valid.map((p) => p.close);
  const times = valid.map((p) => p.closeAt);

  // --- Step distribution ---
  const stepReturns: number[] = [];
  const absSteps: number[] = [];
  let upMoves = 0;
  let downMoves = 0;
  let upMagnitude = 0;
  let downMagnitude = 0;
  for (let i = 1; i < n; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    const ret = (cur - prev) / prev;
    stepReturns.push(ret);
    const abs = Math.abs(ret);
    absSteps.push(abs);
    if (ret > 0) {
      upMoves++;
      upMagnitude += abs;
    } else if (ret < 0) {
      downMoves++;
      downMagnitude += abs;
    }
  }

  if (absSteps.length === 0) return emptyProfile();

  const medianStepSize = median(absSteps) * 100; // percent

  // --- Pressure / strength ---
  const decisiveMoves = upMoves + downMoves;
  const totalMagnitude = upMagnitude + downMagnitude;
  const buyerPressure = decisiveMoves > 0 ? upMoves / decisiveMoves : null;
  const sellerPressure = decisiveMoves > 0 ? downMoves / decisiveMoves : null;
  const buyerStrength = totalMagnitude > 0 ? upMagnitude / totalMagnitude : null;
  const sellerStrength =
    totalMagnitude > 0 ? downMagnitude / totalMagnitude : null;
  const pressureImbalance =
    buyerStrength !== null && sellerStrength !== null
      ? buyerStrength - sellerStrength
      : null;

  // --- Trend: linear regression of log(close) vs days ---
  // log-price slope is scale-invariant: 1%/day means the same whether the
  // asset trades at $0.01 or $10000. Use `closeAt[0]` as time origin so x_i
  // starts at zero — keeps numerical conditioning sane on long horizons.
  const t0 = times[0];
  const xs: number[] = new Array(n);
  const ys: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (times[i] - t0) / (1000 * 60 * 60 * 24); // days
    ys[i] = Math.log(closes[i]);
  }
  // Calendar span must be non-degenerate for the slope to mean anything.
  const xRange = xs[n - 1] - xs[0];
  let trend: PriceTrend | null = null;
  let trendStrength: number | null = null;
  let trendConfidence: number | null = null;
  if (xRange > 0) {
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let ssXX = 0;
    let ssXY = 0;
    let ssYY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      ssXX += dx * dx;
      ssXY += dx * dy;
      ssYY += dy * dy;
    }
    if (ssXX > 0) {
      const slopeLog = ssXY / ssXX; // log-return per day
      const slopePct = slopeLog * 100; // %/day (small-slope approx)
      // R² = 1 - SS_res / SS_tot. With a single explanatory variable this
      // equals (ssXY)² / (ssXX * ssYY) when ssYY > 0.
      const r2 = ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;
      trendStrength = slopePct;
      trendConfidence = Math.max(0, Math.min(1, r2));

      if (trendConfidence < R2_TREND_GATE) {
        trend = "sideways";
      } else {
        const slopeMagnitude = Math.abs(slopePct);
        const stepScale = medianStepSize * SLOPE_VS_STEP_GATE;
        if (slopeMagnitude < stepScale) {
          trend = "neutral";
        } else if (slopePct > 0) {
          trend = "bullish";
        } else {
          trend = "bearish";
        }
      }
    }
  }

  const safe = (v: number | null): number | null =>
    v === null || !Number.isFinite(v) ? null : v;

  return {
    medianStepSize: safe(medianStepSize),
    buyerPressure: safe(buyerPressure),
    sellerPressure: safe(sellerPressure),
    buyerStrength: safe(buyerStrength),
    sellerStrength: safe(sellerStrength),
    pressureImbalance: safe(pressureImbalance),
    trend,
    trendStrength: safe(trendStrength),
    trendConfidence: safe(trendConfidence),
  };
};
