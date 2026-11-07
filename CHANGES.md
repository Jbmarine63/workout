Share link: More → Share this app sends https://jbmarine63.github.io/workout/

- Share uses the system share sheet when navigator.share is available, in a
  Safari tab and in the Home Screen app. The call starts inside the tap.
- Copy link copies that address. Closing the share sheet does nothing else.
  If the clipboard is missing or denied, the address is shown so it can be
  copied by hand. Workout logs, GIFs and credits are unchanged.
- Service worker cache rebuilt so installed copies show "Update ready".

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
