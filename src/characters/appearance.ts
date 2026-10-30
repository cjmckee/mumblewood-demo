import type { Colonist } from '../sim/world';

export type Identity = Pick<Colonist, 'id' | 'name' | 'shirt' | 'skin'>;
const HAIR = [0x30271f, 0x62402b, 0xa65b32, 0xc79b55, 0x9a9488, 0x242b31, 0x704039, 0xd4c4a0];

/** Derived only from saved identity. Never advances the simulation's RNG or changes saves. */
export function appearance(c: Identity) {
  let seed = 2166136261;
  for (const ch of `${c.id}/${c.name}/${c.shirt}/${c.skin}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const signature = seed.toString(16);
  const pick = (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
  return {
    signature, hair: pick(8), hairColor: HAIR[pick(HAIR.length)], face: pick(4),
    glasses: pick(5) === 0, beard: pick(5) === 0, freckles: pick(3) === 0,
    brow: pick(3), nose: pick(3), mouth: pick(3), accessory: pick(4), backdrop: pick(6),
  };
}

export const colorHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
export function tint(n: number, amount: number) {
  const ch = (s: number) => Math.min(255, Math.max(0, Math.round(((n >> s) & 255) * amount)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
