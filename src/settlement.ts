import { World, enableComfortMilestones } from './sim/world';

/** Player games always use the approved rewards. Raw research fixtures remain explicitly configurable. */
export function preparePlayerSettlement(w: World): World {
  if (w.status === 'playing') enableComfortMilestones(w, 'balanced');
  return w;
}
