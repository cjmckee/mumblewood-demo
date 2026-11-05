/** Stable scores keep history comparable when charter requirements rise. Player games use balanced rewards. */
export const TRACKS = ['homes', 'meals', 'evenings'] as const;
export type Track = typeof TRACKS[number];
export type RewardProfile = 'balanced' | 'steady' | 'abundance' | 'resilience';
export const REQUIREMENTS: readonly Record<Track, number>[] = [
  { homes: 0.5, meals: 0.35, evenings: 0.4 },
  { homes: 0.65, meals: 0.55, evenings: 0.5 },
  { homes: 0.8, meals: 0.7, evenings: 0.6 },
];
export interface MilestoneState {
  profile: RewardProfile;
  history: { hour: number; homes: number; meals: number; evenings: number }[];
  rng: number;
  eligibleBatches: number;
  bonusBatches: number;
  bonusUnits: number;
}
export function milestoneView(state: MilestoneState | undefined, standing: number, hour: number) {
  const samples = state?.history.filter(s => s.hour > hour - 24 && s.hour <= hour) ?? [];
  const ready = samples.length === 24 && samples.every((s, i) => s.hour === Math.floor(hour) - 23 + i);
  const requirements = REQUIREMENTS[Math.min(2, Math.max(0, standing))];
  const tracks = TRACKS.map(track => ({ track, average: samples.reduce((n, s) => n + s[track], 0) / Math.max(1, samples.length), requirement: requirements[track] }));
  const level = state && ready ? tracks.filter(t => t.average >= t.requirement - 1e-9).length : 0;
  return { tracks, level, samples: samples.length, ready, ...milestoneRewards(state?.profile, level) };
}
export function milestoneRewards(profile: RewardProfile | undefined, level: number) {
  let strain = level >= 1 ? 0.95 : 1, speed = 1, doubleChance = 0;
  if (!profile) return { strain: 1, speed, doubleChance };
  if (profile === 'balanced') { if (level >= 2) speed = 1.05; if (level >= 3) doubleChance = 0.05; }
  if (profile === 'steady') speed = level >= 3 ? 1.1 : level >= 2 ? 1.05 : 1;
  if (profile === 'abundance') doubleChance = level >= 3 ? 0.1 : level >= 2 ? 0.05 : 0;
  if (profile === 'resilience') strain = level >= 3 ? 0.85 : level >= 2 ? 0.9 : strain;
  return { strain, speed, doubleChance };
}
/** A separate saved stream avoids adding bonus rolls to weather/illness/event RNG. */
export function rollDouble(state: MilestoneState, chance: number) {
  if (chance <= 0) return false;
  let x = state.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = (x >>> 0) || 0x9e3779b9;
  return state.rng / 4294967296 < chance;
}
