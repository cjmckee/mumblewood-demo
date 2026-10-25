// All game content lives here as plain data. The sim reads it; nothing here knows about rendering.

export type ResourceId = 'wood' | 'berries' | 'fish' | 'mushrooms' | 'stew' | 'pie' | 'smokedFish' | 'planks' | 'ale';
export const RESOURCES: { id: ResourceId; name: string; kind: 'raw' | 'meal' | 'material' | 'luxury' }[] = [
  { id: 'wood', name: 'Wood', kind: 'material' },
  { id: 'planks', name: 'Planks', kind: 'material' },
  { id: 'berries', name: 'Berries', kind: 'raw' },
  { id: 'fish', name: 'Fish', kind: 'raw' },
  { id: 'mushrooms', name: 'Mushrooms', kind: 'raw' },
  { id: 'stew', name: 'Stew', kind: 'meal' },
  { id: 'pie', name: 'Pie', kind: 'meal' },
  { id: 'smokedFish', name: 'Smoked fish', kind: 'meal' },
  { id: 'ale', name: 'Ale', kind: 'luxury' },
];
export const RAW_FOODS: ResourceId[] = ['berries', 'fish', 'mushrooms'];
export const MEALS: ResourceId[] = ['pie', 'smokedFish', 'stew'];

export type JobKind = 'chopping' | 'foraging' | 'fishing' | 'cooking' | 'crafting' | 'brewing' | 'serving' | 'medicine';
export const JOB_NAMES: Record<JobKind, string> = {
  chopping: 'chopping wood', foraging: 'foraging', fishing: 'fishing', cooking: 'cooking',
  crafting: 'carpentry', brewing: 'brewing', serving: 'tavern work', medicine: 'doctoring',
};
/** short labels for skill bars */
export const SKILL_NAMES: Record<JobKind, string> = {
  chopping: 'Chopping', foraging: 'Foraging', fishing: 'Fishing', cooking: 'Cooking',
  crafting: 'Carpentry', brewing: 'Brewing', serving: 'Serving', medicine: 'Medicine',
};
export const JOB_KINDS = Object.keys(JOB_NAMES) as JobKind[];

export interface Recipe {
  /** inputs consumed per unit of output; "rawFood" means any raw food */
  inputs: Partial<Record<ResourceId | 'rawFood', number>>;
  output: ResourceId;
  /** output units per worker-hour at work speed 1 */
  rate: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  blurb: string;
  cost: Partial<Record<ResourceId, number>>;
  /** footprint in tiles */
  w: number; h: number;
  slots: number;
  job?: JobKind;
  recipe?: Recipe;
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
  needs?: 'trees' | 'bushes' | 'water';
  /** patient beds, for a clinic */
  patients?: number;
  /** a small decoration with no door */
  decor?: boolean;
  /** how much it brightens the tiles around it */
  beauty?: number;
  /** colours for the vector renderer */
  wall: number; roof: number;
  height: number;
  /** always buildable, never drafted */
  basic?: boolean;
  draftable?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hearth', name: 'Hearth', blurb: 'Where everyone gathers in the evening to gossip. Burns wood at night.', cost: {}, w: 2, h: 2, slots: 0, wall: 0x6b5a4a, roof: 0xe07a2e, height: 0.3 },
  { id: 'stockpile', name: 'Stockpile', blurb: 'An open patch of ground for goods. Holds 150. Food left out here spoils.', cost: {}, w: 2, h: 2, slots: 0, storage: 150, walkable: true, wall: 0x8a7a5a, roof: 0x8a7a5a, height: 0, basic: true },
  { id: 'leanto', name: 'Lean-to', blurb: 'Sleeps 2. Drafty, but it counts as a roof.', cost: { wood: 8 }, w: 1, h: 1, slots: 0, beds: 2, bedQuality: 'basic', wall: 0x8a6e4f, roof: 0x7d8f55, height: 0.6, basic: true },
  { id: 'woodcutter', name: 'Woodcutter', blurb: 'Fells trees. Works best with lots of trees close by.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'chopping', needs: 'trees', recipe: { inputs: {}, output: 'wood', rate: 1.6 }, wall: 0x7a5a3c, roof: 0x5c7a3e, height: 0.7, basic: true },
  { id: 'forager', name: 'Forager hut', blurb: 'Picks berries. Works best right next to berry bushes.', cost: { wood: 8 }, w: 1, h: 1, slots: 2, job: 'foraging', needs: 'bushes', recipe: { inputs: {}, output: 'berries', rate: 1.3 }, wall: 0x8c6b4a, roof: 0xa0465a, height: 0.7, basic: true },
  { id: 'dining', name: 'Dining hall', blurb: 'Tables and benches for 6. Eating here beats eating in the dirt, as long as someone keeps it clean.', cost: { wood: 20 }, w: 2, h: 2, slots: 0, seats: 6, wall: 0x9a7a58, roof: 0x8a4a3a, height: 0.9, basic: true },
  { id: 'storehouse', name: 'Storehouse', blurb: 'Holds 250 goods under a roof. Food stored here doesn\u2019t spoil.', cost: { wood: 25 }, w: 2, h: 2, slots: 0, storage: 250, keepsFresh: true, wall: 0x7a6a58, roof: 0x5a6a7a, height: 1.0, basic: true },

  { id: 'clinic', name: 'Clinic', blurb: 'Two cots and a doctor. The sick and injured recover here much faster, faster still with a skilled doctor.', cost: { wood: 15 }, w: 2, h: 1, slots: 1, job: 'medicine', patients: 2, wall: 0xd8d0c0, roof: 0x9a3a3a, height: 0.8, basic: true },

  { id: 'flowerbed', name: 'Flower bed', blurb: 'Beauty 3. Somebody planted petunias in a wheelbarrow.', cost: { wood: 2 }, w: 1, h: 1, slots: 0, decor: true, beauty: 3, wall: 0x6b4f33, roof: 0xd66a9a, height: 0, basic: true },
  { id: 'lantern', name: 'Lantern post', blurb: 'Beauty 2. Glows at night, which moths appreciate.', cost: { wood: 4 }, w: 1, h: 1, slots: 0, decor: true, beauty: 2, wall: 0x4a3a2a, roof: 0xf2c46a, height: 0, basic: true },
  { id: 'bench', name: 'Bench', blurb: 'Beauty 2. A good place to sit and judge passers-by.', cost: { planks: 3 }, w: 1, h: 1, slots: 0, decor: true, beauty: 2, wall: 0x8a6038, roof: 0x8a6038, height: 0, basic: true },
  { id: 'statue', name: 'Statue of Saint Pomfrey', blurb: 'Beauty 7. He looks mildly disappointed, as in life.', cost: { planks: 12 }, w: 1, h: 1, slots: 0, decor: true, beauty: 7, wall: 0x9a9a92, roof: 0xb8b8b0, height: 0, basic: true },

  { id: 'dock', name: 'Fishing dock', blurb: 'Fish, plentiful and mildly judgmental. Must touch water.', cost: { wood: 15 }, w: 1, h: 2, slots: 2, job: 'fishing', needs: 'water', recipe: { inputs: {}, output: 'fish', rate: 1.5 }, wall: 0x6d5844, roof: 0x3d7b9a, height: 0.6, draftable: true },
  { id: 'cellar', name: 'Mushroom cellar', blurb: 'Dark, damp, productive. Like a bard.', cost: { wood: 12, planks: 5 }, w: 1, h: 1, slots: 2, job: 'foraging', recipe: { inputs: {}, output: 'mushrooms', rate: 1.5 }, wall: 0x5d5448, roof: 0x8d7aa8, height: 0.5, draftable: true },
  { id: 'kitchen', name: 'Stew kitchen', blurb: 'Turns any raw food into stew. Someone has to carry the ingredients in.', cost: { wood: 18 }, w: 2, h: 1, slots: 2, job: 'cooking', recipe: { inputs: { rawFood: 1.5 }, output: 'stew', rate: 1.2 }, wall: 0x8a6448, roof: 0xc4703a, height: 0.8, basic: true },
  { id: 'pieoven', name: 'Pie oven', blurb: 'Berries plus wood make pie. Pie is the best thing that has ever happened.', cost: { wood: 12, planks: 8 }, w: 1, h: 1, slots: 2, job: 'cooking', recipe: { inputs: { berries: 2, wood: 0.5 }, output: 'pie', rate: 0.9 }, wall: 0x9b7452, roof: 0xd6a33c, height: 0.8, draftable: true },
  { id: 'smokehouse', name: 'Smokehouse', blurb: 'Fish goes in, better fish comes out.', cost: { wood: 15 }, w: 1, h: 1, slots: 2, job: 'cooking', recipe: { inputs: { fish: 1.2 }, output: 'smokedFish', rate: 1.2 }, wall: 0x5f4d3f, roof: 0x8a8a8a, height: 0.9, draftable: true },
  { id: 'sawmill', name: 'Sawmill', blurb: 'Wood becomes planks. Planks become nicer buildings.', cost: { wood: 20 }, w: 2, h: 1, slots: 2, job: 'crafting', recipe: { inputs: { wood: 2 }, output: 'planks', rate: 1.0 }, wall: 0x7c6148, roof: 0xb08a5a, height: 0.8, draftable: true },
  { id: 'brewery', name: 'Brewery', blurb: 'Berries become ale. Ale becomes poor decisions.', cost: { wood: 15, planks: 8 }, w: 2, h: 1, slots: 2, job: 'brewing', recipe: { inputs: { berries: 2 }, output: 'ale', rate: 0.8 }, wall: 0x7a5640, roof: 0x9c5b2f, height: 0.9, draftable: true },
  { id: 'tavern', name: 'Tavern', blurb: 'Evenings here use ale and give big fun. Gossip travels twice as fast.', cost: { wood: 20, planks: 12 }, w: 2, h: 2, slots: 1, job: 'serving', wall: 0x8e5f3c, roof: 0x7a2f2f, height: 1.1, draftable: true },
  { id: 'cottage', name: 'Cottage', blurb: 'Sleeps 2, cozily. Waking up here is a +5 mood.', cost: { wood: 6, planks: 10 }, w: 1, h: 1, slots: 0, beds: 2, bedQuality: 'cozy', wall: 0xc7a983, roof: 0x4f6f9a, height: 0.9, draftable: true },
  { id: 'bathhouse', name: 'Bathhouse', blurb: 'Uses wood. Everyone feels fresher, and grumblers grumble less.', cost: { wood: 15, planks: 8 }, w: 2, h: 1, slots: 0, wall: 0xb8b0a0, roof: 0x4f8f8a, height: 0.7, draftable: true },
  { id: 'stage', name: "Bard's stage", blurb: 'Evening music at the hearth. Fun builds faster for everyone. Beauty 3.', cost: { wood: 12, planks: 5 }, w: 1, h: 1, slots: 0, beauty: 3, wall: 0x8a5f7a, roof: 0xc25c8a, height: 0.4, draftable: true },
];
/** builder-hours of work to finish a building */
export const buildWork = (d: BuildingDef) => (d.decor ? 1.5 : Math.max(3, d.w * d.h * 2.5));
export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

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
  { id: 'tippler', name: 'Tippler', desc: 'Ale gives +4 extra. −4 when there is no ale.' },
];
export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map(t => [t.id, t]));

export interface PerkDef { id: string; name: string; desc: string }
export const PERKS: PerkDef[] = [
  { id: 'communalPot', name: 'Communal pot', desc: 'Meals give +3 more mood.' },
  { id: 'matchmaker', name: "Matchmaker's charm", desc: 'Romance is twice as likely; breakups half as likely.' },
  { id: 'earplugs', name: 'Earplugs for all', desc: 'Grumblers and hummers bother people half as much.' },
  { id: 'ironWill', name: 'Iron constitution', desc: 'Frontier strain grows 25% slower.' },
  { id: 'overtime', name: 'Overtime bell', desc: 'Everyone works 15% faster.' },
  { id: 'rations', name: 'Hearty rations', desc: 'Hunger drains 20% slower.' },
  { id: 'saintsDay', name: "Saint Pomfrey's blessing", desc: '+4 mood for everyone, forever.' },
  { id: 'gossipBan', name: 'Gossip ordinance', desc: 'Insults happen half as often.' },
  { id: 'warmHearth', name: 'Everburning hearth', desc: 'The hearth burns half as much wood, and evenings there are +2.' },
];
export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map(p => [p.id, p]));

export type CharterMetric =
  | { kind: 'stock'; resources: ResourceId[]; amount: number }
  | { kind: 'population'; amount: number }
  | { kind: 'buildings'; amount: number }
  | { kind: 'avgMood'; amount: number; hours: number }
  | { kind: 'couples'; amount: number }
  | { kind: 'feast'; meals: number; ale: number }
  | { kind: 'contentPop'; pop: number; mood: number; hours: number }
  | { kind: 'paths'; amount: number }
  | { kind: 'decorPaths'; decor: number; paths: number }
  | { kind: 'allTable'; hours: number }
  | { kind: 'curedSince'; amount: number }
  | { kind: 'errandsSince'; amount: number }
  | { kind: 'avgBeauty'; amount: number; hours: number }
  | { kind: 'skilled'; count: number; level: number }
  | { kind: 'calm'; pop: number; hours: number };

export interface CharterDef { id: string; tier: 1 | 2 | 3; name: string; desc: string; metric: CharterMetric }
export const CHARTERS: CharterDef[] = [
  { id: 'pantry', tier: 1, name: 'A proper pantry', desc: 'Have 40 meals stored at once.', metric: { kind: 'stock', resources: ['stew', 'pie', 'smokedFish'], amount: 40 } },
  { id: 'growing', tier: 1, name: 'Room to grow', desc: 'Reach 9 colonists.', metric: { kind: 'population', amount: 9 } },
  { id: 'township', tier: 1, name: 'Township papers', desc: 'Finish 16 buildings (decorations don\u2019t count).', metric: { kind: 'buildings', amount: 16 } },
  { id: 'cheer', tier: 2, name: 'Measurable cheer', desc: 'Keep average mood at 58+ for a full day.', metric: { kind: 'avgMood', amount: 58, hours: 24 } },
  { id: 'lovebirds', tier: 2, name: 'Lovebirds', desc: 'Have 2 couples at the same time.', metric: { kind: 'couples', amount: 2 } },
  { id: 'lumber', tier: 2, name: 'Lumber baron', desc: 'Have 40 planks stored at once.', metric: { kind: 'stock', resources: ['planks'], amount: 40 } },
  { id: 'feast', tier: 3, name: 'The Great Feast', desc: 'Have 60 meals and 30 ale stored at once.', metric: { kind: 'feast', meals: 60, ale: 30 } },
  { id: 'harmony', tier: 3, name: 'Frontier harmony', desc: '12+ colonists with average mood 55+ for a full day.', metric: { kind: 'contentPop', pop: 12, mood: 55, hours: 24 } },
  { id: 'boomtown', tier: 3, name: 'Boomtown', desc: 'Reach 16 colonists.', metric: { kind: 'population', amount: 16 } },
  { id: 'woodpile', tier: 1, name: 'A proper woodpile', desc: 'Have 120 wood stored at once.', metric: { kind: 'stock', resources: ['wood'], amount: 120 } },
  { id: 'paved', tier: 1, name: 'Paved with good intentions', desc: 'Lay 25 tiles of path.', metric: { kind: 'paths', amount: 25 } },
  { id: 'tables', tier: 1, name: 'Elbows off the table', desc: 'Nobody eats without a table for a full day.', metric: { kind: 'allTable', hours: 24 } },
  { id: 'healthy', tier: 2, name: 'Clean bill of health', desc: 'Nurse 3 sick or injured colonists back to health.', metric: { kind: 'curedSince', amount: 3 } },
  { id: 'handy', tier: 2, name: 'Handy folk', desc: 'Finish 3 urgent jobs.', metric: { kind: 'errandsSince', amount: 3 } },
  { id: 'pretty', tier: 2, name: 'Pretty as a picture', desc: 'Keep average surroundings at beauty 3 or more for a full day.', metric: { kind: 'avgBeauty', amount: 3, hours: 24 } },
  { id: 'masters', tier: 2, name: 'Master craftsfolk', desc: 'Have 2 colonists with a skill of 10.', metric: { kind: 'skilled', count: 2, level: 10 } },
  { id: 'pieday', tier: 3, name: 'Pie Day', desc: 'Have 40 pies stored at once.', metric: { kind: 'stock', resources: ['pie'], amount: 40 } },
  { id: 'garden', tier: 3, name: 'Garden town', desc: 'Have 14 decorations and 60 tiles of path.', metric: { kind: 'decorPaths', decor: 14, paths: 60 } },
  { id: 'calm', tier: 3, name: 'Peace and quiet', desc: '12+ colonists and nobody sulking for two full days.', metric: { kind: 'calm', pop: 12, hours: 48 } },
];

export interface EventOption { label: string; detail: string; effect: string }
export interface EventDef { id: string; title: string; text: string; options: EventOption[]; requires?: 'couple' }
export const EVENTS: EventDef[] = [
  { id: 'bard', title: 'A travelling bard', text: 'A bard offers to play "The Ballad of Your Colony" for a modest fee. He has not yet written it.',
    options: [
      { label: 'Pay 6 ale', detail: 'Everyone +6 mood for a day.', effect: 'bardPlay' },
      { label: 'Shoo him away', detail: 'Nothing happens. He writes a mean song anyway.', effect: 'none' },
    ] },
  { id: 'wedding', title: 'A wedding is proposed', text: 'A couple wants to make it official. Everyone is invited, whether they like it or not.', requires: 'couple',
    options: [
      { label: 'Host it (8 meals, 5 ale)', detail: 'Everyone +7 mood for 2 days.', effect: 'wedding' },
      { label: 'Elope quietly', detail: 'The couple is −8 mood for 2 days.', effect: 'elope' },
    ] },
  { id: 'frogs', title: 'It is raining frogs', text: 'Small, confused frogs. Some colonists find it delightful. Others are holding umbrellas very tightly.',
    options: [
      { label: 'Collect them', detail: '+15 fish (close enough). Grumblers −5 for a day.', effect: 'frogFish' },
      { label: 'Stay indoors', detail: 'Everyone −2 mood for a day.', effect: 'frogHide' },
    ] },
  { id: 'outhouse', title: 'The outhouse is haunted', text: 'Witnesses describe moaning, rattling, and "a judgmental presence".',
    options: [
      { label: 'Rebuild it (10 planks)', detail: 'Lose 10 planks.', effect: 'outhouseFix' },
      { label: 'Live with the ghost', detail: 'Everyone −3 mood for 3 days.', effect: 'ghost' },
    ] },
  { id: 'peddler', title: 'A peddler with a cart', text: 'She is selling "authentic" relics and also, more usefully, planks.',
    options: [
      { label: 'Trade 30 wood for 12 planks', detail: 'A decent deal.', effect: 'peddlerPlanks' },
      { label: 'Buy the relic (10 food)', detail: 'Everyone +3 mood for 3 days. It is a spoon.', effect: 'relic' },
    ] },
];

export const FIRST_NAMES = ['Bramwell', 'Odette', 'Tobias', 'Wren', 'Mirabel', 'Gus', 'Hester', 'Pip', 'Clement', 'Agnes', 'Barnaby', 'Fennick', 'Ottilie', 'Rufus', 'Delphine', 'Hamish', 'Prudence', 'Ignatius', 'Marigold', 'Silas', 'Tansy', 'Cuthbert', 'Elspeth', 'Lysander', 'Winnie', 'Mortimer', 'Bertha', 'Quill', 'Rosalind', 'Thaddeus', 'Nell', 'Osric', 'Juniper', 'Percival', 'Beatrix', 'Alfie'];
export const SURNAMES = ['Pottsworth', 'Mudd', 'Thistledown', 'Grubb', 'Ashby', 'Crumble', 'Fernsby', 'Kettle', 'Hobb', 'Wimble', 'Larder', 'Quigley', 'Bunt', 'Marrow', 'Pennywhistle', 'Sprocket', 'Tumble', 'Underhill', 'Gristle', 'Bramble'];
export const SHIRTS = [0xc8553d, 0x3d7b9a, 0x6a8d3a, 0xd6a33c, 0x8d5ba8, 0x2f8f7a, 0xb0466a, 0x5a6fb0, 0xa86d3a, 0x4f7f4f];
export const SKINS = [0xf1c9a5, 0xd9a27e, 0xb27b56, 0x8a5a3c, 0xf5d7b8, 0x6b4430];

/** Events that create a short job someone has to be sent to do. {a} and {b} are filled with colonist names. */
export interface JobEventDef {
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
  { id: 'badger', title: 'A badger in the stores', text: 'A badger has moved into the storage. It is eating everything and it has opinions about it.', hours: 3, deadline: 12, at: 'storage', reward: 'Chase it off and nothing is lost.', penalty: 'Lose a quarter of all food.' },
  { id: 'cat', title: 'The cat is up a tree', text: 'The colony cat climbed the tallest tree on the frontier and is now yowling about it.', hours: 2, deadline: 8, at: 'edge', skill: 'chopping', reward: 'Everyone +3 mood for a day.', penalty: 'Everyone −3 mood for a day, from the yowling.' },
  { id: 'feud', title: 'A feud is brewing', text: '{a} and {b} are not speaking, except to say very loud things about each other. Someone should mediate.', hours: 3, deadline: 16, at: 'pair', reward: 'They patch things up a bit (+25 opinion each way).', penalty: 'Both −6 mood for two days, and they like each other even less.', requires: 'rivals' },
  { id: 'bog', title: 'Someone is stuck in the bog', text: 'A traveller has wandered into the bog at the edge of the woods and is sinking at a dignified pace.', hours: 4, deadline: 10, at: 'edge', reward: 'They join the colony out of gratitude.', penalty: 'They get out on their own and tell everyone how rude you were (−2 mood for a day).' },
  { id: 'goblin', title: 'The goblin tax collector', text: 'A goblin in a very official hat is demanding a "frontier levy" and refuses to leave. Someone should politely walk him to the edge of the woods.', hours: 2, deadline: 6, at: 'hearth', reward: 'He leaves with nothing but a stamped form.', penalty: 'He takes 20 food and graffitis every wall on the way out.' },
  { id: 'pigeons', title: 'The pigeons have unionised', text: 'The pigeons are picketing the food stores. Their demands are berries. Someone needs to negotiate, loudly, with a broom.', hours: 3, deadline: 8, at: 'storage', reward: 'The pigeons disperse, grumbling.', penalty: 'They riot. Lose 40% of the berries.' },
  { id: 'remedy', title: 'Brew a remedy', text: 'The frontier flu is going around. Someone handy with medicine could brew a remedy.', hours: 4, deadline: 18, at: 'clinic', skill: 'medicine', reward: 'Everyone who is sick feels much better.', penalty: 'The flu runs its course.' },
];

export interface IllnessDef { id: string; name: string; start: number; /** severity change per hour while untreated and up */ worsen: number; contagious?: boolean }
export const ILLNESSES: IllnessDef[] = [
  { id: 'flu', name: 'Frontier flu', start: 22, worsen: 1.0, contagious: true },
  { id: 'tummy', name: 'Bad tummy', start: 20, worsen: 0.15 },
  { id: 'thumb', name: 'Hammered thumb', start: 18, worsen: 0.15 },
  { id: 'ankle', name: 'Sprained ankle', start: 26, worsen: 0.2 },
  { id: 'splinter', name: 'Heroic splinter', start: 16, worsen: 0.15 },
];
