# CDDA Voxel Studio

A browser tool for building a shared 3D model library for
[Cataclysm: Dark Days Ahead](https://github.com/CleverRaven/Cataclysm-DDA).

It lists every CDDA object (terrain, furniture, items, monsters, vehicles, vehicle parts, fields,
traps) from the game's JSON data. For each object it previews the model the object resolves to,
at its size next to a reference wall and person. You can change which model an object uses and
how it is placed.

> Status: early. This is the model editor taken out of Cataclysm-Vox. Next it will read and
> write voxel sets: `voxelset.json` plus MagicaVoxel `.vox` files, the format used by
> [cataclysm-3d](https://github.com/Risaro/cataclysm-3d). It will also take higher-detail GLB
> models for the same objects. Modelling itself happens in MagicaVoxel or Blender. This tool
> previews, checks, binds models to CDDA ids and packages them.

## Run it

```sh
npm install
npm run assets          # download the open-licensed models and textures (KayKit, Quaternius, Poly Haven)
npm run dev
```

Local edits are saved to `public/data/appearance.local.json`, which is not committed.

## Languages

The interface is available in Chinese, English and Russian. The picker is in the top right. The
default follows the browser's language, and `?lang=zh_CN|en|ru` in the URL picks one directly.
Interface strings are in `src/editor/i18n.ts`.

## CDDA object catalog

The object list is a generated file, stored per CDDA version under `public/data/cdda/<version>/`:

- `catalog.json`: every object, with its English name and its gettext context.
- `names.zh_CN.json`, `names.ru.json`: object names from CDDA's official translations.
  - **Chinese:** names missing from the official translation are filled in by this project from
    `tools/editor/names/zh_CN.json`. They are flagged as unofficial (`*` in the inspector), and an
    official name replaces them once one exists.
  - **Russian:** missing names fall back to English.

`public/data/cdda/index.json` lists the versions, newest first. `?cdda=<version>` picks one.

- **Coverage:** the core content (`data/json`, the `dda` mod). The only other mods enabled by
  default, `no_npc_food` and `personal_portal_storms`, add no visible objects. The catalog covers
  every terrain, furniture, item, monster, vehicle, vehicle part, field and trap id there.
- **Fields:** for every object, the source file and the resolved `copy-from` (`relative`,
  `proportional`, `extend`, `delete`).
  - Items: volume, weight, longest side, types and variants.
  - Monsters: volume, weight and body type.
- **License:** derived from CDDA data and translations, so CC BY-SA 3.0.

To generate the catalog for a CDDA version:

```sh
node tools/fetch-translations.mjs cdda-experimental-2026-11-14-0749   # official zh_CN + ru .po
CDDA_DIR=/path/to/Cataclysm-DDA npm run catalog -- --write --version experimental-2026-11-14 \
  --translations cdda-experimental-2026-11-14-0749 --commit <sha>
npm run catalog -- --missing zh_CN --translations <tag>   # names the official translation lacks
```

`CDDA_DIR` is a CDDA checkout or install with `data/json`. The default is `vendor/cdda`.

## Develop

```sh
npm test                # lint, typecheck, unit tests, build
npm run test:browser    # Playwright (needs the assets and CDDA data)
```

## Licenses

- Code: MIT (see `LICENSE`).
- Downloaded assets keep their own licenses. Each pack's `LICENSE.txt` is saved next to it.
- `public/data/cdda/`: derived from CDDA data, CC BY-SA 3.0.
