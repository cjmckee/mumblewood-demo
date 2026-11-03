/** Optional experimental curve; leaving it unset preserves the shipped linear balance. */
export interface ComfortScale {
  base: number;
  slope: number;
  curve?: readonly (readonly [comfort: number, multiplier: number])[];
}

/** Proposed stronger curve, bounded at both ends and interpolated without thresholds. */
export const STRONG_COMFORT_CURVE = [[0, 2.2], [0.3, 1.8], [0.6, 1], [0.9, 0.3], [1, 0.2]] as const;
/** Comparison: reward high comfort while retaining the current penalty through 60%. */
export const REWARD_COMFORT_CURVE = [[0, 1.4], [0.3, 1.1], [0.6, 0.8], [0.9, 0.3], [1, 0.2]] as const;

export function comfortMultiplier(comfort: number, scale: ComfortScale): number {
  const value = Math.max(0, Math.min(1, comfort));
  const points = scale.curve;
  if (!points?.length) return Math.max(0.2, scale.base - value * scale.slope);
  if (value <= points[0][0]) return Math.max(0.2, points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i], [previousX, previousY] = points[i - 1];
    if (value <= x) return Math.max(0.2, previousY + (y - previousY) * (value - previousX) / (x - previousX));
  }
  return Math.max(0.2, points[points.length - 1][1]);
}
