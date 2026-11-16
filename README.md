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
CDDA_DIR=/path/to/Cataclysm-DDA npm run dev
```

- `CDDA_DIR` is a CDDA checkout or install that contains `data/json`. You can also put one at
  `vendor/cdda`.
- Names come from `lang/mo/<lang>/LC_MESSAGES/cataclysm-dda.mo`. The language is `CDDA_LANG`,
  default `zh_CN`. Without a translation the English names are used.
- Edits are saved to `public/data/appearance.local.json`, which is not committed.

## Develop

```sh
npm test                # lint, typecheck, unit tests, build
npm run test:browser    # Playwright (needs the assets and CDDA data)
```

## Licenses

- Code: MIT (see `LICENSE`).
- Downloaded assets keep their own licenses. Each pack's `LICENSE.txt` is saved next to it.
- CDDA data is CC BY-SA 3.0 and is not shipped here.
