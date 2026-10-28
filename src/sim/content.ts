// All game content lives here as plain data. The sim reads it; nothing here knows about rendering.

export type ResourceId = 'wood' | 'berries' | 'fish' | 'mushrooms' | 'apples' | 'grain' | 'honey' | 'clay' | 'reeds' | 'herbs' | 'flour' | 'stew' | 'pie' | 'smokedFish' | 'bread' | 'skewers' | 'poultice' | 'tonic' | 'tea' | 'planks' | 'bricks' | 'wicker' | 'ale' | 'cider' | 'mead';
/** raw: edible as is; ingredient: needs processing (grain, honey); luxury: drinks; remedy: used by the clinic */
export const RESOURCES: { id: ResourceId; name: string; kind: 'raw' | 'ingredient' | 'meal' | 'material' | 'luxury' | 'remedy' }[] = [
  { id: 'wood', name: 'Wood', kind: 'material' },
  { id: 'planks', name: 'Planks', kind: 'material' },
  { id: 'bricks', name: 'Bricks', kind: 'material' },
  { id: 'wicker', name: 'Wicker', kind: 'material' },
  { id: 'berries', name: 'Berries', kind: 'raw' },
  { id: 'fish', name: 'Fish', kind: 'raw' },
  { id: 'mushrooms', name: 'Mushrooms', kind: 'raw' },
  { id: 'apples', name: 'Apples', kind: 'raw' },
  { id: 'grain', name: 'Grain', kind: 'ingredient' },
  { id: 'honey', name: 'Honey', kind: 'ingredient' },
  { id: 'clay', name: 'Clay', kind: 'ingredient' },
  { id: 'reeds', name: 'Reeds', kind: 'ingredient' },
  { id: 'herbs', name: 'Herbs', kind: 'ingredient' },
  { id: 'flour', name: 'Flour', kind: 'ingredient' },
  { id: 'stew', name: 'Stew', kind: 'meal' },
  { id: 'pie', name: 'Pie', kind: 'meal' },
  { id: 'smokedFish', name: 'Smoked fish', kind: 'meal' },
  { id: 'bread', name: 'Bread', kind: 'meal' },
  { id: 'skewers', name: 'Skewers', kind: 'meal' },
  { id: 'ale', name: 'Ale', kind: 'luxury' },
  { id: 'cider', name: 'Cider', kind: 'luxury' },
  { id: 'mead', name: 'Mead', kind: 'luxury' },
  { id: 'tea', name: 'Herb tea', kind: 'luxury' },
  { id: 'poultice', name: 'Poultice', kind: 'remedy' },
  { id: 'tonic', name: 'Tonic', kind: 'remedy' },
];
export const RAW_FOODS: ResourceId[] = ['berries', 'fish', 'mushrooms', 'apples'];
export const MEALS: ResourceId[] = ['pie', 'skewers', 'smokedFish', 'bread', 'stew'];
/**
 * What the caravan charges for one of each good, in gold. It pays back a share of that when it buys (SELL_SHARE),
 * more at the autumn fair: raw goods are cheap, and the more work a good holds the more it's worth.
 */
export const PRICE: Record<ResourceId, number> = {
  wood: 2, berries: 2, fish: 2, mushrooms: 2, apples: 2, grain: 2, clay: 2, reeds: 2, herbs: 2, honey: 4, flour: 4,
  planks: 5, bricks: 5, wicker: 4, stew: 5, smokedFish: 5, bread: 6, skewers: 6, pie: 7,
  ale: 7, cider: 7, tea: 6, mead: 9, poultice: 10, tonic: 14,
};
/**
 * The traders who drive the caravan. Each carries a few of the goods they deal in (never all of them, never much), now
 * and then a blueprint from their trade, and pays the fair rate for the goods they want. Who comes next is known a few
 * days ahead, so the caravan is something to plan around rather than a shop that always has the next thing needed.
 */
export interface TraderDef { id: string; name: string; who: string; sells: ResourceId[]; blueprints: string[]; wants: ResourceId[]; markup: number }
export const TRADERS: TraderDef[] = [
  { id: 'timber', name: 'the timber merchant', who: 'A broad woman with a broader axe, and a wagon that is mostly planks.', sells: ['wood', 'planks', 'bricks', 'wicker', 'clay', 'reeds'], blueprints: ['sawmill', 'kiln', 'carpenter', 'claypit'], wants: ['stew', 'bread', 'smokedFish', 'ale'], markup: 1.1 },
  { id: 'vintner', name: 'the vintner', who: 'He tastes everything twice "for quality" and hums between sips.', sells: ['ale', 'cider', 'mead', 'tea', 'grain', 'apples', 'honey'], blueprints: ['brewery', 'ciderpress', 'apiary', 'orchard', 'tavern'], wants: ['apples', 'grain', 'honey', 'berries'], markup: 1.15 },
  { id: 'grocer', name: 'the fishwife', who: 'Loud, cheerful, and smells powerfully of yesterday’s catch.', sells: ['fish', 'smokedFish', 'berries', 'mushrooms', 'apples', 'stew'], blueprints: ['dock', 'smokehouse', 'cellar'], wants: ['wood', 'reeds', 'herbs'], markup: 1.1 },
  { id: 'baker', name: 'the baker’s cart', who: 'Two flour-dusted siblings who finish each other’s sentences, badly.', sells: ['flour', 'bread', 'pie', 'grain', 'berries', 'honey'], blueprints: ['mill', 'bakery', 'pieoven', 'field'], wants: ['wood', 'apples', 'berries'], markup: 1.1 },
  { id: 'herbalist', name: 'the herbalist', who: 'She talks to her jars. Some of them, she says, talk back.', sells: ['herbs', 'poultice', 'tonic', 'tea', 'honey'], blueprints: ['apothecary', 'herbgarden', 'apiary'], wants: ['honey', 'herbs', 'mushrooms'], markup: 1.15 },
  { id: 'pedlar', name: 'a pedlar', who: 'He sells a bit of everything and none of it is quite what you wanted.', sells: [], blueprints: [], wants: [], markup: 1.25 },
];
export const TRADER_BY_ID: Record<string, TraderDef> = Object.fromEntries(TRADERS.map(t => [t.id, t]));
/** mood from eating each meal, before tastes and traits */
export const MEAL_MOOD: Partial<Record<ResourceId, number>> = { pie: 8, skewers: 7, smokedFish: 6, bread: 6, stew: 5 };

export type JobKind = 'chopping' | 'foraging' | 'fishing' | 'cooking' | 'crafting' | 'brewing' | 'serving' | 'medicine' | 'studying';
export const JOB_NAMES: Record<JobKind, string> = {
  chopping: 'chopping wood', foraging: 'foraging', fishing: 'fishing', cooking: 'cooking',
  crafting: 'carpentry', brewing: 'brewing', serving: 'tavern work', medicine: 'doctoring', studying: 'studying',
};
/** short labels for skill bars */
export const SKILL_NAMES: Record<JobKind, string> = {
  chopping: 'Chopping', foraging: 'Foraging', fishing: 'Fishing', cooking: 'Cooking',
  crafting: 'Carpentry', brewing: 'Brewing', serving: 'Serving', medicine: 'Medicine', studying: 'Studying',
};
export const JOB_KINDS = Object.keys(JOB_NAMES) as JobKind[];

/** Groups of goods a recipe, need or charter can ask for: "any drink", "any meal". */
export type Category = 'rawFood' | 'meal' | 'drink' | 'fine' | 'remedy';
export const CATEGORIES: Record<Category, { name: string; members: ResourceId[] }> = {
  rawFood: { name: 'raw food', members: RAW_FOODS },
  meal: { name: 'meals', members: MEALS },
  drink: { name: 'drinks', members: ['ale', 'cider', 'mead', 'tea'] },
  fine: { name: 'fine materials', members: ['planks', 'bricks', 'wicker'] },
  remedy: { name: 'remedies', members: ['tonic', 'poultice'] },
};
/** what a recipe input names: one good, or any good in a category */
export type InputKey = ResourceId | Category;
export const isCategory = (k: string): k is Category => k in CATEGORIES;
export const membersOf = (k: InputKey): ResourceId[] => (isCategory(k) ? CATEGORIES[k].members : [k]);
export const inputName = (k: InputKey) => (isCategory(k) ? CATEGORIES[k].name : RESOURCES.find(r => r.id === k)!.name.toLowerCase());

/** output units per worker-hour at work speed 1, for a ★★★ recipe */
export const BASE_RATE: Record<ResourceId, number> = {
  wood: 1.6, berries: 1.3, fish: 1.5, mushrooms: 1.5, apples: 1.4, grain: 1.6, honey: 1.0, clay: 1.5, reeds: 1.4, herbs: 1.3, flour: 1.4,
  stew: 1.2, pie: 0.9, smokedFish: 1.2, bread: 1.1, skewers: 1.0, poultice: 0.8, tonic: 0.6, tea: 0.9, planks: 1.0, bricks: 0.9, wicker: 1.0, ale: 0.8, cider: 0.9, mead: 0.7,
};
/**
 * How good a building is at a recipe. Stars set speed (★★★ full, ★★ 0.8×, ★ 0.6×); each recipe also states its own
 * inputs, and lower-star recipes are written to need more of them (about 1.25× for ★★ and 1.5× for ★ against the ★★★ way).
 * Cooking stretches food: a meal takes less food than it fills (a stew is 0.9 raw and fills from hungry to full, where
 * eating raw fills less and tastes worse), so a cook earns their place.
 */
export type Stars = 1 | 2 | 3;
export const STAR_MULT: Record<Stars, number> = { 1: 0.6, 2: 0.8, 3: 1 };

export interface Recipe {
  /** inputs consumed per unit of output; a category means any good in it */
  inputs: Partial<Record<InputKey, number>>;
  output: ResourceId;
  stars: Stars;
}
/** output units per worker-hour at work speed 1 */
export const recipeRate = (r: Recipe) => BASE_RATE[r.output] * STAR_MULT[r.stars];
export const stars = (n: Stars) => '★'.repeat(n) + '☆'.repeat(3 - n);

export interface BuildingDef {
  id: string;
  name: string;
  blurb: string;
  /** materials to build it; a category ("fine") takes any mix of its goods */
  cost: Partial<Record<InputKey, number>>;
  /** footprint in tiles */
  w: number; h: number;
  slots: number;
  job?: JobKind;
  /** what the workers here can make; each can be switched on or off per building */
  recipes?: Recipe[];
  beds?: number;
  bedQuality?: 'rough' | 'basic' | 'cozy';
  /** units of goods this building can hold */
  storage?: number;
  /** stops raw food and meals spoiling */
  keepsFresh?: boolean;
  /** dining seats */
  seats?: number;
  /** colonists can walk across it (open stockpile) */
  walkable?: boolean;
  /** what has to be nearby for full output */
  needs?: 'trees' | 'bushes' | 'water' | 'apples' | 'flowers' | 'soil' | 'clay';
  /** patient beds, for a clinic */
  patients?: number;
  /** a small decoration with no door */
  decor?: boolean;
  /** how much it brightens the tiles around it */
  beauty?: number;
  /** colours for the vector renderer */
  wall: number; roof: number;
  height: number;
  draftable?: boolean;
  /** built in stages, each with its own materials and work; replaces `cost` once the first stage is done */
  stages?: { label: string; cost: Partial<Record<InputKey, number>>; work: number }[];
  /** only colonists at or above this mood will haul for or build it */
  moodGate?: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hearth', name: 'Hearth', blurb: 'Where everyone gathers in the evening to gossip. Burns wood at night.', cost: {}, w: 2, h: 2, slots: 0, wall: 0x6b5a4a, roof: 0xe07a2e, height: 0.3 },
  { id: 'stockpile', name: 'Stockpile', blurb: 'An open patch of ground for goods. Holds 150. Food left out here spoils.', cost: {}, w: 2, h: 2, slots: 0, storage: 150, walkable: true, wall: 0x8a7a5a, roof: 0x8a7a5a, height: 0 },
  { id: 'leanto', name: 'Shack', blurb: 'Sleeps 2. Drafty, but it counts as a roof.', cost: { wood: 8 }, w: 1, h: 1, slots: 0, beds: 2, bedQuality: 'basic', wall: 0x8a6e4f, roof: 0x7d8f55, height: 0.6 },
  { id: 'woodcutter', name: 'Woodcutter', blurb: 'Fells trees. Works best with lots of trees close by.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'chopping', needs: 'trees', recipes: [{ inputs: {}, output: 'wood', stars: 3 }], wall: 0x7a5a3c, roof: 0x5c7a3e, height: 0.7 },
  { id: 'forager', name: 'Forager hut', blurb: 'Picks berries. Works best right next to berry bushes.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'foraging', needs: 'bushes', recipes: [{ inputs: {}, output: 'berries', stars: 3 }, { inputs: {}, output: 'herbs', stars: 1 }], wall: 0x8c6b4a, roof: 0xa0465a, height: 0.7 },
  { id: 'dining', name: 'Dining hall', blurb: 'Tables and benches for 6. Eating here beats eating in the dirt, as long as someone keeps it clean.', cost: { wood: 20 }, w: 2, h: 2, slots: 0, seats: 6, wall: 0x9a7a58, roof: 0x8a4a3a, height: 0.9 },
  { id: 'storehouse', name: 'Storehouse', blurb: 'Holds 250 goods under a roof. Food stored here doesn\u2019t spoil.', cost: { wood: 25 }, w: 2, h: 2, slots: 0, storage: 250, keepsFresh: true, wall: 0x7a6a58, roof: 0x5a6a7a, height: 1.0 },

  { id: 'clinic', name: 'Clinic', blurb: 'Two cots and a doctor. The sick and injured recover here much faster, faster still with a skilled doctor and remedies in storage.', cost: { wood: 15 }, w: 2, h: 1, slots: 1, job: 'medicine', patients: 2, wall: 0xd8d0c0, roof: 0x9a3a3a, height: 0.8 },

  { id: 'flowerbed', name: 'Flower bed', blurb: 'Beauty 3. Somebody planted petunias in a wheelbarrow.', cost: { wood: 2 }, w: 1, h: 1, slots: 0, decor: true, beauty: 3, wall: 0x6b4f33, roof: 0xd66a9a, height: 0 },
  { id: 'lantern', name: 'Lantern post', blurb: 'Beauty 2. Glows at night, which moths appreciate.', cost: { wood: 4 }, w: 1, h: 1, slots: 0, decor: true, beauty: 2, wall: 0x4a3a2a, roof: 0xf2c46a, height: 0 },
  { id: 'bench', name: 'Bench', blurb: 'Beauty 2. A good place to sit and judge passers-by.', cost: { fine: 3 }, w: 1, h: 1, slots: 0, decor: true, beauty: 2, wall: 0x8a6038, roof: 0x8a6038, height: 0 },
  { id: 'statue', name: 'Statue of Saint Pomfrey', blurb: 'Beauty 7. He looks mildly disappointed, as in life.', cost: { fine: 12 }, w: 1, h: 1, slots: 0, decor: true, beauty: 7, wall: 0x9a9a92, roof: 0xb8b8b0, height: 0 },

  { id: 'dock', name: 'Fishing dock', blurb: 'Fish, plentiful and mildly judgmental. Can cut reeds instead, slowly. Must touch water.', cost: { wood: 15 }, w: 1, h: 2, slots: 2, job: 'fishing', needs: 'water', recipes: [{ inputs: {}, output: 'fish', stars: 3 }, { inputs: {}, output: 'reeds', stars: 1 }], wall: 0x6d5844, roof: 0x3d7b9a, height: 0.6, draftable: true },
  { id: 'cellar', name: 'Mushroom cellar', blurb: 'Dark, damp, productive. Like a bard.', cost: { wood: 12, fine: 5 }, w: 1, h: 1, slots: 2, job: 'foraging', recipes: [{ inputs: {}, output: 'mushrooms', stars: 3 }], wall: 0x5d5448, roof: 0x8d7aa8, height: 0.5, draftable: true },
  { id: 'kitchen', name: 'Stew kitchen', blurb: 'Turns any raw food into stew. Can smoke fish or bake bread, badly. Someone has to carry the ingredients in.', cost: { wood: 18 }, w: 2, h: 1, slots: 2, job: 'cooking', recipes: [{ inputs: { rawFood: 0.9 }, output: 'stew', stars: 3 }, { inputs: { fish: 1.1 }, output: 'smokedFish', stars: 1 }, { inputs: { flour: 0.9 }, output: 'bread', stars: 1 }], wall: 0x8a6448, roof: 0xc4703a, height: 0.8 },
  { id: 'pieoven', name: 'Pie oven', blurb: 'Berries plus wood make pie. Pie is the best thing that has ever happened.', cost: { wood: 12, fine: 8 }, w: 1, h: 1, slots: 2, job: 'cooking', recipes: [{ inputs: { berries: 1.2, wood: 0.5 }, output: 'pie', stars: 3 }, { inputs: { flour: 0.75 }, output: 'bread', stars: 2 }], wall: 0x9b7452, roof: 0xd6a33c, height: 0.8, draftable: true },
  { id: 'smokehouse', name: 'Smokehouse', blurb: 'Fish goes in, better fish comes out. Also grills mushroom-and-herb skewers.', cost: { wood: 15 }, w: 1, h: 1, slots: 2, job: 'cooking', recipes: [{ inputs: { fish: 0.7 }, output: 'smokedFish', stars: 3 }, { inputs: { mushrooms: 0.6, herbs: 0.3 }, output: 'skewers', stars: 2 }], wall: 0x5f4d3f, roof: 0x8a8a8a, height: 0.9, draftable: true },
  { id: 'mill', name: 'Mill', blurb: 'Grinds grain into flour, the first half of a loaf.', cost: { wood: 16, fine: 4 }, w: 2, h: 1, slots: 2, job: 'crafting', recipes: [{ inputs: { grain: 1.5 }, output: 'flour', stars: 3 }], wall: 0xa08a68, roof: 0x7a6a4a, height: 1.1, draftable: true },
  { id: 'bakery', name: 'Bakery', blurb: 'Bread from flour. Can bake pie, and grind its own flour if there\u2019s no mill.', cost: { wood: 15, fine: 6 }, w: 2, h: 1, slots: 2, job: 'cooking', recipes: [{ inputs: { flour: 0.6 }, output: 'bread', stars: 3 }, { inputs: { berries: 1.5, wood: 0.6 }, output: 'pie', stars: 2 }, { inputs: { grain: 2 }, output: 'flour', stars: 1 }], wall: 0xb08a5a, roof: 0xc0603a, height: 0.9, draftable: true },
  { id: 'herbgarden', name: 'Herb garden', blurb: 'Neat rows of herbs, and a few berries in the corner. Grows anywhere.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'foraging', recipes: [{ inputs: {}, output: 'herbs', stars: 3 }, { inputs: {}, output: 'berries', stars: 1 }], wall: 0x7a8a4a, roof: 0x5a8a3a, height: 0.4, draftable: true },
  { id: 'apothecary', name: 'Apothecary', blurb: 'Poultices and tonics for the clinic, and herb tea for anyone. The doctor uses remedies from storage.', cost: { wood: 12, fine: 4 }, w: 1, h: 1, slots: 1, job: 'medicine', recipes: [{ inputs: { herbs: 2 }, output: 'poultice', stars: 3 }, { inputs: { herbs: 1.5 }, output: 'tea', stars: 2 }, { inputs: { honey: 1, herbs: 1.25 }, output: 'tonic', stars: 2 }], wall: 0xc8c0a8, roof: 0x4a7a5a, height: 0.9, draftable: true },
  { id: 'sawmill', name: 'Sawmill', blurb: 'Wood becomes planks. Planks become nicer buildings.', cost: { wood: 20 }, w: 2, h: 1, slots: 2, job: 'crafting', recipes: [{ inputs: { wood: 2 }, output: 'planks', stars: 3 }], wall: 0x7c6148, roof: 0xb08a5a, height: 0.8, draftable: true },
  { id: 'kiln', name: 'Brick kiln', blurb: 'Fires clay into bricks, burning a little wood. Bricks build anything planks do.', cost: { wood: 15 }, w: 1, h: 1, slots: 2, job: 'crafting', recipes: [{ inputs: { clay: 2, wood: 0.5 }, output: 'bricks', stars: 3 }], wall: 0x9a5a40, roof: 0x5a4a44, height: 0.9, draftable: true },
  { id: 'carpenter', name: 'Carpenter\u2019s shed', blurb: 'Weaves reeds into wicker, or saws planks the slow way.', cost: { wood: 14 }, w: 1, h: 1, slots: 2, job: 'crafting', recipes: [{ inputs: { reeds: 2 }, output: 'wicker', stars: 3 }, { inputs: { wood: 2.5 }, output: 'planks', stars: 2 }], wall: 0x8a6c48, roof: 0xa08a50, height: 0.8, draftable: true },
  { id: 'claypit', name: 'Clay pit', blurb: 'Digs clay out of the bank by the water. Has to sit by a clay bank.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'foraging', needs: 'clay', recipes: [{ inputs: {}, output: 'clay', stars: 3 }], wall: 0x8a6040, roof: 0x6a5040, height: 0.5, draftable: true },
  { id: 'brewery', name: 'Brewery', blurb: 'Best with grain. Can make mead, and berry ale if it must. Ale becomes poor decisions.', cost: { wood: 15, fine: 8 }, w: 2, h: 1, slots: 2, job: 'brewing', recipes: [{ inputs: { grain: 1.5 }, output: 'ale', stars: 3 }, { inputs: { honey: 2.5 }, output: 'mead', stars: 2 }, { inputs: { berries: 3 }, output: 'ale', stars: 1 }], wall: 0x7a5640, roof: 0x9c5b2f, height: 0.9, draftable: true },
  { id: 'ciderpress', name: 'Cider press', blurb: 'Squashes apples into cider. Also does a decent berry ale, and mead in a pinch.', cost: { wood: 18 }, w: 1, h: 1, slots: 2, job: 'brewing', recipes: [{ inputs: { apples: 2 }, output: 'cider', stars: 3 }, { inputs: { berries: 2.5 }, output: 'ale', stars: 2 }, { inputs: { honey: 3 }, output: 'mead', stars: 1 }], wall: 0x8a6a3c, roof: 0x8aa040, height: 0.8, draftable: true },
  { id: 'orchard', name: 'Orchard hut', blurb: 'Picks apples. Needs an apple grove close by. Apples are food, or cider.', cost: { wood: 10 }, w: 1, h: 1, slots: 2, job: 'foraging', needs: 'apples', recipes: [{ inputs: {}, output: 'apples', stars: 3 }], wall: 0x8c6b4a, roof: 0xb8452f, height: 0.7, draftable: true },
  { id: 'apiary', name: 'Apiary', blurb: 'Bees make honey from wildflowers. Flower beds nearby count as extra meadow.', cost: { wood: 12 }, w: 1, h: 1, slots: 2, job: 'foraging', needs: 'flowers', recipes: [{ inputs: {}, output: 'honey', stars: 3 }], wall: 0xc8a050, roof: 0x7a5a2a, height: 0.6, draftable: true },
  { id: 'field', name: 'Grain field', blurb: 'Rows of barley. Has to sit on good soil, and the better the soil the better the harvest.', cost: { wood: 10 }, w: 2, h: 2, slots: 2, job: 'foraging', needs: 'soil', recipes: [{ inputs: {}, output: 'grain', stars: 3 }], wall: 0x8a7a40, roof: 0xd8c060, height: 0.15, draftable: true },
  { id: 'tavern', name: 'Tavern', blurb: 'Evenings here use drinks (ale, cider or mead) and give big fun. Gossip travels twice as fast.', cost: { wood: 20, fine: 12 }, w: 2, h: 2, slots: 1, job: 'serving', wall: 0x8e5f3c, roof: 0x7a2f2f, height: 1.1, draftable: true },
  { id: 'cottage', name: 'Cottage', blurb: 'Sleeps 2, cozily. Waking up here is a +5 mood.', cost: { wood: 6, fine: 10 }, w: 1, h: 1, slots: 0, beds: 2, bedQuality: 'cozy', wall: 0xc7a983, roof: 0x4f6f9a, height: 0.9, draftable: true },
  { id: 'bathhouse', name: 'Bathhouse', blurb: 'Uses wood. Everyone feels fresher, and grumblers grumble less.', cost: { wood: 15, fine: 8 }, w: 2, h: 1, slots: 0, wall: 0xb8b0a0, roof: 0x4f8f8a, height: 0.7, draftable: true },
  { id: 'stage', name: "Bard's stage", blurb: 'Evening music at the hearth. Fun builds faster for everyone. Beauty 3.', cost: { wood: 12, fine: 5 }, w: 1, h: 1, slots: 0, beauty: 3, wall: 0x8a5f7a, roof: 0xc25c8a, height: 0.4, draftable: true },
  // research and the finale (never drafted)
  { id: 'desk', name: 'Research desk', blurb: 'A wobbly table, a candle and a stack of borrowed books. A scholar here works out how to build the things a colony takes for granted.', cost: { wood: 8 }, w: 1, h: 1, slots: 1, job: 'studying', wall: 0x7a5a3a, roof: 0x5a6f8a, height: 0.45 },
  { id: 'hall', name: 'The Crown\u2019s Hall', blurb: 'The building that makes Mumblewood a town. Built in three stages. Nobody grumpy lays a stone for the Crown: only colonists at mood 55 or more will haul for it or build it.', cost: { fine: 60 }, w: 3, h: 3, slots: 0, beauty: 6, moodGate: 55,
    stages: [{ label: 'Foundations and walls', cost: { fine: 60 }, work: 24 }, { label: 'Feeding the masons', cost: { meal: 40 }, work: 16 }, { label: 'Topping out', cost: { drink: 25 }, work: 10 }],
    wall: 0xc8b48a, roof: 0x8a3a3a, height: 1.4 },
];
/** builder-hours of work to finish a building */
export const buildWork = (d: BuildingDef) => (d.decor ? 1.5 : Math.max(3, d.w * d.h * 2.5));
export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

/** Resource sites a map can have. Every map has trees, berries and water; each also rolls two of these four. */
export type SiteId = 'grove' | 'meadow' | 'soil' | 'clay';
export const SITES: { id: SiteId; name: string; blurb: string; feeds: string }[] = [
  { id: 'grove', name: 'an apple grove', blurb: 'Apple trees. Can\u2019t be built on.', feeds: 'orchard' },
  { id: 'meadow', name: 'a wildflower meadow', blurb: 'Bees love it. Can\u2019t be built on.', feeds: 'apiary' },
  { id: 'soil', name: 'good soil', blurb: 'Dark, crumbly earth. You can build on it, but it\u2019s wasted under anything but a field.', feeds: 'field' },
  { id: 'clay', name: 'a clay bank', blurb: 'Red clay along the water\u2019s edge. Can\u2019t be built on.', feeds: 'claypit' },
];

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  /** traits in the same group are mutually exclusive */
  group?: string;
}
export const TRAITS: TraitDef[] = [
  { id: 'grumbler', name: 'Grumbler', desc: 'Complains constantly. Coworkers −3 mood.', group: 'temper' },
  { id: 'sunny', name: 'Sunny', desc: '+5 mood. Coworkers +2 mood.', group: 'temper' },
  { id: 'glutton', name: 'Glutton', desc: 'Gets hungry 60% faster. Meals are +4 better.' },
  { id: 'picky', name: 'Picky eater', desc: 'Raw food is a personal insult: −8 instead of −3.' },
  { id: 'romantic', name: 'Hopeless romantic', desc: 'Falls in love 3× as easily. Breakups hit twice as hard.' },
  { id: 'loner', name: 'Loner', desc: '−4 when sharing a workplace. Doesn’t need evening company.', group: 'social' },
  { id: 'butterfly', name: 'Social butterfly', desc: 'Makes friends fast. −6 without an evening of company.', group: 'social' },
  { id: 'lazy', name: 'Lazy', desc: 'Works at 70% speed. +3 mood, honestly.', group: 'work' },
  { id: 'diligent', name: 'Diligent', desc: 'Works at 130% speed.', group: 'work' },
  { id: 'drama', name: 'Drama magnet', desc: 'Every opinion change about them is doubled.' },
  { id: 'hummer', name: 'Hums loudly', desc: 'Everyone nearby slowly likes them less.' },
  { id: 'stoic', name: 'Stoic', desc: 'Frontier strain affects them half as much.' },
  { id: 'vain', name: 'Vain', desc: '−5 unless sleeping in a cottage.' },
  { id: 'tippler', name: 'Tippler', desc: 'A drink gives +4 extra. −4 when there\u2019s nothing to drink.' },
];
export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map(t => [t.id, t]));

export interface PerkDef { id: string; name: string; desc: string }
export const PERKS: PerkDef[] = [
  { id: 'communalPot', name: 'Communal pot', desc: 'Meals give +5 more mood. Raw food is −3 worse.' },
  { id: 'ironWill', name: 'Iron constitution', desc: 'Frontier strain grows 35% slower.' },
  { id: 'overtime', name: 'Overtime bell', desc: 'Everyone works 25% faster, and is −3 mood about it.' },
  { id: 'saintsDay', name: "Saint Pomfrey's blessing", desc: '+6 mood for everyone, forever.' },
  { id: 'warmHearth', name: 'Everburning hearth', desc: 'The hearth burns no wood at all, and evenings there are +2.' },
  { id: 'hearthSongs', name: 'Hearth songs', desc: 'Strain eases by 1 every evening the tavern is open and staffed.' },
  { id: 'postRider', name: 'A post rider', desc: 'Charters and festivals ease 20% more strain.' },
  { id: 'homesteaders', name: 'Homesteaders', desc: 'Comfort counts for 30% more against strain.' },
  { id: 'hearthkeepers', name: 'Hearthkeepers', desc: 'Homes burn half as much wood in winter.' },
  { id: 'lumberGuild', name: 'Lumber guild', desc: 'Woodcutters bring in 50% more wood.' },
  { id: 'rentCollector', name: 'Rent collector', desc: 'Rent is doubled. Everyone is −2 mood about it, forever.' },
  { id: 'pilgrimsRoad', name: 'Pilgrims’ road', desc: 'The caravan comes in winter too.' },
  { id: 'rootCellars', name: 'Root cellars', desc: 'Nothing spoils in winter.' },
  { id: 'merchantsFavour', name: 'Merchant’s favour', desc: 'The caravan sells for 20% less and pays 20% more.' },
  { id: 'openRoad', name: 'Open road', desc: 'Settlers ask to join every day, all year. Strain grows 10% faster.' },
  { id: 'feastDays', name: 'Feast days', desc: 'Festivals ease 50% more strain.' },
  // guilds: a big boost to one chain, worth it only if the colony runs on that chain
  { id: 'brewersGuild', name: 'Brewers\u2019 guild', desc: 'Breweries and cider presses work 75% faster.' },
  { id: 'fishingRights', name: 'Fishing rights', desc: 'Fishing docks and smokehouses work 75% faster.' },
  { id: 'masonsLodge', name: 'Masons\u2019 lodge', desc: 'Sawmills, carpenters, kilns and clay pits work 75% faster.' },
  { id: 'bakersRow', name: 'Bakers\u2019 row', desc: 'Grain fields, mills, bakeries and pie ovens work 75% faster.' },
  // trade-offs
  { id: 'crownsFavour', name: 'The Crown\u2019s favour', desc: '60 gold now, and charter stipends are doubled. Strain grows 15% faster.' },
  { id: 'barnRaising', name: 'Barn raising', desc: 'Everything is built twice as fast. Everyone is −2 mood from the hammering.' },
];
/** what each guild speeds up */
export const GUILD_BOOST: Record<string, string[]> = {
  brewersGuild: ['brewery', 'ciderpress'], fishingRights: ['dock', 'smokehouse'], masonsLodge: ['sawmill', 'carpenter', 'kiln', 'claypit'], bakersRow: ['field', 'mill', 'bakery', 'pieoven'],
};
export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map(p => [p.id, p]));

export type CharterMetric =
  | { kind: 'stock'; resources: ResourceId[]; amount: number }
  | { kind: 'population'; amount: number }
  | { kind: 'avgMood'; amount: number; hours: number }
  | { kind: 'allTable'; hours: number; cooked?: boolean }
  | { kind: 'variety'; category: Category; kinds: number; each: number }
  // several conditions at once, and the finales
  | { kind: 'all'; parts: CharterMetric[] }
  | { kind: 'built'; def: string; amount: number }
  | { kind: 'everyoneBed' }
  | { kind: 'healthy'; hours: number }
  | { kind: 'monument'; def: string }
  | { kind: 'longTable'; pop: number };

export interface CharterDef {
  id: string; tier: 1 | 2 | 3; name: string; desc: string; metric: CharterMetric;
  /** blueprints that help, for the draft's charter guarantee */
  helpers?: string[];
  /** only offered on maps with these sites */
  sites?: SiteId[];
}

export interface EventOption { label: string; detail: string; effect: string }
/**
 * How the storyteller treats an event. Threat builds up every day (see scenario.ts, story); minor events cost little or
 * nothing and come often, moderate and major ones wait until the budget can pay for them, and a major one buys a quiet
 * spell after it. Seasonal events only happen in their seasons.
 */
export type Tier = 'minor' | 'moderate' | 'major';
export interface StoryTag { tier: Tier; cost: number; seasons?: ('spring' | 'summer' | 'autumn' | 'winter')[] }
/** requires: 'couple' needs a couple; 'strain' needs strain of 6 or more (the event is about the frontier wearing on people) */
export interface EventDef extends StoryTag { id: string; title: string; text: string; options: EventOption[]; requires?: 'couple' | 'strain' }
export const EVENTS: EventDef[] = [
  { id: 'bard', tier: 'minor', cost: 0, title: 'A travelling bard', text: 'A bard offers to play "The Ballad of Your Colony" for a modest fee. He has not yet written it.',
    options: [
      { label: 'Pay 6 drinks', detail: 'Everyone +6 mood for a day, and strain eases by 8%.', effect: 'bardPlay' },
      { label: 'Shoo him away', detail: 'Nothing happens. He writes a mean song anyway.', effect: 'none' },
    ] },
  { id: 'wedding', tier: 'minor', cost: 0, title: 'A wedding is proposed', text: 'A couple wants to make it official. Everyone is invited, whether they like it or not.', requires: 'couple',
    options: [
      { label: 'Host it (8 meals, 5 drinks)', detail: 'Everyone +7 mood for 2 days, and strain eases by 10%.', effect: 'wedding' },
      { label: 'Elope quietly', detail: 'The couple is −8 mood for 2 days.', effect: 'elope' },
    ] },
  { id: 'frogs', tier: 'minor', cost: 2, title: 'It is raining frogs', text: 'Small, confused frogs. Some colonists find it delightful. Others are holding umbrellas very tightly.',
    options: [
      { label: 'Collect them', detail: '+15 fish (close enough). Grumblers −5 for a day.', effect: 'frogFish' },
      { label: 'Stay indoors', detail: 'Everyone −2 mood for a day.', effect: 'frogHide' },
    ] },
  { id: 'outhouse', tier: 'minor', cost: 3, title: 'The outhouse is haunted', text: 'Witnesses describe moaning, rattling, and "a judgmental presence".',
    options: [
      { label: 'Rebuild it (10 planks)', detail: 'Lose 10 planks.', effect: 'outhouseFix' },
      { label: 'Live with the ghost', detail: 'Everyone −3 mood for 3 days.', effect: 'ghost' },
    ] },
  { id: 'letters', tier: 'minor', cost: 0, title: 'Letters from home', text: 'A courier staggers out of the woods with a sack of letters, most of them from aunts. He would like feeding before the walk back.', requires: 'strain',
    options: [
      { label: 'Feed him (15 food)', detail: 'Strain eases by 10%, or 15% if nobody is sulking. Everyone +3 mood for a day.', effect: 'lettersRead' },
      { label: 'Send him on his way', detail: 'The letters go back. Everyone −2 mood for a day.', effect: 'lettersLost' },
    ] },
  { id: 'homesick', tier: 'moderate', cost: 6, title: 'A cold wind from the east', text: 'The wind smells like somewhere else. People are talking about home, and not fondly about here.', requires: 'strain',
    options: [
      { label: 'Light a bonfire (20 wood)', detail: 'Strain doesn’t rise from this, and everyone +2 mood for a day.', effect: 'bonfire' },
      { label: 'Tough it out', detail: 'Strain rises by 3.', effect: 'homesick' },
    ] },
  { id: 'moon', tier: 'minor', cost: 0, title: 'A harvest moon', text: 'The moon is enormous and orange. Someone suggests a dance. Someone else suggests the dance needs food.',
    options: [
      { label: 'Dance under it (a meal each)', detail: 'Strain eases by 10%, more if people get a meal they love. Everyone +4 mood for a day.', effect: 'moonDance' },
      { label: 'Early night', detail: 'Nothing happens. The moon is unbothered.', effect: 'none' },
    ] },
  { id: 'peddler', tier: 'minor', cost: 0, title: 'A peddler with a cart', text: 'She is selling "authentic" relics and also, more usefully, planks.',
    options: [
      { label: 'Trade 30 wood for 12 planks', detail: 'A decent deal.', effect: 'peddlerPlanks' },
      { label: 'Buy the relic (8 gold)', detail: 'Everyone +3 mood for 3 days. It is a spoon.', effect: 'relic' },
    ] },
  { id: 'purse', tier: 'minor', cost: 0, title: 'A purse in the mud', text: 'Someone found a purse on the road. It is heavy, embroidered "NOT YOURS", and smells faintly of cheese.',
    options: [
      { label: 'Keep it', detail: '+15 gold. The finder feels a bit guilty (−3 mood for 2 days).', effect: 'purseKeep' },
      { label: 'Leave it at the waystone', detail: 'Everyone +2 mood for 2 days. Honesty is its own reward, apparently.', effect: 'purseReturn' },
    ] },
  { id: 'taxman', tier: 'moderate', cost: 8, title: 'The Crown’s tax collector', text: 'A man in a very tall hat has come to count things. He has a ledger, a quill, and no sense of humour.',
    options: [
      { label: 'Pay the levy (12 gold)', detail: 'He tips the hat and leaves.', effect: 'taxPay' },
      { label: 'Hide the valuables', detail: 'He takes 20 food instead, and everyone is −3 mood for 2 days.', effect: 'taxHide' },
    ] },
  { id: 'busker', tier: 'minor', cost: 0, title: 'Buskers at the hearth', text: 'Two fiddlers and a man with a spoon are playing for coins. The spoon man is surprisingly good.',
    options: [
      { label: 'Toss them 6 gold', detail: 'Everyone +4 mood for a day, and strain eases by 5%.', effect: 'buskerPay' },
      { label: 'Applaud politely', detail: 'Nothing happens. The spoon man looks hurt.', effect: 'none' },
    ] },
  // ---- bigger trouble and the seasons' own events ----
  { id: 'tollGang', tier: 'major', cost: 25, title: 'A goblin toll gang', text: 'Six goblins with a barrier pole have set up across the road. They insist the road is theirs. One of them has a very small crown.',
    options: [
      { label: 'Pay the toll (30 gold)', detail: 'They lift the pole and wave you through, smugly.', effect: 'tollPay' },
      { label: 'Bar the gates', detail: 'They smash up a workshop before they get bored, and everyone is −3 mood for 2 days.', effect: 'tollRefuse' },
    ] },
  { id: 'inspector', tier: 'major', cost: 20, seasons: ['autumn'], title: 'The Crown\u2019s inspector', text: 'An inspector with a clipboard has come to see whether the colony is "worth the paperwork". He is hungry and corruptible, in that order.',
    options: [
      { label: 'Feed his retinue (15 meals)', detail: 'He writes something positive, probably. Strain eases by 5%.', effect: 'inspectorMeals' },
      { label: 'Slip him 25 gold', detail: 'The clipboard is put away.', effect: 'inspectorGold' },
    ] },
  { id: 'blight', tier: 'moderate', cost: 12, seasons: ['autumn'], title: 'Blight in the rows', text: 'Black spots on the leaves of the fields and the orchard. The old-timers say burn it. The young ones say it looks fine.',
    options: [
      { label: 'Burn the blighted rows', detail: 'Lose 20 grain and apples now.', effect: 'blightBurn' },
      { label: 'Hope it passes', detail: 'Fields and orchards bring in half for 5 days.', effect: 'blightWait' },
    ] },
  { id: 'deserter', tier: 'moderate', cost: 8, title: 'A deserter at the gate', text: 'A soldier who has "retired early" from the Crown\u2019s army asks to stay. There is a bounty on his head, and he is very good with a saw.',
    options: [
      { label: 'Take him in', detail: 'A skilled settler joins for free. Strain rises by 3: people talk.', effect: 'deserterTake' },
      { label: 'Turn him in', detail: '+20 gold bounty. Everyone is −2 mood for a day.', effect: 'deserterTurn' },
    ] },
  { id: 'author', tier: 'minor', cost: 0, title: 'A travelling author', text: 'A famous author is writing a book about the frontier and would like to stay a night. She asks a great many questions about the toilets.',
    options: [
      { label: 'Host her (5 meals)', detail: 'Everyone +3 mood for a day, and strain eases by 8%.', effect: 'authorHost' },
      { label: 'No room at the inn', detail: 'Nothing happens. You will not be in the book.', effect: 'none' },
    ] },
];

export const FIRST_NAMES = ['Bramwell', 'Odette', 'Tobias', 'Wren', 'Mirabel', 'Gus', 'Hester', 'Pip', 'Clement', 'Agnes', 'Barnaby', 'Fennick', 'Ottilie', 'Rufus', 'Delphine', 'Hamish', 'Prudence', 'Ignatius', 'Marigold', 'Silas', 'Tansy', 'Cuthbert', 'Elspeth', 'Lysander', 'Winnie', 'Mortimer', 'Bertha', 'Quill', 'Rosalind', 'Thaddeus', 'Nell', 'Osric', 'Juniper', 'Percival', 'Beatrix', 'Alfie'];
export const SURNAMES = ['Pottsworth', 'Mudd', 'Thistledown', 'Grubb', 'Ashby', 'Crumble', 'Fernsby', 'Kettle', 'Hobb', 'Wimble', 'Larder', 'Quigley', 'Bunt', 'Marrow', 'Pennywhistle', 'Sprocket', 'Tumble', 'Underhill', 'Gristle', 'Bramble'];
export const SHIRTS = [0xc8553d, 0x3d7b9a, 0x6a8d3a, 0xd6a33c, 0x8d5ba8, 0x2f8f7a, 0xb0466a, 0x5a6fb0, 0xa86d3a, 0x4f7f4f];
export const SKINS = [0xf1c9a5, 0xd9a27e, 0xb27b56, 0x8a5a3c, 0xf5d7b8, 0x6b4430];

/** Events that create a short job someone has to be sent to do. {a} and {b} are filled with colonist names. */
export interface JobEventDef extends Partial<StoryTag> {
  id: string; title: string; text: string;
  /** in-game hours of work */
  hours: number;
  /** hours until it goes wrong if nobody finishes it */
  deadline: number;
  /** a skill that speeds it up, if any */
  skill?: JobKind;
  /** where it happens */
  at: 'storage' | 'hearth' | 'edge' | 'clinic' | 'pair';
  reward: string; penalty: string;
  requires?: 'rivals';
}
export const JOB_EVENTS: JobEventDef[] = [
  { id: 'caravan', title: 'The caravan is here', text: 'A trader\u2019s caravan is parked by the hearth until dusk. Someone has to walk over and haggle.', hours: 0.5, deadline: 11, at: 'hearth', reward: 'Trade: buy what the charter needs, sell what you have spare, maybe a blueprint.', penalty: 'The caravan leaves without trading.' },
  { id: 'badger', tier: 'moderate', cost: 10, title: 'A badger in the stores', text: 'A badger has moved into the storage. It is eating everything and it has opinions about it.', hours: 3, deadline: 12, at: 'storage', reward: 'Chase it off and nothing is lost.', penalty: 'Lose a quarter of all food.' },
  { id: 'cat', tier: 'minor', cost: 2, title: 'The cat is up a tree', text: 'The colony cat climbed the tallest tree on the frontier and is now yowling about it.', hours: 2, deadline: 8, at: 'edge', skill: 'chopping', reward: 'Everyone +3 mood for a day.', penalty: 'Everyone −3 mood for a day, from the yowling.' },
  { id: 'feud', tier: 'minor', cost: 3, title: 'A feud is brewing', text: '{a} and {b} are not speaking, except to say very loud things about each other. Someone should mediate.', hours: 3, deadline: 16, at: 'pair', reward: 'They patch things up a bit (+25 opinion each way).', penalty: 'Both −6 mood for two days, and they like each other even less.', requires: 'rivals' },
  { id: 'bog', tier: 'minor', cost: 0, title: 'Someone is stuck in the bog', text: 'A traveller has wandered into the bog at the edge of the woods and is sinking at a dignified pace.', hours: 4, deadline: 10, at: 'edge', reward: 'They join the colony out of gratitude.', penalty: 'They get out on their own and tell everyone how rude you were (−2 mood for a day).' },
  { id: 'goblin', tier: 'moderate', cost: 6, title: 'The goblin tax collector', text: 'A goblin in a very official hat is demanding a "frontier levy" and refuses to leave. Someone should politely walk him to the edge of the woods.', hours: 2, deadline: 6, at: 'hearth', reward: 'He leaves with nothing but a stamped form.', penalty: 'He takes 20 food and graffitis every wall on the way out.' },
  { id: 'pigeons', tier: 'moderate', cost: 6, title: 'The pigeons have unionised', text: 'The pigeons are picketing the food stores. Their demands are berries. Someone needs to negotiate, loudly, with a broom.', hours: 3, deadline: 8, at: 'storage', reward: 'The pigeons disperse, grumbling.', penalty: 'They riot. Lose 40% of the berries.' },
  { id: 'flood', tier: 'major', cost: 25, seasons: ['spring'], title: 'The river is rising', text: 'The thaw has swollen the water and it is coming for the workshops. Someone needs to dig a ditch, fast.', hours: 6, deadline: 10, at: 'edge', reward: 'The water goes round.', penalty: 'A workshop is wrecked and needs rebuilding, and a fifth of the raw food is lost.' },
  { id: 'wildfire', tier: 'major', cost: 25, seasons: ['summer'], title: 'Smoke at the forest edge', text: 'A wildfire is creeping through the dry undergrowth towards the huts. A firebreak would stop it.', hours: 6, deadline: 12, at: 'edge', skill: 'chopping', reward: 'The fire stops at the break, and the felled trees are 15 wood.', penalty: 'A hut at the edge burns and needs rebuilding, and 30 wood goes up with it.' },
  { id: 'storeFire', tier: 'major', cost: 30, title: 'Fire in the stores!', text: 'Someone left a lantern in the stores. Someone else is now shouting "FIRE" in a high, clear voice.', hours: 2, deadline: 3, at: 'storage', reward: 'Only a little is lost.', penalty: 'A third of what that store holds burns.' },
  { id: 'wolves', tier: 'major', cost: 25, seasons: ['winter'], title: 'Wolves at the huts', text: 'A pack of thin, determined wolves is circling the gatherers\u2019 huts. Someone should go and make a lot of noise.', hours: 4, deadline: 8, at: 'edge', reward: 'The wolves slink off.', penalty: 'A gatherer is bitten, and the wolves take 15 raw food.' },
  { id: 'drought', tier: 'moderate', cost: 12, seasons: ['summer'], title: 'A dry spell', text: 'No rain for a week. The berries are shrivelling and the fields are dust. Someone could haul water from the river.', hours: 8, deadline: 14, at: 'edge', reward: 'The plants hang on.', penalty: 'Foragers, fields, orchards and herb gardens bring in 40% less for 4 days.' },
  { id: 'frozenWell', tier: 'moderate', cost: 10, seasons: ['winter'], title: 'The well has frozen', text: 'The well is a solid block of ice. Everyone is melting snow in pots and complaining about the taste.', hours: 3, deadline: 10, at: 'hearth', reward: 'Water flows, after a fashion.', penalty: 'Everyone is −4 mood for 2 days, and the kitchens work 25% slower.' },
  { id: 'remedy', title: 'Brew a remedy', text: 'The frontier flu is going around. Someone handy with medicine could brew a remedy.', hours: 4, deadline: 18, at: 'clinic', skill: 'medicine', reward: 'Everyone who is sick feels much better.', penalty: 'The flu runs its course.' },
];

export interface IllnessDef { id: string; name: string; start: number; /** severity change per hour while untreated and up */ worsen: number; contagious?: boolean }
export const ILLNESSES: IllnessDef[] = [
  { id: 'flu', name: 'Frontier flu', start: 22, worsen: 1.0, contagious: true },
  { id: 'tummy', name: 'Bad tummy', start: 20, worsen: 0.15 },
  { id: 'thumb', name: 'Hammered thumb', start: 18, worsen: 0.15 },
  { id: 'ankle', name: 'Sprained ankle', start: 26, worsen: 0.2 },
  { id: 'splinter', name: 'Heroic splinter', start: 16, worsen: 0.15 },
  { id: 'chill', name: 'Winter chill', start: 18, worsen: 0.35 },
  { id: 'bitten', name: 'Wolf bite', start: 28, worsen: 0.2 },
];

// ---------- Research ----------
/** A project the research desk works through. Finishing it unlocks buildings from the base set. */
/** a project either unlocks buildings (the basics) or is lore: a lasting improvement, described by `effect` */
export interface ResearchDef {
  id: string; name: string; desc: string; unlocks: string[]; cost: Partial<Record<InputKey, number>>; hours: number; effect?: string;
  /** a specialization's branch; branches open once BRANCHES_AFTER basics are learned */
  branch?: string;
  /** the project in its branch that has to be learned first */
  after?: string;
}
/** basics learned before the specialization branches open */
export const BRANCHES_AFTER = 3;
export const RESEARCH: ResearchDef[] = [
  { id: 'cookery', name: 'Cookery', desc: 'Raw berries are food, technically. A stew kitchen turns raw food into proper meals.', unlocks: ['kitchen'], cost: { wood: 10, berries: 10 }, hours: 8 },
  { id: 'messhall', name: 'Mess hall', desc: 'Tables, benches, and the radical idea of not eating in the dirt.', unlocks: ['dining'], cost: { wood: 15 }, hours: 8 },
  { id: 'physick', name: 'Physick', desc: 'A clinic with cots and a doctor. The sick mend faster, and fewer of them wander off to a city physician.', unlocks: ['clinic'], cost: { wood: 10, berries: 10 }, hours: 10 },
  { id: 'warehousing', name: 'Warehousing', desc: 'A storehouse under a roof, where food doesn\u2019t spoil.', unlocks: ['storehouse'], cost: { wood: 20 }, hours: 10 },
  { id: 'gardening', name: 'Gardening', desc: 'Flower beds and lantern posts. Prettier surroundings, happier settlers, confused moths.', unlocks: ['flowerbed', 'lantern'], cost: { wood: 5, berries: 10 }, hours: 6 },
  { id: 'masonry', name: 'Masonry', desc: 'Benches and a statue of Saint Pomfrey. Paid for in meals, because masons expect lunch.', unlocks: ['bench', 'statue'], cost: { wood: 10, meal: 5 }, hours: 10 },
  // specializations: a branch each, one project leading to the next, slow enough that a run gets through two or three
  { id: 'smoking', branch: 'Fishing', name: 'Nets and racks', desc: 'Better nets for the dock and better racks for the smoke.', effect: 'Fishing docks and smokehouses work 40% faster.', unlocks: [], cost: { wood: 20, rawFood: 15 }, hours: 64 },
  { id: 'salting', branch: 'Fishing', after: 'smoking', name: 'Salting', desc: 'Barrels, brine, and an argument about how much salt is too much.', effect: 'Smoked fish never spoils, and fresh fish keeps three times as long.', unlocks: [], cost: { wood: 25, fish: 20 }, hours: 84 },
  { id: 'rotation', branch: 'Farming', name: 'Crop rotation', desc: 'Beans one year, grain the next, and the bees get the clover.', effect: 'Grain fields, orchards and apiaries bring in 40% more.', unlocks: [], cost: { wood: 20, rawFood: 15 }, hours: 64 },
  { id: 'milling', branch: 'Farming', after: 'rotation', name: 'Milling and baking', desc: 'Finer flour, hotter ovens, fewer burnt bottoms.', effect: 'Mills, bakeries and pie ovens work 40% faster.', unlocks: [], cost: { wood: 30, rawFood: 15 }, hours: 84 },
  { id: 'malting', branch: 'Brewing', name: 'Malting', desc: 'Sprout the grain, dry it, argue about it, brew it.', effect: 'Breweries and cider presses work 40% faster.', unlocks: [], cost: { wood: 20, rawFood: 15 }, hours: 64 },
  { id: 'cellaring', branch: 'Brewing', after: 'malting', name: 'Cellaring', desc: 'Cool cellars, oak casks, and a tasting schedule that is mostly an excuse.', effect: 'A drink at the tavern gives +2 more mood, and each evening\u2019s round uses a third less.', unlocks: [], cost: { wood: 30, drink: 10 }, hours: 84 },
  { id: 'joinery', branch: 'Building', name: 'Joinery', desc: 'Dovetails, mortises, and a strong opinion about glue.', effect: 'Sawmills, carpenters, kilns and clay pits work 40% faster.', unlocks: [], cost: { wood: 35 }, hours: 64 },
  { id: 'roads', branch: 'Building', after: 'joinery', name: 'Road-building', desc: 'Packed gravel, a camber, and a ditch either side. Surprisingly exciting, if you are a surveyor.', effect: 'Paths cost no wood to lay, and walking on them is 50% faster instead of 25%.', unlocks: [], cost: { wood: 30, fine: 10 }, hours: 84 },
  { id: 'handcarts', branch: 'Building', after: 'roads', name: 'Handcarts', desc: 'Two wheels and a handle. The wheel was a good idea and everyone agrees it should catch on.', effect: 'Carrying no longer slows anyone down, and loaded haulers walk 20% faster.', unlocks: [], cost: { wood: 30, fine: 15 }, hours: 100 },
  { id: 'foraging', branch: 'Foraging', name: 'Forager\u2019s lore', desc: 'Which mushrooms are food and which are a learning experience.', effect: 'Forager huts and mushroom cellars bring in 35% more.', unlocks: [], cost: { rawFood: 25 }, hours: 64 },
  { id: 'preserving', branch: 'Foraging', after: 'foraging', name: 'Preserving', desc: 'Salt, smoke, crocks and a great deal of vinegar.', effect: 'Food spoils half as fast everywhere.', unlocks: [], cost: { wood: 20, rawFood: 25 }, hours: 84 },
  { id: 'herblore', branch: 'Healing', name: 'Herb lore', desc: 'A thick book of which leaf does what, half of it in the margins.', effect: 'Herb gardens and the apothecary work 50% faster.', unlocks: [], cost: { wood: 15, rawFood: 10 }, hours: 64 },
  { id: 'quarantine', branch: 'Healing', after: 'herblore', name: 'Quarantine', desc: 'A separate hut, a stern sign, and a rule about sharing spoons.', effect: 'Flu spreads less than half as easily, and an outbreak catches one fewer person.', unlocks: [], cost: { wood: 25, remedy: 4 }, hours: 84 },
];
/** what each piece of production lore speeds up, and by how much */
export const LORE_BOOST: Record<string, { defs: string[]; mult: number }> = {
  foraging: { defs: ['forager', 'cellar'], mult: 1.35 },
  smoking: { defs: ['dock', 'smokehouse'], mult: 1.4 },
  joinery: { defs: ['sawmill', 'carpenter', 'kiln', 'claypit'], mult: 1.4 },
  malting: { defs: ['brewery', 'ciderpress'], mult: 1.4 },
  milling: { defs: ['mill', 'bakery', 'pieoven'], mult: 1.4 },
  rotation: { defs: ['field', 'orchard', 'apiary'], mult: 1.4 },
  herblore: { defs: ['herbgarden', 'apothecary'], mult: 1.5 },
};
export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

// ---------- Charters ----------
// Each asks for people, a working supply chain and contented settlers at the same time. A "step" is one link in a
// chain: gathering is one, each processing building another (stew is 2 steps, bread 3).
const mood = (amount: number): CharterMetric => ({ kind: 'avgMood', amount, hours: 24 });
const pop = (amount: number): CharterMetric => ({ kind: 'population', amount });
export const CHARTERS: CharterDef[] = [
  // tier 1: a few more people, kept content, and a 1-2 step chain
  { id: 'settled', tier: 1, name: 'Settled in', desc: '6 colonists, 25 meals in storage, and a 24-hour average mood of 50+.', metric: { kind: 'all', parts: [pop(6), { kind: 'stock', resources: MEALS, amount: 25 }, mood(50)] }, helpers: ['dock', 'smokehouse'] },
  { id: 'woodsmoke', tier: 1, name: 'Woodsmoke', desc: '6 colonists, 20 smoked fish in storage, and a 24-hour average mood of 50+.', metric: { kind: 'all', parts: [pop(6), { kind: 'stock', resources: ['smokedFish'], amount: 20 }, mood(50)] }, helpers: ['smokehouse', 'dock'] },
  { id: 'firstplanks', tier: 1, name: 'First planks', desc: '6 colonists, 30 planks, bricks or wicker in storage, and a 24-hour average mood of 50+.', metric: { kind: 'all', parts: [pop(6), { kind: 'stock', resources: CATEGORIES.fine.members, amount: 30 }, mood(50)] }, helpers: ['sawmill', 'kiln', 'claypit', 'carpenter'] },
  { id: 'rested', tier: 1, name: 'Fed and rested', desc: '6 colonists, everyone in a bed, and a full day where every meal is cooked and eaten at a table.', metric: { kind: 'all', parts: [pop(6), { kind: 'everyoneBed' }, { kind: 'allTable', hours: 24, cooked: true }] }, helpers: ['cottage', 'dock', 'smokehouse'] },
  // tier 2: more people, harder to please, and a 3-step chain or two 2-step chains
  { id: 'bread', tier: 2, name: 'Daily bread', desc: '10 colonists, 20 bread in storage, and a 24-hour average mood of 55+. Grain, then flour, then bread.', metric: { kind: 'all', parts: [pop(10), { kind: 'stock', resources: ['bread'], amount: 20 }, mood(55)] }, helpers: ['field', 'mill', 'bakery'], sites: ['soil'] },
  { id: 'piesky', tier: 2, name: 'Pie in the sky', desc: '10 colonists, 20 pies in storage, and a 24-hour average mood of 55+. Berries and flour make a pie.', metric: { kind: 'all', parts: [pop(10), { kind: 'stock', resources: ['pie'], amount: 20 }, mood(55)] }, helpers: ['pieoven', 'field', 'mill', 'bakery'], sites: ['soil'] },
  { id: 'twokitchens', tier: 2, name: 'Two kitchens', desc: '10 colonists, 2 kinds of meal with 15 of each in storage, and a 24-hour average mood of 55+.', metric: { kind: 'all', parts: [pop(10), { kind: 'variety', category: 'meal', kinds: 2, each: 15 }, mood(55)] }, helpers: ['smokehouse', 'pieoven', 'bakery', 'dock'] },
  { id: 'roof', tier: 2, name: 'Raise the roof', desc: '10 colonists, 3 cottages, 15 drinks in storage, and a 24-hour average mood of 55+.', metric: { kind: 'all', parts: [pop(10), { kind: 'built', def: 'cottage', amount: 3 }, { kind: 'stock', resources: CATEGORIES.drink.members, amount: 15 }, mood(55)] }, helpers: ['cottage', 'sawmill', 'brewery', 'ciderpress'] },
  { id: 'hearty', tier: 2, name: 'Hale and hearty', desc: '10 colonists, 12 tonics in storage, and nobody sick or hurt for a full day.', metric: { kind: 'all', parts: [pop(10), { kind: 'stock', resources: ['tonic'], amount: 12 }, { kind: 'healthy', hours: 24 }] }, helpers: ['apothecary', 'apiary', 'herbgarden'], sites: ['meadow'] },
  { id: 'menu', tier: 2, name: 'A varied table', desc: '10 colonists, 3 kinds of meal with 10 of each in storage, and a 24-hour average mood of 55+.', metric: { kind: 'all', parts: [pop(10), { kind: 'variety', category: 'meal', kinds: 3, each: 10 }, mood(55)] }, helpers: ['smokehouse', 'pieoven', 'bakery'] },
  { id: 'tasting', tier: 2, name: 'Something for everyone', desc: '10 colonists, 3 kinds of drink with 8 of each in storage, and a 24-hour average mood of 55+.', metric: { kind: 'all', parts: [pop(10), { kind: 'variety', category: 'drink', kinds: 3, each: 8 }, mood(55)] }, helpers: ['ciderpress', 'apothecary', 'brewery'] },
  // tier 3: the finale; only a happy town can finish it
  { id: 'hall', tier: 3, name: 'The Crown\u2019s Hall', desc: 'Build the Crown\u2019s Hall with 12 or more colonists. Three stages: 60 planks or bricks, 40 meals for the masons, then 25 drinks for the topping-out. Only colonists at mood 55+ will work on it.', metric: { kind: 'all', parts: [pop(12), { kind: 'monument', def: 'hall' }] }, helpers: ['sawmill', 'kiln', 'cottage', 'tavern'] },
  { id: 'longtable', tier: 3, name: 'The Long Table', desc: 'Call a founders\u2019 feast. At dusk 14 or more colonists sit down at once, each served a meal and a drink they don\u2019t dislike. Sulkers won\u2019t come, and everyone needs a seat.', metric: { kind: 'longTable', pop: 14 }, helpers: ['tavern', 'brewery', 'ciderpress', 'pieoven', 'smokehouse', 'bakery'] },
];
