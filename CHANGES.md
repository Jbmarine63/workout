PWA 1.4: match Android 1.4 demo GIFs, labels, Road mode fixes and Credits

- Add the 39 demo GIFs from Android 1.4 (demos/, 99 total). Program entries
  without a GIF: 35 -> 3. Update data/program16.json and data/seed_exercises.json to the
  Android 1.4 files (demoGif, demoMatch incl. "library", demoSource, demoNote,
  libraryDemos, demoSources, demoSourceLabels, nameAliases).
- Label demos like Android: "Demo from FitnessGenerator library" / LottieFiles /
  Wikimedia Commons / ExerciseDB, "Similar exercise (demo from ...)",
  "Demo from another week (same exercise)", "Similar demo (Road swap: shows ...)".
  The Exercises tab shows the GIF's source.
- Library: the gym lifts, Walking Lunge, Plank and Pull-Up get GIFs; the site's misspelled
  names resolve to the right exercise (nameAliases); "similar" GIFs stay out of the library.
  Library entries without a GIF: 85 -> 54 of 149.
- Fixes: same-exercise GIFs reach library entries (plus aliases); V-ups and Mountain climbers
  Road swaps get GIFs; the Program screen's Demo label follows Road mode and Road swap demos
  are labelled as similar demos.
- Existing installs: idempotent upgradeDemos() on start updates only demoAsset/demoNote
  on saved workouts (never removes a GIF; sets, notes, names and dates untouched).
- Add More -> Settings -> "Credits & licenses" (same content as Android, with real links)
  and a "Workout 1.4" version label (APP_VERSION 1.4).
- Rebuild sw.js (new cache name; 121 precached URLs incl. all 99 GIFs) so installed copies
  show "Update ready". build_sw.py skips CHANGES.md.
- README: 1.4 section, drop the "v1.2" wording; add tools/test/v14-upgrade.mjs
  (old -> new service-worker update with seeded logs, GIF resolution, Road demo, Credits).
