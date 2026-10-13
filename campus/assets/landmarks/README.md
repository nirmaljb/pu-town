# Campus landmark variants

These original Blender-authored details supplement the retained licensed Kenney Building Kit, Furniture Kit and City Kit Suburban foundation. They are playable, compressed interpretations of the Kalapet main campus. Architectural details and interiors are authored; they do not claim surveyed facade or floorplan accuracy.

Layout reference: Pondicherry University's [2025 campus report](https://www.pondiuni.edu.in/wp-content/uploads/2025/11/UNESCO-PondicherryUniversityRoadmaptoNetZeroCarbonby2035.pdf), Figures 1–4. District positions, roofs, ground markings and planting placements derive from `campus/rules/campus.json`; provider imagery is not embedded in shipped meshes or materials.

The seven retained masters add the library clerestory, gate identity crown, academic/residential sunshade fins, Green Energy solar modules, palm groves, pale coastal boulders and elliptical sports/Silver Jubilee markings. Common walls, roofs and furnishings remain pack-derived. Crown height is above head clearance; no unsupported ground post, collider or new walkable floor is introduced. Roof details hide with their building shell while inside.

`author.py` runs through the recorded Blender MCP request in `mcp-request.json`; `mcp-result.json` records the real successful call on Blender 5.2.2 LTS. Each model has its own separate new scene, retained editable `masters/{id}/v1/source.blend`, source/export hashes and measured triangle/material counts. The script refuses to replace an existing v1 master. Repairs should create a new revision and rebuild only its intended variants. Original pack archives and other Blender scenes remain intact.

`PUtown.Editor.CampusLandmarks.BuildAndReview` imports the FBX assets, builds `Resources/Campus/CampusLandmarks.prefab`, reports actual Unity mesh/material costs and renders all building/landmark sites in the elevated camera at 1920×1080 in Day and Night. These rendered previews are visual evidence; they do not substitute for native Player movement, interior interaction, audible media or hardware performance acceptance.

Artwork is original to the PU Town source handoff. The font used for landmark captions is Atkinson Hyperlegible under SIL OFL 1.1, bundled with its original license under `native/Assets/PUtown/Fonts/`. There are no textures in the new landmark masters. Existing pack provenance/license records remain in `campus/assets/sources/inventory.json` and `campus/assets/README.md`.
