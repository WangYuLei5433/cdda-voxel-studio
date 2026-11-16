# 原型分类：CDDA 对象对应哪个体素原型

状态：待讨论（2026-11-17）

## 问题是什么

cataclysm-3d（Risaro 的项目）按以下顺序给对象找模型：

1. 精确 id
2. `looks_like` 链
3. 原型（builtin）
4. 程序化模型

它的 starter 素材集几乎全部按原型绑定。例如 `{ "builtin": "wall", "material": "brick", "file": "builtin/wall_brick.vox" }`，意思是所有砖墙都用这一个模型。

要在我们的工具里正确预览"某个对象在他的游戏里长什么样"，就得知道每个对象属于哪个原型、哪种材质。例如：

- `mon_zombie_fat` → `zombie`
- `fire_ax` → `item_blade`
- `t_wall_b` → `wall` + `brick`

## 为什么拿不到现成的表

他的项目是开源的，代码可以看、可以用。但这份对应关系在他的项目里不是数据，而是游戏运行时才执行的判断代码，位于他仓库的 `src/voxel_view.cpp`，约 800 行：

| 函数 | 行号（`875ae1f`） | 判断依据 |
| --- | --- | --- |
| `classify_terrain` | 457 | 地形 id、标志、符号 → 原型 + 材质 |
| `classify_furniture` / `classify_furniture_extra` | 809 / 929 | 家具 id、标志 |
| `monster_key` | 1128 | 物种、体型、id → zombie / quadruped / bird … |
| `item_kind` | 1249 | 是否枪、弹药、书、护甲、食物，再看 id 关键词（`knife`、`axe` …） |

我们的工具是网页（TypeScript），不能直接运行他的 C++。

## 两种办法

### A. 把判断逻辑移植成 TypeScript

- 优点：马上能做，不依赖任何人。
- 缺点：
  - 他改了规则，我们要手动跟着改，不然两边会慢慢对不上。
  - 移植来的代码属于他代码的衍生作品，按 CDDA 的 CC BY-SA 3.0 必须用同样的许可证，和我们工具代码采用的 MIT 混在一起。

### B. 用他的代码把结果"导出"成一张表（推荐）

"导出"指的是：让他的游戏加载完数据后，把每个对象都跑一遍他的判断函数，结果写成 JSON，例如：

```json
{ "monster": { "mon_zombie_fat": { "builtin": "zombie" } },
  "ter": { "t_wall_b": { "builtin": "wall", "material": "brick" } },
  "item": { "fire_ax": { "builtin": "item_blade" } } }
```

这件事不需要 Risaro 本人来做。他的项目开源，我们可以自己做：

1. 在 GitHub 上 fork 他的仓库，加一个命令行参数，例如 `--dump-voxel-kinds`。游戏加载数据后遍历地形、家具、生物、物品，调用上表里的函数，写出 JSON 后退出。估计约 100 行，CDDA 已有类似的数据导出模式可以参照。
2. 在本机编译原生版本并运行一次，生成 `builtin-kinds.json`，提交到工具的 `public/data/cdda/<版本>/` 下。按 CC BY-SA 3.0 标注来源，和对象表一样。
3. 他的规则有更新时，拉取他的最新代码，重跑一次。

再给他提一个 PR：他合并后，导出功能由他的项目维护，规则改了也会保证导出还能用。即使暂不合并，我们的 fork 也能用。

- 优点：结果和他的游戏完全一致；我们的代码里没有他的代码，许可证互不干扰。
- 缺点：
  - 要编译原生版 CDDA，第一次十几分钟。
  - 他的 fork 基于的 CDDA 版本可能和我们对象表的版本（`7136388`）不同，只有两边都有的 id 才能对上。

## 待讨论

- 走 A 还是 B。
- 选 B 的话：fork 和 PR 会公开显示在 GitHub 上，是否先和 Risaro 打个招呼。
- 他的 fork 基于哪个 CDDA 版本，要不要让两边对齐到同一版本。
