# Sample Browser

A desktop app for browsing a large local Ableton sample library, built for the Palantir Product Design Show & Tell challenge.

## The problem

A sample library that's grown for years turns into tens of thousands of files scattered across nested vendor-pack folders. Two things make that hard to work with day to day: there's too much to browse at once to find something new, and there's no good way to hold onto a sound you already liked so you can find it again later.

## Goals

1. **Make discovery manageable** — instead of browsing an entire library at once, deliberately narrow it down to a small, chosen set of packs (a *session*) worth actually auditioning right now.
2. **Build a familiar favorites collection over time** — bookmark sounds you like as you go, so the library gets more personal and navigable the more you use it, rather than staying an undifferentiated pile of files.

## Implemented features

- **Session packs** — pick a subset of packs to work from instead of browsing the whole library. Choose packs by hand, ask for a few at random, shuffle the current selection for a fresh set at the same size, or swap out one pack at a time. A session also remembers pinned samples (see below) and autosaves as you go — no manual save step. You can have multiple named sessions and switch between them; each keeps its own pack selection and pins.
- **Favorites** — bookmark any sample with one click. Favorites are global (not tied to any one session) and persist across restarts, so a sound you liked stays easy to find later even if it isn't in your current session's packs.
- **Pins** — a short-lived shortlist for samples you're actively comparing, reachable from a tray visible in every view. Pins belong to the active session and are cleared when you start a new one.
- **Sound-type filters** — filter the current view by inferred sound type (Kick, Snare, Clap, Hat, Bass, Vocal, Melodic, FX, Cymbal, Perc, or Unclassified) and by Loops vs. One-shots. Filters are derived from filenames and folder names, not audio analysis (see Known limitations).
- **Source-pack navigation, where supported** — in any flat view (All samples, Favorites, or a session's combined pack list), each row shows which pack it came from and lets you jump straight into that pack's own folder tree. This column is hidden once you're already inside a single pack's view, since it wouldn't add anything there.
- **Full-text search and folder browsing** — search by filename within whatever you're currently viewing, or browse a pack's real folder structure in a sidebar tree with breadcrumbs.
- **Native drag-out to Ableton** — drag any sample row, or anything in the Pinned tray, straight into an Ableton track or clip slot as a real OS-level file drag.
- **Playback and Reveal in Finder** — preview any sample inline, or jump to it in Finder.

## Prerequisites

- **macOS.** The app is built and scoped for macOS only (folder-path handling and the Ableton drag-out target both assume it).
- **Node.js.** The project doesn't pin an exact version in `package.json`; a current LTS release (18 or newer) is a safe bet. Check what you have with:
  ```
  node --version
  ```
- **npm**, which ships with Node.

## Install

From the project folder:

```
npm install
```

## Run it (development)

```
npm run dev
```

This is the command to use day to day — it starts Vite, which (via `vite-plugin-electron`) compiles the Electron main/preload processes and launches the app window, with hot reload for the renderer as you edit `src/`. A window should open automatically.

Two other scripts exist in `package.json` and are worth knowing about, though neither is the normal way to run the app:

- `npm run build` — type-checks the project and produces a compiled, production-mode bundle (`dist/` for the renderer, `dist-electron/` for the main/preload processes). This does **not** package a runnable `.app` — see "Building a distributable" below.
- `npm run preview` — serves the built renderer (`dist/`) in a plain browser tab via Vite. It skips the Electron shell entirely, so folder access, native drag-out, and persisted sessions/favorites won't work there — useful only for a quick look at the UI, not for actually using the app.

## Building a distributable (macOS installer)

**Not currently supported by the existing configuration.** The project has no packaging tool installed or configured — no `electron-builder`, no `electron-forge`, and no corresponding `build` section in `package.json`. `npm run build` compiles the app's code but stops there; it doesn't produce a `.app` bundle or a `.dmg`.

To generate an actual installer, a packaging tool (most commonly `electron-builder`) would need to be added as a dev dependency and configured with a `build` section in `package.json` (app id, icon, target, etc.) — that's a setup step of its own, not something the current configuration already does.

## Trying the main workflow

1. Launch the app and click **Choose folder…**, then pick the root of your sample library.
2. You'll land on **All samples** — every WAV file found, in one flat, searchable list.
3. Switch to the **Session packs** tab. A new session starts empty; use **Choose packs** to hand-pick a few, or **Pick 3 for me** to get a random starting set.
4. Browse the packs you selected — search, filter by sound type, or drill into a pack's folder tree via the sidebar.
5. Play a sample inline; **pin** a few you're comparing, or **favorite** any you want to keep track of long-term.
6. Drag a sample (from the list or the Pinned tray) directly into an open Ableton project.
7. From the session header at the top, **Shuffle** the pack selection for a different set, or open **Edit packs** to adjust it directly; rename, duplicate, or start another session from the same menu.

## Where your data is stored

Sessions and favorites are saved to a single JSON file in Electron's standard per-app data directory, **outside the project folder and outside your sample library**:

```
~/Library/Application Support/sample-browser/store.json
```

(The folder name matches the app's package name; it would change if the app were ever packaged under a different product name.) This file holds your favorites list, your sessions (each with its selected packs, pins, and name), and the last folder you opened. Deleting it resets the app to a fresh, empty state without touching anything in your sample library.

## Does the app modify your original sample files?

**No.** Based on the actual IPC surface exposed to the app (`electron/main.ts` / `electron/preload.ts`), the only operations performed on your sample files are:

- reading a file's bytes for playback (`fs:readFile`, read-only),
- asking Finder to reveal a file (`fs:revealInFinder`),
- starting a native OS drag using the file's existing path (`drag:start`).

There is no code path that writes, renames, moves, or deletes anything inside your chosen sample folder. The only file the app writes to is its own `store.json`, described above.

## Known limitations

- **WAV files only.** The scanner only looks for `.wav` files; other formats are ignored.
- **Filename/folder-name classification only.** Sound-type tags and pack detection are both inferred from how files and folders are *named* — there's no audio content analysis, no BPM or key detection, and no AI classification at runtime. A file whose name doesn't clearly say what it is stays "Unclassified" rather than being guessed at.
- **Pack detection is heuristic.** The scanner uses naming patterns (metadata files, category-style subfolder names, common instrument/sound-label vocabulary) to decide what counts as one pack versus a folder that contains several. This works well for typically-organized libraries but can occasionally misgroup an unusually structured one.
- **macOS only** — not built or tested for Windows or Linux.
- **No packaged installer yet** — see "Building a distributable" above.

## AI disclosure

ChatGPT was used to explore workflow ideas and critique early design directions. Claude Code was used to implement the app and iterate on it through development.
