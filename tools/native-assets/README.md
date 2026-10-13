# Local asset storage

Git contains code, canonical geometry, selected smaller runtime meshes/textures,
Unity metadata, licenses, provenance and compact review evidence. Downloaded pack
archives, Blender masters, duplicate authoring exports, generated Avatar bundles,
the embedded native publication and ten original textures over 5 MiB stay local.
`.gitignore` excludes those paths. Ignored files remain available in the existing
workspace and packaged builds.

Install automatic guards once per local repository (including its linked
worktrees), then check manually before committing and pushing when needed:

```sh
python3 tools/install-upload-hooks.py
python3 tools/check-upload-size.py --staged
python3 tools/check-upload-size.py --base origin/HEAD
```

The installer preserves and chains existing hooks, including Git LFS. It checks
only worktrees containing this repository's size-check script. It refuses custom
`core.hooksPath` configurations rather than replacing their hooks.

The second check inspects every object in the unpushed history, including deleted
files and the payload size of Git LFS pointers. `.gitignore` alone cannot impose a
size limit or remove already tracked files. Do not force-add excluded artifacts.

Before opening or building Unity from a fresh clone, download the exact free
Standard releases recorded in the [environment inventory](../../campus/assets/sources/quaternius/README.md)
and [character inventory](../../campus/assets/sources/quaternius-character/README.md).
For the ten large runtime textures, only Nature, City, Props and Modular Character
Outfits — Fantasy are needed. Place each original ZIP at the path recorded in
`large-textures.json`, then run:

```sh
python3 tools/native-assets/restore.py
python3 tools/native-assets/restore.py --check
```

The helper verifies complete archive and member hashes, restores only named
original textures, preserves their committed Unity `.meta` identities, and makes
no network requests. It does not alter or compress the source images.

The native HTTP Avatar publication is also local. Native Player compilation does
not need it; running a native-only backend does. Restore the previously reviewed
private Avatar workspace (including immutable master bytes), or author and review
new revisions using [the workshop](../native-avatars/README.md). Pack downloads
alone do not recreate the exact hashes of prior Blender masters. Publication
continues to validate masters, reviews, identities and bundles before atomic
replacement. The Java authored-artifact integration test explicitly requires
`PU_TOWN_NATIVE_AVATAR_E2E=1`; the ordinary contract tests use small fixtures.
