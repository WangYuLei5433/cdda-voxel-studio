// Interface language: Chinese (the source strings), English and Russian.
// t('中文原文', { n: 3 }) looks the Chinese source up in DICT and fills {placeholders}.
// The language comes from ?lang=, else the saved choice, else the browser; changing it
// reloads the page (labels are built once at start-up).

export type Lang = 'zh_CN' | 'en' | 'ru';

export const LANGS: [Lang, string][] = [['zh_CN', '中文'], ['en', 'English'], ['ru', 'Русский']];

const STORE_KEY = 'studio-lang';
const isLang = (v: unknown): v is Lang => LANGS.some(([l]) => l === v);

function detect(): Lang {
  // Outside a browser (unit tests) the source language.
  if (typeof window === 'undefined') return 'zh_CN';
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  try {
    const saved = window.localStorage.getItem(STORE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked: fall through */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase();
    if (code.startsWith('zh')) return 'zh_CN';
    if (code.startsWith('ru')) return 'ru';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

export const lang: Lang = detect();

/** Switch language: remember it and reload (the URL's ?lang= is dropped so the choice wins). */
export function setLang(next: Lang): void {
  try {
    window.localStorage.setItem(STORE_KEY, next);
  } catch {
    /* not remembered */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.href = url.toString();
}

/** Separator for lists in running text. */
export const listSep = (): string => (lang === 'zh_CN' ? '、' : ', ');

/** Translate a Chinese source string; {name} placeholders are filled from `vars`. */
export function t(zh: string, vars?: Record<string, string | number>): string {
  const entry = lang === 'zh_CN' ? undefined : DICT[zh];
  let s = entry ? entry[lang === 'en' ? 0 : 1] : zh;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Chinese source → [English, Russian]. */
export const DICT: Record<string, [string, string]> = {
  // Object kinds
  '地形': ['Terrain', 'Местность'],
  '家具': ['Furniture', 'Мебель'],
  '物品': ['Items', 'Предметы'],
  '生物': ['Creatures', 'Существа'],
  '载具': ['Vehicles', 'Транспорт'],
  '载具部件': ['Vehicle parts', 'Детали транспорта'],
  '场地效果': ['Fields', 'Поля'],
  '陷阱': ['Traps', 'Ловушки'],

  // Status

  // Inspector: identity
  '极小': ['tiny', 'крошечный'],
  '小': ['small', 'маленький'],
  '中': ['medium', 'средний'],
  '大': ['large', 'большой'],
  '巨大': ['huge', 'огромный'],
  '类别': ['Kind', 'Тип'],
  '分支': ['Branch', 'Раздел'],
  '部件分类': ['Part category', 'Категория детали'],
  '物品分类': ['Item category', 'Категория предмета'],
  '安装位置': ['Mount location', 'Место установки'],
  '覆盖部位': ['Covers', 'Закрывает'],
  '物种': ['Species', 'Вид'],
  '体型': ['Body type', 'Телосложение'],
  '尺寸等级': ['Size class', 'Класс размера'],
  '车身': ['Body', 'Корпус'],
  '{l} × {w} 格': ['{l} × {w} tiles', '{l} × {w} клеток'],
  '物品类型': ['Item types', 'Типы предмета'],
  '体积': ['Volume', 'Объём'],
  '重量': ['Weight', 'Вес'],
  '最长边': ['Longest side', 'Длина'],
  '（按体积估算）': [' (estimated from volume)', ' (оценка по объёму)'],
  '拖动所需力量': ['Strength to drag', 'Сила для перетаскивания'],
  '变体': ['Variants', 'Варианты'],
  '定义文件': ['Defined in', 'Определено в'],
  '颜色': ['Color', 'Цвет'],
  '标志 {n} 个': ['{n} flags', 'Флаги: {n}'],

  // Inspector: resolution
  '显示为': ['Shown as', 'Показано как'],

  // Measurements
  '没有可测量的模型': ['Nothing to measure', 'Нечего измерять'],
  '格': ['tiles', 'клеток'],
  '低于地面 {n} 格': ['{n} tiles below the ground', 'на {n} клеток ниже земли'],

  // Inspector: edit form
  '模型': ['Model', 'Модель'],
  '按 CDDA 颜色染色': ['Tint with the CDDA color', 'Окрасить цветом CDDA'],

  // Header, list and toolbar
  '墙高 {wall} 格 · 人高 {person} 格': ['Wall {wall} tiles · person {person} tiles', 'Стена {wall} клеток · человек {person} клеток'],
  '未找到 CDDA 对象表': ['No CDDA catalog found', 'Каталог CDDA не найден'],
  '全部对象': ['All objects', 'Все объекты'],
  '折叠': ['Collapse', 'Свернуть'],
  '展开': ['Expand', 'Развернуть'],
  '全部': ['All', 'Все'],
  '{n} 项 · 匹配 {m} 项': ['{n} · {m} match', '{n} · совпадений: {m}'],
  '还有 {n} 项，请缩小搜索或选更细的分支': ['{n} more: narrow the search or pick a smaller branch', 'Ещё {n}: уточните поиск или выберите раздел поменьше'],
  '列表': ['List', 'Список'],
  '缩略图网格': ['Thumbnail grid', 'Сетка миниатюр'],
  '格子大小': ['Cell size', 'Размер ячеек'],
  '从左侧选择一个对象。': ['Pick an object on the left.', 'Выберите объект слева.'],
  '斜视': ['Iso', 'Изометрия'],
  '正面': ['Front', 'Спереди'],
  '侧面': ['Side', 'Сбоку'],
  '俯视': ['Top', 'Сверху'],
  '网格': ['Grid', 'Сетка'],
  '参照墙': ['Wall', 'Стена'],
  '参照人': ['Person', 'Человек'],
  '包围盒': ['Bounds', 'Габариты'],
  '线框': ['Wireframe', 'Каркас'],
  '视角': ['View', 'Вид'],
  '语言': ['Language', 'Язык'],
  'CDDA 模型工作室': ['CDDA Model Studio', 'Студия моделей CDDA'],
  '选择分类': ['Pick a branch', 'Выбрать раздел'],
  '搜索 id、名称或英文名…': ['Search id or name…', 'Поиск по id, названию или английскому названию…'],
  '加载模型…': ['Loading model…', 'Загрузка модели…'],
  '非官方译名': ['unofficial translation', 'неофициальный перевод'],

  // Object tree
  '其他': ['Other', 'Прочее'],
  '墙': ['Walls', 'Стены'],
  '门': ['Doors', 'Двери'],
  '窗': ['Windows', 'Окна'],
  '楼梯与坡道': ['Stairs and ramps', 'Лестницы и пандусы'],
  '树木': ['Trees', 'Деревья'],
  '灌木与幼苗': ['Shrubs and saplings', 'Кусты и саженцы'],
  '水体': ['Water', 'Вода'],
  '瓦砾': ['Rubble', 'Обломки'],
  '空中（无地面）': ['Open air (no ground)', 'Воздух (нет земли)'],
  '地面': ['Ground', 'Земля'],
  '室内地板': ['Indoor floors', 'Полы в помещениях'],
  '道路与铺装': ['Roads and paving', 'Дороги и покрытия'],
  '室外地面': ['Outdoor ground', 'Земля снаружи'],
  '门窗与路障': ['Doors, windows and barricades', 'Двери, окна и баррикады'],
  '植物与花草': ['Plants and flowers', 'Растения и цветы'],
  '座椅与床': ['Seats and beds', 'Сиденья и кровати'],
  '桌子与台面': ['Tables and counters', 'Столы и стойки'],
  '电器与医疗设备': ['Appliances and medical equipment', 'Техника и медоборудование'],
  '工坊与工业设备': ['Workshop and industrial equipment', 'Мастерская и промышленное оборудование'],
  '运动与训练': ['Sports and training', 'Спорт и тренировки'],
  '柜子与容器': ['Cabinets and containers', 'Шкафы и контейнеры'],
  '建材堆与土堆': ['Material stacks and mounds', 'Штабеля и насыпи'],
  '帐篷与隔墙': ['Tents and partitions', 'Палатки и перегородки'],
  '自然地物': ['Natural features', 'Природные объекты'],
  '装饰与杂物': ['Decor and odds and ends', 'Декор и мелочи'],
  '残骸、尸体与坟墓': ['Wreckage, remains and graves', 'Обломки, останки и могилы'],
  '躯干': ['Torso', 'Торс'],
  '腿部': ['Legs', 'Ноги'],
  '脚部': ['Feet', 'Ступни'],
  '手部': ['Hands', 'Кисти'],
  '手臂': ['Arms', 'Руки'],
  '头部': ['Head', 'Голова'],
  '面部（眼、口）': ['Face (eyes, mouth)', 'Лицо (глаза, рот)'],
  '不覆盖部位（饰品、背包等）': ['Covers nothing (jewelry, bags…)', 'Ничего не закрывает (украшения, сумки…)'],
  '其他部位': ['Other parts', 'Другие части'],
  '丧尸': ['Zombies', 'Зомби'],
  '人类': ['Humans', 'Люди'],
  '狂化人类': ['Ferals', 'Одичавшие'],
  '食尸鬼': ['Ghouls', 'Гули'],
  '哺乳动物': ['Mammals', 'Млекопитающие'],
  '鸟类': ['Birds', 'Птицы'],
  '爬行动物': ['Reptiles', 'Рептилии'],
  '两栖动物': ['Amphibians', 'Амфибии'],
  '鱼类': ['Fish', 'Рыбы'],
  '软体动物': ['Mollusks', 'Моллюски'],
  '昆虫': ['Insects', 'Насекомые'],
  '飞虫': ['Flying insects', 'Летающие насекомые'],
  '蜘蛛': ['Spiders', 'Пауки'],
  '蜈蚣': ['Centipedes', 'Многоножки'],
  '蠕虫': ['Worms', 'Черви'],
  '植物': ['Plants', 'Растения'],
  '水蛭植物': ['Leech plants', 'Растения-пиявки'],
  '真菌': ['Fungi', 'Грибы'],
  '史莱姆': ['Slimes', 'Слизни'],
  '机器人': ['Robots', 'Роботы'],
  '飞行机器人': ['Flying robots', 'Летающие роботы'],
  '半机械人': ['Cyborgs', 'Киборги'],
  '变异体': ['Mutants', 'Мутанты'],
  '异界生物': ['Nether creatures', 'Существа Нижнего мира'],
  '异界掘地者': ['Nether burrowers', 'Роющие существа Нижнего мира'],
  '异界散逸体': ['Nether emanations', 'Эманации Нижнего мира'],
  '米-戈': ['Mi-go', 'Ми-го'],
  '廷达罗斯猎犬': ['Hounds of Tindalos', 'Гончие Тиндала'],
  '海怪': ['Krakens', 'Кракены'],
  '恐怖之物': ['Horrors', 'Ужасы'],
  '畸变体': ['Aberrations', 'Аберрации'],
  '幻觉': ['Hallucinations', 'Галлюцинации'],
  '伊拉克斯': ['Yrax', 'Ираксы'],
  '未知': ['Unknown', 'Неизвестно'],
  '无物种': ['No species', 'Без вида'],
  '飞行器': ['Aircraft', 'Летательные аппараты'],
  '船只': ['Boats', 'Лодки'],
  '自行车与两轮车': ['Bicycles and two-wheelers', 'Велосипеды и мотоциклы'],
  '拖车与推车': ['Trailers and carts', 'Прицепы и тележки'],
  '军用与装甲': ['Military and armored', 'Военные и бронированные'],
  '卡车与大型车': ['Trucks and large vehicles', 'Грузовики и большие машины'],
  '汽车': ['Cars', 'Автомобили'],
  '区域标记（玩家划定，不可见）': ['Zones (set by the player, invisible)', 'Зоны (задаёт игрок, невидимы)'],
  '火焰与高温': ['Fire and heat', 'Огонь и жар'],
  '烟雾、气体与气味': ['Smoke, gas and smells', 'Дым, газы и запахи'],
  '血液、液体与残骸': ['Blood, liquids and remains', 'Кровь, жидкости и останки'],
  '电、光与异常': ['Electricity, light and anomalies', 'Электричество, свет и аномалии'],
  '隐藏机关（脚本触发）': ['Hidden triggers (scripted)', 'Скрытые триггеры (скрипты)'],
  '碎片与杂物': ['Shards and debris', 'Осколки и мусор'],
  '收集器': ['Collectors', 'Сборники'],

  // How objects are drawn
  '无体素模型': ['No voxel model', 'Нет воксельной модели'],
  '素材集文件': ['Voxel set file', 'Файл набора'],
  '宽 × 深 × 高 ≈ {w} × {d} × {h} 体素 · 墙高的 {wall}% · 人高的 {person}%': [
    'W × D × H ≈ {w} × {d} × {h} voxels · {wall}% of wall height · {person}% of person height',
    'Ш × Г × В ≈ {w} × {d} × {h} вокселей · {wall}% высоты стены · {person}% роста человека',
  ],
  '还没有体素模型。长方体按 CDDA 数据估算尺寸，只作参照。': [
    'No voxel model yet. The box is sized from the CDDA data, as a reference only.',
    'Воксельной модели пока нет. Размер блока оценён по данным CDDA, только для ориентира.',
  ],
  '体素素材集 {n} 个 · 模型 {m} 个': ['{n} voxel sets · {m} models', 'Воксельных наборов: {n} · моделей: {m}'],
  '模型读取失败：{error}': ['Could not read the model: {error}', 'Не удалось прочитать модель: {error}'],
  '按最长边 {l} cm、体积 {v} L 估算': ['Estimated from the longest side {l} cm and volume {v} L', 'Оценка по длине {l} см и объёму {v} л'],
  '按体积 {v} L 估算（{shape}）': ['Estimated from the volume {v} L ({shape})', 'Оценка по объёму {v} л ({shape})'],
  '直立': ['upright', 'стоя'],
  '横卧': ['lying', 'лёжа'],
  '墙、门、窗：一格宽、一层高': ['Wall, door, window: one tile wide, one z-level high', 'Стена, дверь, окно: одна клетка в ширину, один уровень в высоту'],
  '地面：一格大小的薄板': ['Ground: a thin tile-sized slab', 'Земля: тонкая плита в одну клетку'],
  '家具：CDDA 没有尺寸数据，按一格显示': ['Furniture: CDDA has no size data, shown as one tile', 'Мебель: в CDDA нет размеров, показана в одну клетку'],
  '按车身 {l} × {w} 格': ['From the body, {l} × {w} tiles', 'По корпусу: {l} × {w} клеток'],
  '载具部件：一格': ['Vehicle part: one tile', 'Деталь транспорта: одна клетка'],
  '场地效果：铺满一格': ['Field: covers one tile', 'Поле: покрывает одну клетку'],
  '陷阱：地面上的一块': ['Trap: a patch on the ground', 'Ловушка: участок на земле'],
  '没有体素模型：占位长方体': ['No voxel model: stand-in box', 'Нет воксельной модели: блок-заглушка'],
  '{w} × {d} × {h} 格（宽 × 深 × 高）': ['{w} × {d} × {h} tiles (W × D × H)', '{w} × {d} × {h} клеток (Ш × Г × В)'],
  '体素模型': ['Voxel models', 'Воксельные модели'],
  '按 id 匹配': ['matched by id', 'по id'],
  '按 looks_like 匹配：{id}': ['matched via looks_like: {id}', 'через looks_like: {id}'],
  '按原型匹配：{type}': ['matched by built-in type: {type}', 'по встроенному типу: {type}'],
  '体素素材集 {set}：{how}': ['Voxel set {set}: {how}', 'Воксельный набор {set}: {how}'],
  '这个模型来自体素素材集。要改它，请在 MagicaVoxel 里修改素材集里的文件；要换成别的模型，请修改 voxelset.json。': [
    'This model comes from a voxel set. To change it, edit the file in MagicaVoxel; to use another model, edit voxelset.json.',
    'Эта модель из воксельного набора. Чтобы изменить её, правьте файл в MagicaVoxel; чтобы заменить другой моделью, правьте voxelset.json.',
  ],
  '效果与标记': ['Effects and markers', 'Эффекты и метки'],
  '按 id 绑定': ['Bound by id', 'По id'],
  '{x} × {y} × {z} 体素（宽 × 深 × 高），{n} 个体素': ['{x} × {y} × {z} voxels (W × D × H), {n} voxels', '{x} × {y} × {z} вокселей (Ш × Г × В), всего {n}'],
  '绑定：{what}': ['Bound to: {what}', 'Привязка: {what}'],
  '文件里有 {n} 个模型，cataclysm-3d 只用第一个': ['The file holds {n} models; cataclysm-3d uses the first', 'В файле {n} моделей; cataclysm-3d берёт первую'],
  '超过 256 体素的尺寸上限': ['Larger than the 256-voxel limit', 'Больше предела в 256 вокселей'],
  '最底层是空的：模型会悬在地面上方': ['The bottom layer is empty: the model floats above the ground', 'Нижний слой пуст: модель висит над землёй'],
  '宽或深与每格体素数的奇偶不同：无法正好居中': ['Width or depth has a different parity than voxels per tile: it cannot be centered exactly', 'Ширина или глубина другой чётности, чем вокселей на клетку: точно не отцентровать'],
  '模型是空的': ['The model is empty', 'Модель пуста'],
};
