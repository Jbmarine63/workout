PWA 1.5.1: color schemes (matches Android 1.5.1, versionCode 8)

- More → Settings → Color scheme: Default (orange/blue), Marine (scarlet/gold), Army (olive drab/tan),
  Navy (navy/gold), Air Force (ultramarine/silver). Only the accent and secondary ("done") colors
  change; the Dark / Light / Match phone picker works as before and applies to every scheme.
- Same names, order and hex values as the Android app. Every scheme × mode passes WCAG AA (4.5:1)
  for text on accent buttons and accent/secondary-colored text. Default light's orange is a little
  darker (#e8650f → #c2410c) so white button text passes too.
- Saved in the existing settings record (no new store, IndexedDB stays version 2); unknown values
  fall back to Default. Included in backups with the other settings.
- tools/test/themes.mjs: headless test for the picker, CSS variables, persistence and fallback.

PWA 1.5: matches Android 1.5 — Recovery, stretching, cardio log, trackers, stats, backup v2

- New Recovery tab (5 tabs): tick knees, ankles/feet, hips, lower back or shoulders
  (12 exercises each, early → late). Each area has
  leveled exercises (19 credited public-domain/CC GIFs in recovery/), a pain slider (0–10) with
  stop/continue guidance, red flags, sources and a "not medical advice" note. Checked areas swap
  matching program moves (after Road mode) and the workout shows "Recovery swap (area) for: …".
- Stretch: dynamic warm-up and static stretches with a guided timer. Routines: 4 short routines
  (spoken cues, screen awake) that log to Stats when finished.
- Cardio log (Today → Cardio): suggestions for jump rope, jogging, walking, sprints, Tabata and
  HIIT, or any type you type; minutes, optional distance (mi/km), notes.
- Trackers (More): weight and body measurements, daily habits and water, private progress photos
  (kept in this browser's storage, downscaled, never uploaded). Health apps: manual entry on iPhone;
  the Android app can read Samsung Health data through Health Connect.
- Stats: totals, streaks, 12-week calendar, weekly volume, badges, PRs with estimated 1RM. The
  workout screen shows a progress hint and e1RM; Swap now covers the rest of the workout.
- Today: resume banner for an unfinished workout, "Train anyway" on rest days, recovery status.
- Backup format 2 (adds trackers, habits and recovery logs; photos listed without images), checked
  before import, with a safety copy kept before anything changes. CSV gains distance and pain.
- IndexedDB version 2 adds stores only; 1.4 data is untouched (tested with a real v1 database and
  the 1.4 → 1.5 service-worker update).
- privacy.html: the v1.5 privacy policy (also used by the Android Health Connect rationale screen).
- sw.js: privacy.html opens as itself offline; 142 precached URLs (118 GIFs).

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
