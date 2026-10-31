# Six Pack Workout — iPhone web app (PWA)

An offline web app version of the Android "Workout" app (v1.2) with the **16 Weeks to Six Pack Abs**
program from the archived iwantsixpackabs.com (2007). Static files only. There's no build step and no CDN,
and every path is relative, so it runs from any folder, including a GitHub Pages subpath like
`https://<user>.github.io/workout/`.

## Install on iPhone

1. Open the app's link in **Safari**. Other browsers on iPhone can't install web apps as reliably.
2. Wait a few seconds on the first visit while it saves everything (GIFs included) for offline use.
3. Tap the **Share** button (the square with the arrow pointing up).
4. Scroll down, tap **Add to Home Screen**, then tap **Add**.
5. Open **Workout** from the Home Screen. It runs full-screen and works with no signal.

Always open it from the Home Screen icon, not from a Safari tab (see "Limitations").

## What's in it

- **Program tab:** pick weeks 1–16, then a day.
  - **Mon/Wed/Fri (resistance):** the week's routine in the page's order, with superset/circuit labels,
    sets/rounds, reps, work times and rest. Inside a superset there's no rest; rest comes after the pair
    (or after each exercise in the week 4–6 circuits). **Start** loads that day into an editable workout.
  - **Week header:** the site's substitution tips quoted word for word, the app notes on what the source is
    missing, circuit levels, the original instructions, and journal photos for weeks 14–16.
  - **Tue/Thu/Sat (optional interval cardio):** the week's prescription, the site's rules, and a guided
    interval timer (warm-up, then N × high/moderate, then cool-down), plus a log entry: activity, warm-up,
    rounds, work/rest seconds, cool-down, duration, notes, and done.
  - **Sunday:** rest.
- **Exercises tab:** a free-scroll library of about 150 exercises with search, muscle-group filters, GIF demos
  and how-to text. **＋ Add** puts an exercise into the current workout (or starts one).
- **Workout tab:** a fully editable session.
  - Add, swap, move up/down, edit (name, group code, sets, reps, rest, work time, notes), or remove an
    exercise. Removing one asks for confirmation if it has logged sets.
  - Log sets (reps, lb, RPE) and edit or delete them.
  - Prompts after each set: "No rest inside the superset — go to A2", or "Rest 60s, then A1 (round 2 of 3)".
  - Rest and work timers with pause, ±15 s and skip. They run on timestamps, so they keep the right time when
    the app is in the background or reloaded, and the timer state is saved.
  - At zero: a Web Audio beep, plus vibration where the device supports it. Android does, iPhone doesn't.
  - Optional screen wake lock while a timer runs (iOS 16.4+).
- **History:** workouts and interval cardio in one list, with All/Workouts/Cardio filters. Tap an entry to
  view or edit it; deleting asks for confirmation.
- **More:**
  - **Backup:** Share/save JSON through the iOS share sheet ("Save to Files"), Download JSON, or Export CSV.
  - **Restore:** from JSON, with a choice of **Merge** (skips entries you already have) or **Replace**
    (asks a second time).
  - **Settings:** theme (match phone, dark or light), keep the screen awake, and storage status.
  - **Reading:** the site's articles (interval training, eating, pull-up alternatives) and the journal photos.
- **Offline:** the service worker precaches every file: all 60 GIFs, `data/program16.json`, the photos and the
  articles. Cache names are versioned by a content hash. Data is stored in IndexedDB, and the app asks for
  `navigator.storage.persist()`.
- **First launch:** iPhone Safari shows an "Add to Home Screen" hint until it's dismissed.

## Limitations

- **No timer alerts with the screen locked or the app closed.** iOS pauses web apps in the background and has
  no scheduled local notifications. The timer shows the right time when you come back, and beeps if it's
  open. Turn on "Keep the screen on" for workouts.
- **No vibration on iPhone.** Safari doesn't support `navigator.vibrate`. You get the beep, which is silenced
  if the ring/silent switch is on silent for some iOS versions.
- **No sync** with the Android app or between devices. Logs live only on the phone, so use Backup to move or
  save them. The Android app's database can't be imported.
- **Data safety:** if the site is only used inside Safari tabs (not added to the Home Screen), iOS can delete
  its storage after about 7 days of not being used. Installed Home Screen apps are exempt. Deleting the
  Home Screen app also deletes its data. Export backups regularly.
- **Source gaps:** the original videos were Flash embeds and weren't archived. Weeks 7 and 11–16 had no demo
  GIFs of their own, so they borrow the same or similar GIFs from other weeks (labeled), and some exercises
  have no demo. Each week's app notes list these gaps.
- **Exports on iPhone:** a standalone web app can't download files the normal way, so the share sheet is used.
  If it doesn't appear, use **Download** from Safari.

## Updating

Edit files, then run `python3 tools/build_sw.py`. This regenerates `sw.js` with the full precache list and a
new cache version. Installed copies show an "Update ready — Reload" banner the next time they're opened
online.

## Layout

```
index.html  manifest.webmanifest  sw.js  .nojekyll
css/app.css            js/app.js (all app logic, plain JS)
data/program16.json    data/workouts.json  data/seed_exercises.json   (same files as the Android assets)
demos/*.gif (60)       journal_images/*.jpg (6)   articles/*.txt (3)
icons/ (180, 192, 512, maskable 512, apple-touch-icon)
tools/build_sw.py  tools/sw.template.js  tools/test/e2e.mjs (Playwright test)
```

## Testing

Serve the folder from a subpath (for example `python3 -m http.server` one level up), then run
`node tools/test/e2e.mjs` with Playwright installed. The test emulates an iPhone 13 viewport.
Edit the `BASE` constant to match where you're serving it.
