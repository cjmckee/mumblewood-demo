// Notables-and-crews slice: all game data. See claude/mumblewood-design-review.md (section 6) in the project.
// Chains are at most 3 steps (raw → simple → a dish combining two chains). Quality comes from the leader, not the building.

export type Good = 'berries' | 'fish' | 'grain' | 'wood' | 'planks' | 'stew' | 'bread' | 'smokedFish' | 'pie' | 'fishpie' | 'ale' | 'wine';
export type Craft = 'foraging' | 'fishing' | 'farming' | 'woodcutting' | 'cooking' | 'baking' | 'brewing' | 'carpentry';
export type Terrain = 'grass' | 'trees' | 'water' | 'bushes' | 'soil';
/** 0 plain, 1 good, 2 fine, 3 masterwork */
export type Quality = 0 | 1 | 2 | 3;

export const GOOD_NAME: Record<Good, string> = {
  berries: 'Berries', fish: 'Fish', grain: 'Grain', wood: 'Wood', planks: 'Planks', stew: 'Stew', bread: 'Bread',
  smokedFish: 'Smoked fish', pie: 'Fruit pie', fishpie: 'Fish pie', ale: 'Ale', wine: 'Berry wine',
};
export const QUALITY_NAME = ['Plain', 'Good', 'Fine', 'Masterwork'] as const;
export const RAW_FOOD: Good[] = ['berries', 'fish'];
/** eaten at supper; value is the dish's mood before quality */
export const DISH_MOOD: Partial<Record<Good, number>> = { stew: 1, smokedFish: 3, bread: 3, pie: 6, fishpie: 6 };
export const DISHES = Object.keys(DISH_MOOD) as Good[];
export const DRINKS: Good[] = ['ale', 'wine'];
/** what quality adds to a dish or drink's mood */
export const QUALITY_MOOD = [0, 2, 4, 7];
/** goods whose quality is tracked (the rest are counted as plain) */
/** dishes that count as "proper" for charters (not stew) */
export const PROPER: Good[] = ['smokedFish', 'bread', 'pie', 'fishpie'];
export const PIES: Good[] = ['pie', 'fishpie'];
export const CRAFTED: Good[] = [...DISHES, ...DRINKS];

export const CRAFT_NAME: Record<Craft, string> = {
  foraging: 'Foraging', fishing: 'Fishing', farming: 'Farming', woodcutting: 'Woodcutting',
  cooking: 'Cooking', baking: 'Baking', brewing: 'Brewing', carpentry: 'Carpentry',
};
/** the building icon used for a craft */
export const CRAFT_ICON: Record<Craft, string> = {
  foraging: 'berries', fishing: 'fish', farming: 'grain', woodcutting: 'wood', cooking: 'stew', baking: 'bread', brewing: 'ale', carpentry: 'planks',
};

export interface Recipe { id: string; take: Partial<Record<Good, number>>; anyRaw?: number; make: number; out: Good; work: number }
export interface BuildingDef {
  id: string; name: string; blurb: string; cost: Partial<Record<'wood' | 'planks', number>>; w: number; h: number; work: number;
  craft?: Craft; recipes?: Recipe[]; beds?: number; cozy?: boolean; decor?: boolean; tavern?: boolean;
  /** terrain that must be within 2 tiles (or under it, for soil) */
  needs?: Terrain; color: string;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hearth', name: 'Hearth', blurb: 'Where everyone gathers in the evening.', cost: {}, w: 2, h: 2, work: 0, color: '#c8742f' },
  { id: 'leanto', name: 'Shack', blurb: 'Sleeps 4 workers. Drafty.', cost: { wood: 10 }, w: 1, h: 1, work: 6, beds: 4, color: '#8a6e4f' },
  { id: 'forager', name: 'Forager hut', blurb: 'Berries from nearby bushes.', cost: { wood: 8 }, w: 1, h: 1, work: 6, craft: 'foraging', needs: 'bushes', color: '#9a4f6a',
    recipes: [{ id: 'berries', take: {}, make: 1, out: 'berries', work: 3 }] },
  { id: 'woodcutter', name: 'Woodcutter', blurb: 'Fells nearby trees. Can rough-saw planks, slowly.', cost: { wood: 6 }, w: 1, h: 1, work: 6, craft: 'woodcutting', needs: 'trees', color: '#7a5a3a',
    recipes: [{ id: 'wood', take: {}, make: 1, out: 'wood', work: 2.4 }, { id: 'roughplanks', take: { wood: 3 }, make: 1, out: 'planks', work: 3 }] },
  { id: 'kitchen', name: 'Kitchen', blurb: 'Stew from any raw food. Bread and fish make a fish pie.', cost: { wood: 15 }, w: 2, h: 1, work: 10, craft: 'cooking', color: '#b8693a',
    recipes: [{ id: 'stew', take: {}, anyRaw: 2, make: 2, out: 'stew', work: 1.5 }, { id: 'fishpie', take: { bread: 1, fish: 2 }, make: 2, out: 'fishpie', work: 3 }] },
  { id: 'flowerbed', name: 'Flower bed', blurb: 'For anyone with a green thumb nearby.', cost: { wood: 2 }, w: 1, h: 1, work: 1, decor: true, color: '#d66a9a' },
  // drafted
  { id: 'dock', name: 'Fishing dock', blurb: 'Fish. Must be by the water.', cost: { wood: 12 }, w: 1, h: 1, work: 8, craft: 'fishing', needs: 'water', color: '#3d7b9a',
    recipes: [{ id: 'fish', take: {}, make: 1, out: 'fish', work: 2.4 }] },
  { id: 'field', name: 'Grain field', blurb: 'Barley. Must sit on good soil.', cost: { wood: 10 }, w: 2, h: 2, work: 8, craft: 'farming', needs: 'soil', color: '#c9a64a',
    recipes: [{ id: 'grain', take: {}, make: 1, out: 'grain', work: 2 }] },
  { id: 'smokehouse', name: 'Smokehouse', blurb: 'Fish in, better fish out.', cost: { wood: 14 }, w: 1, h: 1, work: 8, craft: 'cooking', color: '#6b5a4a',
    recipes: [{ id: 'smokedFish', take: { fish: 2 }, make: 2, out: 'smokedFish', work: 2 }] },
  { id: 'bakery', name: 'Bakery', blurb: 'Bread from grain. Bread and berries make fruit pie.', cost: { wood: 14, planks: 4 }, w: 2, h: 1, work: 10, craft: 'baking', color: '#d6a33c',
    recipes: [{ id: 'bread', take: { grain: 2 }, make: 2, out: 'bread', work: 2 }, { id: 'pie', take: { bread: 1, berries: 2 }, make: 2, out: 'pie', work: 3 }] },
  { id: 'brewery', name: 'Brewery', blurb: 'Ale from grain, or wine from berries.', cost: { wood: 14, planks: 4 }, w: 2, h: 1, work: 10, craft: 'brewing', color: '#a86d3a',
    recipes: [{ id: 'ale', take: { grain: 2 }, make: 2, out: 'ale', work: 2.5 }, { id: 'wine', take: { berries: 3 }, make: 2, out: 'wine', work: 2.5 }] },
  { id: 'tavern', name: 'Tavern', blurb: 'Notables have a drink each evening. Eases strain when drinks flow.', cost: { wood: 15, planks: 8 }, w: 2, h: 2, work: 12, tavern: true, color: '#8e5f3a' },
  { id: 'sawmill', name: 'Sawmill', blurb: 'Wood becomes planks, quickly.', cost: { wood: 16 }, w: 2, h: 1, work: 10, craft: 'carpentry', color: '#7c6148',
    recipes: [{ id: 'planks', take: { wood: 2 }, make: 1, out: 'planks', work: 1.2 }] },
  { id: 'cottage', name: 'Cottage', blurb: 'A proper home for 2 notables.', cost: { wood: 6, planks: 8 }, w: 1, h: 1, work: 8, beds: 2, cozy: true, color: '#c7a983' },
];
export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
export const ALWAYS_BUILDABLE = ['leanto', 'forager', 'woodcutter', 'kitchen', 'flowerbed'];
export const DRAFT_POOL = ['dock', 'field', 'smokehouse', 'bakery', 'brewery', 'tavern', 'sawmill', 'cottage'];

export interface TraitDef { id: string; name: string; desc: string }
export const TRAITS: TraitDef[] = [
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Everything their crew makes is one quality better, but 20% slower.' },
  { id: 'taskmaster', name: 'Taskmaster', desc: 'Crew works 25% faster, but people are slow to join.' },
  { id: 'beloved', name: 'Big-hearted', desc: 'Workers flock to join their crew.' },
  { id: 'grumbler', name: 'Grumbler', desc: 'Notables working nearby are −3.' },
  { id: 'sunny', name: 'Sunny', desc: '+4 mood. Notables working nearby are +3.' },
  { id: 'glutton', name: 'Glutton', desc: 'Meals matter half again as much, for better or worse.' },
  { id: 'loner', name: 'Loner', desc: '−5 with another workplace within 2 tiles.' },
  { id: 'hothead', name: 'Hothead', desc: 'Rivals come to blows. Falls out with neighbours faster.' },
  { id: 'romantic', name: 'Romantic', desc: 'Falls for friends easily. Heartbreak hits twice as hard.' },
  { id: 'mentor', name: 'Mentor', desc: 'Gets better at their craft twice as fast.' },
];
export const TRAIT: Record<string, TraitDef> = Object.fromEntries(TRAITS.map(t => [t.id, t]));

export type WantId = 'sweetTooth' | 'tippler' | 'homebody' | 'greenThumb' | 'gourmand';
export const WANTS: Record<WantId, { name: string; desc: string; met: string; unmet: string; helps: string }> = {
  sweetTooth: { name: 'Sweet tooth', desc: 'Fruit pie every few days.', met: 'Had some pie', unmet: 'No pie in days', helps: 'bakery' },
  tippler: { name: 'Tippler', desc: 'A drink at the tavern most evenings.', met: 'A drink most evenings', unmet: 'Not a drop all week', helps: 'tavern' },
  homebody: { name: 'Homebody', desc: 'A cottage, not a shack.', met: 'A proper home', unmet: 'Stuck in a shack', helps: 'cottage' },
  greenThumb: { name: 'Green thumb', desc: 'A flower bed by their workplace.', met: 'Flowers at work', unmet: 'Not a flower in sight', helps: 'flowerbed' },
  gourmand: { name: 'Gourmand', desc: 'Three kinds of meal in five days.', met: 'A varied table', unmet: 'The same old food', helps: 'smokehouse' },
};

export const FIRST = ['Bramwell', 'Odette', 'Tobias', 'Wren', 'Mirabel', 'Gus', 'Hester', 'Pip', 'Clement', 'Agnes', 'Barnaby', 'Fennick', 'Ottilie', 'Rufus', 'Delphine', 'Hamish', 'Prudence', 'Ignatius', 'Marigold', 'Silas', 'Tansy', 'Cuthbert', 'Elspeth', 'Winnie', 'Mortimer', 'Bertha', 'Quill', 'Rosalind', 'Nell', 'Osric', 'Juniper', 'Beatrix'];
export const LAST = ['Pottsworth', 'Mudd', 'Thistledown', 'Grubb', 'Ashby', 'Crumble', 'Fernsby', 'Kettle', 'Hobb', 'Wimble', 'Larder', 'Quigley', 'Bunt', 'Marrow', 'Pennywhistle', 'Tumble', 'Underhill', 'Bramble'];
export const SHIRTS = [0xc8553d, 0x3d7b9a, 0x6a8d3a, 0xd6a33c, 0x8d5ba8, 0x2f8f7a, 0xb0466a, 0x5a6fb0, 0xa86d3a, 0x4f7f4f];
export const SKINS = [0xf1c9a5, 0xd9a27e, 0xb27b56, 0x8a5a3c, 0xf5d7b8, 0x6b4430];

// ---------- charters: each tier offers 3 of different shapes ----------
export type CharterId =
  | 'suppers' | 'timber' | 'bigcrew'
  | 'wedding' | 'hatchet' | 'goodstuff'
  | 'longtable' | 'hall' | 'guilds';
export interface CharterDef { id: CharterId; tier: 1 | 2 | 3; name: string; desc: string }
export const CHARTERS: CharterDef[] = [
  { id: 'suppers', tier: 1, name: 'Hot suppers', desc: 'Three suppers in a row where everyone, workers included, eats a cooked meal.' },
  { id: 'timber', tier: 1, name: 'Timber!', desc: 'Make 25 planks.' },
  { id: 'bigcrew', tier: 1, name: 'A proper crew', desc: 'One leader with a crew of 5.' },
  { id: 'wedding', tier: 2, name: 'A frontier wedding', desc: 'Two notables fall in love, then a wedding feast: 14 good-or-better dishes (not stew).' },
  { id: 'hatchet', tier: 2, name: 'Bury the hatchet', desc: 'Two notables who can’t stand each other become friendly. Neighbours who are both happy warm up.' },
  { id: 'goodstuff', tier: 2, name: 'The good stuff', desc: 'Notables eat 16 fine-or-better meals.' },
  { id: 'longtable', tier: 3, name: 'The Long Table', desc: '6 notables, then a feast: a fine pie (fruit or fish) for every notable and a cooked dish for every worker, served at once.' },
  { id: 'hall', tier: 3, name: 'The Crown’s Hall', desc: '50 planks, then 4 notables at mood 65+ at the same time to raise it.' },
  { id: 'guilds', tier: 3, name: 'A guild town', desc: '4 leaders, each with a crew of 5.' },
];
export const CHARTER: Record<CharterId, CharterDef> = Object.fromEntries(CHARTERS.map(c => [c.id, c])) as Record<CharterId, CharterDef>;

export const TUNE = {
  workStart: 7, workEnd: 19, supper: 18, evening: 20, morning: 8,
  crewCap: 6, joinAt: 3, leaveAt: -2,
  strainPerDay: 2.2, strainUnfed: 0.6, strainUnhoused: 0.35, charterRelief: 22, festivalRelief: 12, tavernRelief: 0.8,
  festivalCooldown: 5, unledSpeed: 0.6, stockCap: 40,
  blueprintDays: [4, 9, 15, 21], notableDays: [6, 12, 18],
};
