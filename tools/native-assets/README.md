# Local asset storage

Git contains code, canonical geometry, selected smaller runtime meshes/textures,
Unity metadata, licenses, provenance and compact review evidence. Downloaded pack
archives, Blender masters, duplicate authoring exports, generated Avatar bundles
and the embedded native publication stay local. `.gitignore` excludes those
paths. Ignored files remain available in the existing workspace and packaged
builds; do not force-add them.

Install automatic guards once per local repository (including its linked
worktrees), then check manually before committing and pushing when needed:

```sh
python3 tools/install-upload-hooks.py
python3 tools/check-upload-size.py --staged
python3 tools/check-upload-size.py --base origin/HEAD
```

The installer preserves and chains existing hooks, including Git LFS. It checks
only worktrees containing this repository's size-check script. It refuses custom
`core.hooksPath` configurations rather than replacing their hooks. The history
check inspects every object in unpushed commits, including deleted files and the
payload size of Git LFS pointers. `.gitignore` alone cannot impose a size limit
or remove already tracked files.

The active Woodland Village, Market Town and five KayKit Adventurers have no
runtime texture above 5 MiB. Accordingly `large-textures.json` has an empty
`files` list; this check requires no local archive restoration:

```sh
python3 tools/native-assets/restore.py --check
```

For current source re-import or a new Avatar revision, restore the exact free
ZIPs recorded in [the town source inventory](../../towns/assets/sources/README.md),
then run:

```sh
python3 tools/native-assets/import-town-assets.py
python3 tools/native-assets/import-town-assets.py --check
```

The importer verifies full archive hashes and member CRCs, copies only selected
original inputs, and makes no network requests. Imported source meshes/textures
remain unchanged. Material channel conversion and generated environments belong
to the Unity authoring builders. Ordinary Player compilation uses the selected
smaller runtime imports retained in Git; [the native guide](../../native/README.md)
records generation and build commands.

The native HTTP Avatar publication is also local. Native Player compilation does
not need it; running a native-only backend does. Restore the reviewed private
workspace at `towns/assets/avatars/` (including immutable master bytes), or author
and review new revisions using [the workshop](../native-avatars/README.md). Pack
downloads alone do not recreate exact hashes of prior Blender masters.
Publication validates masters, reviews, identities and bundles before atomic
replacement. The Java authored-artifact integration test explicitly requires
`PU_TOWN_NATIVE_AVATAR_E2E=1`; ordinary contract tests use small fixtures.
