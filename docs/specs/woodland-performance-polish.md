# Woodland square and native performance

Implement the owner's requested first performance and visual slice from
`f754d9584ca042b399e7687bfa4ba49d24c9e141`, the generated-town branch tip on
14 October 2026. The rejected campus attempt supplies no implementation or
performance baseline for this work.

The visual review area is Woodland Village's Meeting Area and its west street
approach. Use the current Quaternius town assets and KayKit publication. Keep the
canonical Watabou streets, building footprints, Seats, movement constants,
non-enterable buildings and disabled Tasks. Presentation surfaces must add no
movement or visibility authority.

- Replace repeated road slabs and overlapping square tiles with continuous
  surfaces, joining street bends and retaining readable stone scale. The shared
  paving builder may serve both fixed native towns.
- Give the Woodland square a deliberate contour, a paved connection across the
  open west approach, textured meadow/earth transitions, and edge planting that
  leaves the Meeting Area and approach readable.
- Investigate the packaged runtime before asserting performance gains. Reduce
  avoidable frame work, preserve short-stall walking distance with bounded
  collision-checked prediction, and stop the walking state when blocked.
- Make benchmark evidence distinguish monotonic-clock stalls, Unity intervals,
  focus state, and available CPU/allocation/render counters. Add development
  profiling markers and a profile build without adding release control APIs.

The owner agreed to tests at LocalPrediction.Update, the generated town prefab,
and the benchmark report. Use red/green tests at those seams; verify recovery,
Night freeze and building collision through existing native boundaries. Inspect
actual Unity renders, run the full affected EditMode suite, build macOS/Windows,
and exercise the packaged native movement/recovery path with a real local server.
Record hardware/workload and unresolved limits separately from tests or builds.

Finish with independent Standards and Spec reviews against the starting commit,
the staged upload-size check, and a commit on this work branch. Map controls,
perimeter-wall authoring and broader town/animation changes are subsequent slices.
