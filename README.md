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

## CDDA object catalog

The object list is a generated file, stored per CDDA version:
`public/data/cdda/<version>/catalog.json`. `public/data/cdda/index.json` lists the versions,
newest first; `?cdda=<version>` in the URL picks another one.

- **Coverage:** the core content (`data/json`, the `dda` mod). The only other mods enabled by
  default, `no_npc_food` and `personal_portal_storms`, add no visible objects. The catalog
  covers every terrain, furniture, item, monster, vehicle, vehicle part, field and trap id there.
- **Fields:** each object has its English name and its translated name (with the gettext context).
  Each object records its source file and has `copy-from` resolved
  (`relative`, `proportional`, `extend`, `delete`).
  - Items also carry volume, weight, longest side, types and variants.
  - Monsters also carry volume, weight and body type.
- **License:** the catalog is derived from CDDA data, so it is CC BY-SA 3.0.

To generate the catalog for another CDDA version, point `CDDA_DIR` at a checkout or install that
has `data/json` and `lang/mo`. `CDDA_LANG` picks the language; the default is `zh_CN`.

```sh
CDDA_DIR=/path/to/Cataclysm-DDA npm run catalog -- --write --version experimental-2026-11-14 \
  --commit <sha> --translations <release tag>
```

## Develop

```sh
npm test                # lint, typecheck, unit tests, build
npm run test:browser    # Playwright (needs the assets and CDDA data)
```

## Licenses

- Code: MIT (see `LICENSE`).
- Downloaded assets keep their own licenses. Each pack's `LICENSE.txt` is saved next to it.
- `public/data/cdda/`: derived from CDDA data, CC BY-SA 3.0.
