# Quaternius Standard sources

These three unmodified Standard archives were downloaded from the author's official itch.io listings on 13 October 2026 and are retained locally, excluded from Git. Their included `License_Standard.txt` files explicitly dedicate the contained assets under CC0 1.0. CRC checks passed; committed `provenance.json` records byte lengths, SHA-256 values, source URLs, license hashes and the selected model/texture counts. Selected runtime textures over 5 MiB are also local; [the restore guide](../../../../tools/native-assets/README.md) verifies them against these archives before Unity builds.

The current generic [Quaternius license page](https://quaternius.com/license.html) presents QAL v1.0 dated 28 August 2026, which restricts standalone asset redistribution. The exact downloaded archives and their individual listings carry explicit CC0 notices. We preserve that discrepancy and the original evidence instead of assuming every future Quaternius release is CC0. No paid Pro or Source edition was acquired.

- [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html): 26 selected broadleaf trees, shrubs, grass, flowers, stones and path pieces; 20 supplied PNG textures.
- [Downtown City MegaKit](https://quaternius.com/packs/downtowncitymegakit.html): 38 selected modern facade, concrete, flat roof, paving, planter and service pieces; 33 supplied root PNG textures. Alternate Unreal normal maps were not flattened into the import directory.
- [Fantasy Props MegaKit](https://quaternius.com/packs/fantasypropsmegakit.html): 31 neutral furniture, books, containers and dining props; 13 supplied PNG textures. Weapons, fantasy objects and medieval identity pieces are excluded.

`Nature-selection.json`, `City-selection.json` and `Props-selection.json` record every copied FBX/PNG path and hash and the exact material mapping read from the archive's glTF counterpart. Unity-specific FBX files are used where supplied. Models and original textures are copied without modifications to `native/Assets/Art/Quaternius/{Nature,City,Props}/`.

Material implementation uses the original albedo and normal maps. City/Props ORM files encode occlusion in R, roughness in G and metallic in B; the editor builder writes separate derived Standard maps with metallic in R and smoothness in A (`1-G`), plus grayscale occlusion from R. Source textures remain unchanged. Nature leaf/bush textures use double-sided alpha cutout; its supplied normal maps are retained. The paid Source shaders and fake interior shaders are not included in Standard.

`QuaterniusCampusBuild.Prepare` builds `CampusGarden.prefab` from the existing canonical campus rectangles. It removes art Colliders, retains exterior/furniture/Seat identifiers, and uses uniform footprint fits for furniture and plants. Facade modules and paving tiles are fitted to their architectural rectangles. The imported mesh sources remain unchanged; no hidden Game view or collision rule is widened.
