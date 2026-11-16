// The editor's object tree: every catalog kind split into branches (item categories, clothing
// by body part, monster species, terrain by how the game draws it, …) so any object can be
// reached by browsing as well as by search. Pure functions; main.ts draws the tree.
import { terrainKind } from '../render/classify';
import type { CatalogFeature } from '../shared/protocol';
import type { CatalogEntry, CatalogKind, CatalogLabels } from './catalog';
import { t } from './i18n';

export type Kind = CatalogKind | 'vox';

/** Top-level order and names. */
export const KINDS: [Kind, string][] = [
  ['furn', t('家具')],
  ['ter', t('地形')],
  ['item', t('物品')],
  ['monster', t('生物')],
  ['vehicle', t('载具')],
  ['vpart', t('载具部件')],
  ['field', t('场地效果')],
  ['trap', t('陷阱')],
  ['vox', t('体素模型')],
];
export const KIND_NAME = Object.fromEntries(KINDS) as Record<Kind, string>;

/** One branch level: [key, label]. */
type Seg = [string, string];

const has = (e: CatalogEntry, ...flags: string[]) => flags.some((f) => e.flags.includes(f));
const feature = (e: CatalogEntry): CatalogFeature => ({ id: e.id, name: e.name, sym: e.sym, color: e.color, move: e.move ?? 2, looksLike: e.looksLike ?? '', flags: e.flags });

function first(rules: [string, string, (e: CatalogEntry) => boolean][], e: CatalogEntry, other: Seg = ['other', t('其他')]): Seg {
  for (const [key, label, test] of rules) if (test(e)) return [key, label];
  return other;
}

// ── Terrain: by the map layer's own classification (src/render/classify.ts) ──────────────
const TERRAIN: Record<string, string> = {
  wall: t('墙'), door: t('门'), door_open: t('门'), window: t('窗'), stairs_up: t('楼梯与坡道'), stairs_down: t('楼梯与坡道'),
  tree: t('树木'), shrub: t('灌木与幼苗'), water: t('水体'), rubble: t('瓦砾'), open_air: t('空中（无地面）'), floor: t('地面'),
};
function terrain(e: CatalogEntry): Seg[] {
  let k = terrainKind(feature(e));
  if (k === 'door_open') k = 'door';
  if (k === 'stairs_down') k = 'stairs_up';
  if (k === 'none') k = 'floor';
  if (k === 'floor') return [['floor', t('地面')], has(e, 'INDOORS') || /floor|carpet|tile|linoleum/.test(e.id) ? ['indoor', t('室内地板')] : /road|pavement|sidewalk|asphalt|concrete|parking/.test(e.id) ? ['road', t('道路与铺装')] : ['outdoor', t('室外地面')]];
  return [[k, TERRAIN[k] ?? k]];
}

// ── Furniture: by what it is ────────────────────────────────────────────────────────────
const FURN: [string, string, (e: CatalogEntry) => boolean][] = [
  ['door', t('门窗与路障'), (e) => /window|curtain|blind|barricade|door|gate|fence|bars|hesco|sandbag|earthbag|gravelbag|LIXA_unfold/i.test(e.id)],
  ['plant', t('植物与花草'), (e) => has(e, 'PLANT', 'FLOWER', 'SHRUB', 'TREE') || /plant|flower|bush|mushroom|cattail|lily|hay|crop|seed|grass|sapling|moss|fung|algae|weed|dandelion|bluebell|chamomile|chicory|burdock|thistle|mustard|lotus|kelp|seaweed|sea_(lettuce|sponge|anemone)|loosestrife|knotweed|artichoke|_wild|salsify|selfheal|dogbane|datura|fireweed|wintergreen|dahlia|susan|maianthemum|brambles|hedge|topiary|poppy|lichen|tree|alien_(tendril|anemone)|wild_rice|vine_up|patchwork/i.test(e.id)],
  ['seat', t('座椅与床'), (e) => has(e, 'CAN_SIT', 'BED') || /chair|bench|stool|sofa|couch|bed|seat|mattress|cot\b|hammock|throne|beanbag|tatami|pillow/i.test(e.id)],
  ['table', t('桌子与台面'), (e) => /table|desk|counter|workbench|bar_|altar|podium|displaycase|slab|crafting_spot/i.test(e.id)],
  ['appliance', t('电器与医疗设备'), (e) => /fridge|freezer|oven|stove|washer|dryer|tv|computer|console|vending|arcade|atm|microwave|server|sink|toilet|shower|bathtub|tub|dishwasher|air_conditioner|air_filter|ventilator|oxygen|deep_fryer|autodoc|xray|ctscan|mri|nmr|hplc|^f_gc$|^f_ms$|dialysis|dental|iv_pole|cooler|water_purifier|entertainment|styling|satellite|antenna|booster|control_station|organ|glowingbulb/i.test(e.id)],
  ['workshop', t('工坊与工业设备'), (e) => /machine|generator|pump|press|lathe|forge|kiln|furnace|still|smoker|charcoal|boiler|heater|robot|reactor|tank|engine|electr|solar|battery|anvil|bellows|bandsaw|jointer|planer|router|mitresaw|drophammer|hammer|centrifuge|autoclave|fume_hood|chemical_mixer|shaker|vat|keg|churn|spinwheel|scutch|mill|hoist|tire_changer|shredder|capacitor|fuel_cell|containment|exodii|string_dimension|xedra|detector|beacon|pylon|compost|stook|fireplace|firering|brazier|chimney|melchior|mortar|utility_pole|ground_cable|vent_pipe|portal/i.test(e.id)],
  ['sport', t('运动与训练'), (e) => /treadmill|ergometer|exercise|punching|training|target|lane|ball_mach|dive_block|showjump|dancing_pole/i.test(e.id)],
  ['storage', t('柜子与容器'), (e) => has(e, 'CONTAINER', 'PLACE_ITEM') || /cupboard|cabinet|locker|shelf|rack|dresser|wardrobe|bookcase|crate|box|safe|chest|barrel|bin|basket|drawer|trash|dumpster|drum|clothing_rail|clothesline|meathook|torah/i.test(e.id)],
  ['piles', t('建材堆与土堆'), (e) => /stack|mound|pallet|pile|dirtmound|woodchips|midden/i.test(e.id)],
  ['shelter', t('帐篷与隔墙'), (e) => /groundsheet|canvas|skin_wall|tarp|cardboard|fort|_wall$|_floor$|_roof$|divider|fiber_mat/i.test(e.id)],
  ['nature', t('自然地物'), (e) => /boulder|beach_log|beaver|egg_sack|web_up|vent_|swamp_gas|fog|leaves|clay|rope_up|ladder|stepladder|region_|absence|alien_(pod|scar|gasper|zapper)|sand_castle|scrap_bridge|bitts|cleat/i.test(e.id)],
  ['decor', t('装饰与杂物'), (e) => /sign|statue|painting|lamp|light|mirror|rug|clock|trophy|piano|sculpture|flag|banner|candle|poster|mannequin|plush|bulletin|board_map|whiteboard|birdbath|gazing_ball|wreath|wind_vane|doll|decorative|firefly|terrarium|shackle|cross/i.test(e.id)],
  ['debris', t('残骸、尸体与坟墓'), (e) => /rubble|debris|wreck|ash|broken|destroyed|glass|bones|corpse|gore|junk|grave|sarcophagus|impaled|dead_|empty_spike|coffin|casket/i.test(e.id)],
];

// ── Items: CDDA item category, clothing by body part ────────────────────────────────────
const CAT_FIX: Record<string, string> = { tool: 'tools', TOOL: 'tools', FOOD: 'food', artifact: 'artifacts' };
const BODY: [string, string, RegExp][] = [
  ['torso', t('躯干'), /^torso$/],
  ['legs', t('腿部'), /^leg/],
  ['feet', t('脚部'), /^foot/],
  ['hands', t('手部'), /^hand/],
  ['arms', t('手臂'), /^arm/],
  ['head', t('头部'), /^head$/],
  ['face', t('面部（眼、口）'), /^(eyes|mouth)$/],
];
function bodyPart(e: CatalogEntry): Seg {
  const covers = e.covers ?? [];
  if (!covers.length) return ['none', t('不覆盖部位（饰品、背包等）')];
  for (const [key, label, re] of BODY) if (covers.some((c) => re.test(c))) return [key, label];
  return ['other', t('其他部位')];
}
function item(e: CatalogEntry, labels: CatalogLabels): Seg[] {
  const cat = CAT_FIX[e.cat ?? ''] ?? e.cat ?? 'other';
  const seg: Seg = [cat, labels.itemCat[cat] ?? cat];
  if (cat === 'clothing' || cat === 'armor') return [seg, bodyPart(e)];
  return [seg];
}

// ── Monsters: by species ────────────────────────────────────────────────────────────────
const SPECIES: Record<string, string> = {
  ZOMBIE: t('丧尸'), HUMAN: t('人类'), FERAL: t('狂化人类'), GHOUL: t('食尸鬼'), MAMMAL: t('哺乳动物'), BIRD: t('鸟类'), REPTILE: t('爬行动物'),
  AMPHIBIAN: t('两栖动物'), FISH: t('鱼类'), MOLLUSK: t('软体动物'), INSECT: t('昆虫'), INSECT_FLYING: t('飞虫'), SPIDER: t('蜘蛛'),
  CENTIPEDE: t('蜈蚣'), WORM: t('蠕虫'), PLANT: t('植物'), LEECH_PLANT: t('水蛭植物'), FUNGUS: t('真菌'), SLIME: t('史莱姆'),
  ROBOT: t('机器人'), ROBOT_FLYING: t('飞行机器人'), CYBORG: t('半机械人'), MUTANT: t('变异体'), NETHER: t('异界生物'),
  NETHER_BURROWING: t('异界掘地者'), NETHER_EMANATION: t('异界散逸体'), MIGO: t('米-戈'), TINDALOS: t('廷达罗斯猎犬'),
  KRAKEN: t('海怪'), HORROR: t('恐怖之物'), ABERRATION: t('畸变体'), HALLUCINATION: t('幻觉'), YRAX: t('伊拉克斯'), UNKNOWN: t('未知'),
};
function monster(e: CatalogEntry): Seg[] {
  const s = e.species?.[0];
  return [s ? [s, SPECIES[s] ?? s] : ['none', t('无物种')]];
}

// ── Vehicles: by what they are (name and id) ────────────────────────────────────────────
const VEHICLE: [string, string, (e: CatalogEntry) => boolean][] = [
  ['air', t('飞行器'), (e) => /heli|plane|aircraft|cessna|blimp|balloon|copter|glider|airliner|jet/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['boat', t('船只'), (e) => /boat|canoe|kayak|raft|yacht|ship|ferry|dinghy|sail|hovercraft/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['bike', t('自行车与两轮车'), (e) => /bicycle|bike|unicycle|scooter|motorcycle|moped|chopper|tricycle|atv|quad|segway|wheelchair/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['cart', t('拖车与推车'), (e) => /trailer|cart|wagon|carriage|shopping|wheelbarrow|dolly|trolley|stroller/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['military', t('军用与装甲'), (e) => /tank|apc|humvee|armored|armoured|military|police|swat|riot|lav\b/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['big', t('卡车与大型车'), (e) => /truck|bus|semi|van|lorry|rv\b|camper|tractor|harvester|excavator|bulldozer|crane|ambulance|fire_engine|firetruck|garbage|dump|forklift|limo/.test(`${e.id} ${e.en}`.toLowerCase())],
  ['car', t('汽车'), (e) => /car|sedan|suv|coupe|hatch|taxi|wagon|cab|beetle|roadster|electric|pickup|jeep|buggy/.test(`${e.id} ${e.en}`.toLowerCase())],
];

// ── Fields and traps ────────────────────────────────────────────────────────────────────
const FIELD: [string, string, (e: CatalogEntry) => boolean][] = [
  ['zone', t('区域标记（玩家划定，不可见）'), (e) => /_zone$|construction_site|last_known|direction|push_items/.test(e.id)],
  ['fire', t('火焰与高温'), (e) => /fire|flame|hot_air|heat|incend|lava|plasma|ember|sauna/.test(e.id)],
  ['gas', t('烟雾、气体与气味'), (e) => /smoke|gas|fog|mist|fume|cloud|spore|toxic|tear|nuke|relax|fungicid|insecticid|dust|smog|steam|incense|haze|cold_air|smell|atmosphere|pollen|decompression|air_conditioner/.test(e.id)],
  ['gore', t('血液、液体与残骸'), (e) => /blood|gibs|bile|gore|slime|acid|sludge|vomit|puddle|oil|ooze|water|sap|fluid|splinters|rubble|churned|web|mass/.test(e.id)],
  ['energy', t('电、光与异常'), (e) => /electric|shock|laser|light|dazzling|fatigue|tindalos|portal|temporal|nether|psi|clairvoyant|darkness|shadow|biolum|spotlight|lightning|wave|rift|swarm|extinguisher|migo/.test(e.id)],
];
const TRAP: [string, string, (e: CatalogEntry) => boolean][] = [
  ['hidden', t('隐藏机关（脚本触发）'), (e) => Boolean(e.hidden)],
  ['glass', t('碎片与杂物'), (e) => /glass|caltrop|nail|debris|leaves|puddle|shard|lego/.test(e.id)],
  ['funnel', t('收集器'), (e) => /funnel|cistern|catch/.test(e.id)],
];

// ── Voxel models: by set, then by built-in model group (src/vox/library.ts BUILTIN_GROUPS) ──
const VOX_GROUP: Record<string, string> = {
  terrain: t('地形'), nature: t('自然地物'), furniture: t('家具'), creature: t('生物'), item: t('物品'), vehicle: t('载具'), effect: t('效果与标记'), object: t('按 id 绑定'), other: t('其他'),
};

/** The branch path of one object below its kind, e.g. [['clothing','服装'],['torso','躯干']]. */
export function branchOf(kind: Kind, e: CatalogEntry, labels: CatalogLabels): Seg[] {
  switch (kind) {
    case 'ter': return terrain(e);
    case 'furn': return [first(FURN, e)];
    case 'item': return item(e, labels);
    case 'monster': return monster(e);
    case 'vehicle': return [first(VEHICLE, e)];
    case 'vpart': return [[e.cat ?? 'other', labels.vpartCat[e.cat ?? 'other'] ?? e.cat ?? t('其他')]];
    case 'field': return [first(FIELD, e)];
    case 'trap': return [first(TRAP, e, ['trap', t('陷阱')])];
    case 'vox': return [[e.voxSet ?? 'set', e.voxSetName ?? e.voxSet ?? ''], [e.cat ?? 'object', VOX_GROUP[e.cat ?? 'object'] ?? e.cat ?? '']];
  }
}

export interface TreeNode {
  /** "kind" or "kind/branch/…". */
  path: string;
  label: string;
  count: number;
  children: TreeNode[];
}

/** Build the tree from each object's branch path. Children sort by size, "other" last. */
export function buildTree(kinds: { kind: Kind; entries: CatalogEntry[]; branch: (e: CatalogEntry) => Seg[] }[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const { kind, entries, branch } of kinds) {
    const root: TreeNode = { path: kind, label: KIND_NAME[kind], count: 0, children: [] };
    for (const e of entries) {
      root.count++;
      let node = root;
      for (const [key, label] of branch(e)) {
        const path = `${node.path}/${key}`;
        let child = node.children.find((c) => c.path === path);
        if (!child) node.children.push((child = { path, label, count: 0, children: [] }));
        child.count++;
        node = child;
      }
    }
    roots.push(root);
  }
  const sort = (n: TreeNode) => {
    const last = (c: TreeNode) => /\/(other|none)$/.test(c.path) ? 1 : 0;
    n.children.sort((a, b) => last(a) - last(b) || b.count - a.count);
    // A single child adds nothing: fold it away.
    if (n.children.length === 1 && n.children[0]!.children.length === 0) n.children = [];
    n.children.forEach(sort);
  };
  roots.forEach(sort);
  return roots;
}

/** Path string of an object ("item/clothing/torso"). */
export const pathOf = (kind: Kind, segs: Seg[]) => [kind, ...segs.map(([k]) => k)].join('/');

/** Whether an object at `objectPath` is inside the branch `branch` ('' = everything). */
export const inBranch = (objectPath: string, branch: string) => !branch || objectPath === branch || objectPath.startsWith(`${branch}/`);

/** The labels from the root to `path` ("物品 › 服装 › 躯干"). */
export function trail(tree: TreeNode[], path: string): TreeNode[] {
  const out: TreeNode[] = [];
  let level = tree;
  for (;;) {
    const next = level.find((n) => inBranch(path, n.path));
    if (!next) return out;
    out.push(next);
    if (next.path === path) return out;
    level = next.children;
  }
}
