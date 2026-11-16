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
  '模型库': ['Model library', 'Библиотека моделей'],

  // Status
  '本地覆盖': ['Local override', 'Локальная замена'],
  '材质回退': ['Material fallback', 'Запасной материал'],
  '基础模型': ['Base model', 'Базовая модель'],
  '仅贴图': ['Texture only', 'Только текстура'],
  '程序生成': ['Procedural', 'Процедурная'],
  '游戏中不显示': ['Not drawn in game', 'Не отображается в игре'],
  '无模型': ['No model', 'Нет модели'],

  // Inspector: identity
  '极小': ['tiny', 'крошечный'],
  '小': ['small', 'маленький'],
  '中': ['medium', 'средний'],
  '大': ['large', 'большой'],
  '巨大': ['huge', 'огромный'],
  '本地覆盖（编辑器保存）': ['Local override (saved by the studio)', 'Локальная замена (сохранена в студии)'],
  '精确 id 条目': ['Exact id entry', 'Запись по точному id'],
  '外观规则': ['Appearance rule', 'Правило внешнего вида'],
  '无匹配': ['No match', 'Нет совпадений'],
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
  '来源': ['Source', 'Источник'],
  '无模型（生物方案）': ['No model (creature plan)', 'Нет модели (план существа)'],
  '模型来源': ['Model from', 'Модель из'],
  '没有模型规则，只用贴图': ['No model rule, texture only', 'Нет правила модели, только текстура'],
  '没有模型规则': ['No model rule', 'Нет правила модели'],
  '（第 {n} 条）': [' (#{n})', ' (№{n})'],
  '模型键': ['Model key', 'Ключ модели'],
  '文件': ['File', 'Файл'],
  '贴图': ['Texture', 'Текстура'],
  '摆放缩放': ['Placement scale', 'Масштаб размещения'],
  '游戏中的样子': ['How it looks in game', 'Как выглядит в игре'],
  '外观规则（被生物方案取代）': ['Appearance rule (replaced by the creature plan)', 'Правило внешнего вида (заменено планом существа)'],
  '匹配的规则': ['Matching rule', 'Подходящее правило'],
  '模型条目': ['Model entry', 'Запись модели'],
  '贴图规则': ['Texture rule', 'Правило текстуры'],

  // Measurements
  '没有可测量的模型': ['Nothing to measure', 'Нечего измерять'],
  '格': ['tiles', 'клеток'],
  '宽 × 深 × 高 ≈ {w} × {d} × {h} 米 · 墙高的 {wall}% · 人高的 {person}%': [
    'W × D × H ≈ {w} × {d} × {h} m · {wall}% of wall height · {person}% of person height',
    'Ш × Г × В ≈ {w} × {d} × {h} м · {wall}% высоты стены · {person}% роста человека',
  ],
  '低于地面 {n} 格': ['{n} tiles below the ground', 'на {n} клеток ниже земли'],

  // Inspector: edit form
  '编辑（只影响这一个对象）': ['Edit (this object only)', 'Правка (только этот объект)'],
  '模型': ['Model', 'Модель'],
  '模型键，可搜索': ['Model key, searchable', 'Ключ модели, с поиском'],
  '缩放': ['Scale', 'Масштаб'],
  '目标高度': ['Target height', 'Нужная высота'],
  '米': ['m', 'м'],
  '按高度设缩放': ['Scale to height', 'Масштаб по высоте'],
  '转向': ['Rotation', 'Поворот'],
  '抬高': ['Raise', 'Подъём'],
  '摆放': ['Placement', 'Размещение'],
  '平放': ['Lie flat', 'Положить плашмя'],
  '按 CDDA 颜色染色': ['Tint with the CDDA color', 'Окрасить цветом CDDA'],
  '保存': ['Save', 'Сохранить'],
  '放弃修改': ['Discard changes', 'Отменить правки'],
  '恢复默认': ['Reset to default', 'Сбросить'],
  '修改即时预览；保存写入 public/data/appearance.local.json（只在本地，不提交）。': [
    'Changes preview at once; Save writes public/data/appearance.local.json (local only, not committed).',
    'Правки видны сразу; «Сохранить» записывает public/data/appearance.local.json (только локально, не коммитится).',
  ],
  '使用这个模型的对象（{n}）': ['Objects using this model ({n})', 'Объекты с этой моделью ({n})'],
  '编辑': ['Edit', 'Правка'],
  '游戏不为这一类对象查找模型（见上方说明），这里只能查看。需要给它换模型时，要先让游戏支持这一类。': [
    'The game does not look up models for this kind of object (see the notes above), so it can only be viewed here. To give it a model, the game first has to support this kind.',
    'Игра не ищет модели для объектов этого типа (см. примечания выше), здесь их можно только смотреть. Чтобы задать модель, игра сначала должна поддерживать этот тип.',
  ],

  // Header, list and toolbar
  '墙高 {wall} 格 · 人高 {person} 格': ['Wall {wall} tiles · person {person} tiles', 'Стена {wall} клеток · человек {person} клеток'],
  '基础素材 · {n} 个模型': ['Base assets · {n} models', 'Базовые ресурсы · моделей: {n}'],
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
  '待机': ['Idle', 'Покой'],
  '行走': ['Walk', 'Ходьба'],
  '攻击': ['Attack', 'Атака'],
  '受击': ['Hit', 'Удар'],
  '死亡': ['Die', 'Смерть'],
  '视角': ['View', 'Вид'],
  '动画': ['Animation', 'Анимация'],
  '没有模型键 {key}': ['No model key {key}', 'Нет ключа модели {key}'],
  '请选择模型': ['Choose a model', 'Выберите модель'],
  '保存需要开发服务器（npm run dev）': ['Saving needs the dev server (npm run dev)', 'Для сохранения нужен dev-сервер (npm run dev)'],
  '保存失败：{error}': ['Save failed: {error}', 'Не удалось сохранить: {error}'],
  '有未保存的修改': ['Unsaved changes', 'Есть несохранённые правки'],
  '本地覆盖 {n} 项': ['{n} local overrides', 'Локальных замен: {n}'],
  '（只读）': [' (read-only)', ' (только чтение)'],
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
  '基础素材': ['Base assets', 'Базовые ресурсы'],

  // How objects are drawn
  '车轮：底板 + 轮子': ['wheel: floor + wheel', 'колесо: днище + колесо'],
  '车窗：车身块 + 玻璃': ['window: body block + glass', 'окно: блок корпуса + стекло'],
  '座椅 / 床：底板 + 座垫': ['seat / bed: floor + cushion', 'сиденье / кровать: днище + подушка'],
  '车门：车身块': ['door: body block', 'дверь: блок корпуса'],
  '货舱 / 引擎 / 炮塔 / 油箱：车身块': ['cargo / engine / turret / tank: body block', 'багажник / двигатель / турель / бак: блок корпуса'],
  '其他部件：底板': ['other parts: floor', 'прочие детали: днище'],
  '程序方块（{what}）': ['Procedural blocks ({what})', 'Процедурные блоки ({what})'],
  '游戏不给单个载具部件找模型：整车有模型且不少于 6 格时画整车模型，否则每格按部件标志画方块（车轮、车窗、座椅、车门、货舱…）': [
    'The game does not look up models for single vehicle parts: a vehicle of 6 or more tiles with a model is drawn whole, otherwise each tile is a block chosen by the part flags (wheel, window, seat, door, cargo…).',
    'Игра не ищет модели для отдельных деталей: транспорт от 6 клеток с моделью рисуется целиком, иначе каждая клетка — блок по флагам детали (колесо, окно, сиденье, дверь, багажник…).',
  ],
  '安装位置：{where}': ['Mount location: {where}', 'Место установки: {where}'],
  '贴图 {key}': ['Texture {key}', 'Текстура {key}'],
  '半透明色块': ['Translucent slab', 'Полупрозрачная плитка'],
  '强度 {n}（变体按钮切换 1–3）：游戏按强度把色块放大到 0.67–1.01 格': [
    'Intensity {n} (the variant buttons switch 1–3): the game sizes the slab by intensity, 0.67–1.01 tiles',
    'Интенсивность {n} (кнопки вариантов переключают 1–3): игра увеличивает плитку по интенсивности до 0,67–1,01 клетки',
  ],
  '形态：{phase}': ['Phase: {phase}', 'Состояние: {phase}'],
  '不绘制': ['Not drawn', 'Не рисуется'],
  '隐藏机关：只由脚本触发，CDDA 中也不可见': ['Hidden trigger: fired by scripts only, invisible in CDDA too', 'Скрытый триггер: срабатывает только из скриптов, в CDDA тоже невидим'],
  '游戏的 3D 画面目前不画陷阱（快照里有陷阱数据，只用于自动寻路避让）': [
    'The 3D view does not draw traps yet (trap data is only used to path around them).',
    'Трёхмерный вид пока не рисует ловушки (данные о них используются только для обхода).',
  ],
  '规则有 {n} 个变体，游戏按格子位置挑选': ['The rule has {n} variants; the game picks by tile position', 'У правила {n} вариантов; игра выбирает по положению клетки'],
  '游戏按车身长度缩放：{n} 格 × 0.95；少于 6 格的车按部件绘制': [
    'The game scales by body length: {n} tiles × 0.95; vehicles under 6 tiles are drawn part by part',
    'Игра масштабирует по длине корпуса: {n} клеток × 0,95; транспорт короче 6 клеток рисуется по деталям',
  ],
  '无整车模型（按部件绘制）': ['No whole-vehicle model (drawn part by part)', 'Нет модели целиком (рисуется по деталям)'],
  '模型 {key}': ['Model {key}', 'Модель {key}'],
  '游戏中每格随机缩放 80%–100%（此处为 100%）': ['In game each tile is scaled randomly to 80%–100% (100% here)', 'В игре каждая клетка случайно масштабируется на 80–100% (здесь 100%)'],
  '树木、灌木、岩石在游戏中随机转向': ['Trees, shrubs and rocks are rotated randomly in game', 'Деревья, кусты и камни в игре случайно повёрнуты'],
  '门和窗由程序生成（门板、门框、窗台），不使用模型': ['Doors and windows are procedural (leaf, frame, sill), not models', 'Двери и окна процедурные (полотно, рама, подоконник), без моделей'],
  '纯色': ['Plain color', 'Сплошной цвет'],
  '地上物品在游戏中随机转向，并偏离格子中心 0.18 格': ['Items on the ground are rotated randomly and offset 0.18 tiles from the tile center', 'Предметы на земле случайно повёрнуты и смещены на 0,18 клетки от центра'],
  '无模型：游戏中画为程序方块': ['No model: drawn as a procedural block in game', 'Нет модели: в игре рисуется процедурным блоком'],
  '无模型：游戏中画为小方块': ['No model: drawn as a small block in game', 'Нет модели: в игре рисуется маленьким блоком'],
  '按水平最长边缩放到 {n} 格（fit）': ['Scaled so the longest horizontal side is {n} tiles (fit)', 'Масштаб по длинной горизонтальной стороне: {n} клеток (fit)'],
  '固定缩放 {n}': ['Fixed scale {n}', 'Фиксированный масштаб {n}'],
  '平放（lieFlat）': ['Lies flat (lieFlat)', 'Лежит плашмя (lieFlat)'],
  '按需加载（lazy）': ['Loaded on demand (lazy)', 'Загружается по требованию (lazy)'],
  '未知模型': ['Unknown model', 'Неизвестная модель'],
  '本地覆盖 · 模型 {key}': ['Local override · model {key}', 'Локальная замена · модель {key}'],
  '无模型（占位胶囊）': ['No model (placeholder capsule)', 'Нет модели (капсула-заглушка)'],
};
