# Sample Browser — Design Notes & Interface Reference

A running reference for the Sample Browser project (built for the Palantir Product Design Show & Tell challenge): what the app is for, how it's put together today, and the reasoning behind the decisions that got it there. Written to be read on its own, without the chat history behind it.

## 1. The problem this app solves

Ableton sample libraries built up over years turn into tens of thousands of WAV files scattered across nested vendor-pack folders — in this project's case, over 53,000 files. Two problems compound: you can't hold that much in your head while writing music, and Ableton's own file browser gives you no way to narrow the working set down. The app's job is to sit next to Ableton as a lightweight, always-current index of that library, and to give you a way to deliberately shrink "everything" down to a small pool worth actually auditioning for a given session — without ever touching or reorganizing the files themselves.

## 2. Core concepts

- **Library** — every sample under the chosen root folder. Shared, global, read-only from the app's point of view; nothing here is session-specific.
- **Pack** — a folder the scanner identifies as one distributed sample pack (a vendor's product, or a well-organized personal kit). Detection is filename/folder-name heuristics only — see §6.
- **Favorite** — a durable, cross-session bookmark on an individual sample. Global, not tied to any one working session.
- **Session** — a lightweight, named working context: a chosen subset of packs, plus whatever you've pinned while browsing them. Explicitly *not* a saved Ableton project or a snapshot of an actual Ableton session — it's a browsing aid that happens to autosave, named that way because it maps to "the thing you're working on right now."
- **Session packs** — the pack subset currently selected for the active session. This is the deliberate "shrink the haystack" step: instead of browsing all 53,000 files, you pick a handful of packs to draw from.
- **Pinned** — a short-lived shortlist of specific samples you're actively comparing or considering, reachable from anywhere while you browse. Per-session (see §5) — a fresh session starts with an empty pin tray.

## 3. Interface tour

### Top bar
Brand mark and app name on the left; the current library folder (abbreviated, full path on hover) and a "Change folder…" button on the right. A status line appears transiently under this row during a scan ("Found 53,090 WAV file(s)").

### Session header
One row, directly above the three scope tabs, visible no matter which tab you're on: a bold title button showing the active session's name with a chevron, plus small secondary text next to it that only appears while something is actually happening — "Saving…" while an autosave is in flight, or "Couldn't save · Retry" if one fails. Nothing is shown once a save has completed; there's no persistent "Saved" label competing for attention.

Clicking the title opens an anchored popover — the *only* way to switch, create, rename, duplicate, or delete a session:

- **New session** at the top.
- Your sessions, most-recently-used first, each row showing a checkmark on the active one and its pack count spelled out ("3 packs") as secondary text.
- A divider, then **Rename / Duplicate / Delete** for the active session.

The popover is keyboard-navigable (arrow keys move focus, Home/End jump to the ends, Escape or Tab-out closes it) and dismisses on an outside click. Rename swaps the title button for a small text input in place — Enter commits, Escape cancels.

### Scope tabs
Three pills: **All samples**, **Favorites (N)**, **Session packs (N)**. One flat browsing surface, three different pools of samples feeding it — not three different apps.

### Pinned tray
A slim, persistent strip beneath the tabs, present in every scope. Collapses to a quiet "Pinned · 0" label when empty; expands into a row of chips (each playable, draggable, and removable) once you've pinned something. Because pins are per-session, this tray's contents change when you switch sessions.

### Browsing toolbar
One consistent row: a leading control (a Back arrow when you've drilled into a pack, or a Folders toggle on the All samples tab) followed by the search field. This row never changes shape or width between tabs, and its controls never shift position when the Folders sidebar opens or closes — the search box is always exactly where you left it.

### Sidebar (260px, appears/collapses per scope)
Shown for a focused pack, for All samples with the Folders toggle on, and for Session packs whenever the session isn't empty. On Session packs specifically, the sidebar carries its own small header, deliberately separate from the session-switching popover above:

- **Session packs · N**
- Two compact buttons: **Shuffle** (redraws N new random packs, replacing the current selection at the same count) and a pencil-icon **Edit packs** button.
- Below that: an "All session samples" root row, then each selected pack's real folder tree (chevrons expand/collapse; clicking a name flattens everything under it into the results column).

Session switching lives in the header; pack editing lives in the sidebar — the two are kept visually apart on purpose so "which working set am I in" and "what's in this working set" don't get tangled into one control.

### Results column
Everything describing "what you're looking at" lives here, aligned to the column rather than spanning the sidebar too: a breadcrumb trail when focused on a pack/folder, the Sound type filter chips (wraps onto additional lines instead of clipping or silently scrolling), a Loops/One-shots toggle, a live result count, and the virtualized sample table itself.

Each row: play/stop, name with an inline type tag (Kick, Bass, Melodic, …), the source pack (as a link, when not already inside that pack), pin, favorite, and reveal-in-Finder. Rows are natively draggable straight into Ableton — the same drag affordance works from the Pinned tray.

### Edit packs modal
Opened from the sidebar. Search/checkbox-select/deselect any pack, "Pick for me" a chosen number of random packs, swap one selected pack for a different random one, or deselect everything. Every change autosaves the moment it happens — there's no separate Save button in this modal or anywhere else in the app.

### Empty-session state
A brand-new session (or one you've just cleared) replaces the sidebar-and-table row entirely with a centered, inviting prompt: "Choose a few packs to explore," a line explaining that favorites still work everywhere and the selection can change anytime, then **Choose packs** / **Pick 3 for me** buttons and a **Browse all samples instead** link. The instructional copy that would otherwise need to live permanently in the UI only shows up at the one moment it's actually relevant.

## 4. Core workflows

1. **First run** — choose a folder, the app scans it and detects packs, and you land on All samples with everything visible and unfiltered.
2. **Starting a session** — a new session begins with zero packs and zero pins. Instead of a blank table, you get the empty-session prompt: hand-pick packs, ask for three at random, or skip straight to browsing the full library.
3. **Narrowing the pool** — from Session packs, use the sidebar tree or the search/filter row to move from "everything in this session" down to one pack, one folder inside it, or one sound type.
4. **Auditioning** — play samples inline; pin the ones worth comparing side by side (the Pinned tray follows you across scopes); favorite anything worth keeping permanently, independent of the current session.
5. **Reshuffling** — not vibing with the current pack selection? Shuffle draws a fresh random set at the same size. Swap (inside Edit packs) replaces just one pack. Both are one click, no manual reselection.
6. **Dragging into Ableton** — drag any row, or any pinned chip, straight out of the app and into an Ableton track/clip slot — a native OS file drag, not a copy-paste workaround.
7. **Branching or switching contexts** — Duplicate a session to try a variant without disturbing the original; switch sessions from the header popover and the whole working context (packs *and* pins) comes back exactly as you left it.

## 5. Design decisions and why

### Sessions are lightweight, not Ableton projects
Explicitly scoped as a browsing aid, not a stand-in for Ableton's own project files — nothing about a session reads or writes an `.als`. This kept the feature honest about what it actually does (organizes *your browsing*) instead of implying a deeper integration that wasn't being built.

### Autosave, no manual Save
Early iterations had "Save" and "Save as new" actions in the session bar. These were removed in favor of writing through on every change, with save state surfaced as small secondary text (Saving… / a retry link on failure) rather than a button you have to remember to press. A project file mental model invites forgetting to save; a browsing tool shouldn't have that failure mode at all.

### Pins and packs are per-session; favorites and the library are global
This split maps directly to how the two are actually used: favorites are a durable "keep forever" bookmark you'd be upset to lose when switching contexts, while pins are a working shortlist that only makes sense in the context of *this* session's pack selection. Early on, pins were accidentally global, which meant switching sessions left a stale, irrelevant shortlist behind — moving them into `SavedSession` alongside `packPaths` fixed that.

### The empty-session state exists instead of a blank table
A new session's first screen used to be indistinguishable from "the feature is broken" — zero packs meant zero results and no obvious next step, with the actual pack-selection action hidden inside an "Edit packs" affordance that wasn't discoverable on first use. The dedicated empty state (three concrete next steps, one sentence of orientation) replaced that dead end.

### Session identity lives in one header popover, not scattered controls
This went through several shapes before landing: a name pill plus a separate dropdown-style select plus a standalone pencil icon, then a native `<select>` element, before settling on a single title button that opens one popover containing everything (switch, new, rename, duplicate, delete). Each earlier version either split one mental action ("manage this session") across multiple controls, or leaned on a native `<select>` that couldn't carry secondary text (pack counts) or a destructive-action styling (Delete in red) the way a custom popover can.

### Pack actions live with the packs, not with session switching
Shuffle and Edit packs moved out of the header and into the Session packs sidebar, directly under the "Session packs · N" count. Session switching ("which context am I in") and pack editing ("what's in this context") are different questions, and keeping their controls in visually separate places stops the header from turning into a catch-all toolbar.

### The browsing toolbar is identical across all three scopes
Earlier, Session packs got a wider toolbar row (to fit the session controls that have since moved to the header and sidebar) while All samples and Favorites used a narrower one — meaning the search field's position and width changed depending on which tab you were on. Collapsing all three scopes to the same Back/Folders-toggle-plus-search row means nothing in the toolbar ever moves when you switch tabs or open/close the sidebar.

### Sound type chips wrap instead of scrolling
The filter row originally scrolled horizontally with no visible scrollbar (by design, to avoid a second row breaking vertical alignment) — but with no visible affordance, a chip cut off at the window edge just looked broken, not "scroll for more." Chips now wrap onto additional lines with a consistent 8px gap; every chip is always reachable without discovering a hidden interaction.

### List height is measured, not fixed
The sample table used to have a fixed height, which meant the *page* scrolled instead of just the list on a shorter window. It's now measured live against whatever space is actually left below the toolbar/sidebar, using a callback ref (rather than a one-time effect) so the measurement survives the wrapper unmounting and remounting as you switch scopes — only the table itself scrolls.

## 6. Pack detection: how it works and why it changed

Detection is pure filename/folder-name heuristics, run once at scan time — no audio analysis, no network calls, nothing AI-driven. The rule started simple ("a folder with loose audio directly inside it is a pack") and got refined twice against real failure cases found while using the actual library:

1. **The container problem.** A folder that holds dozens of separate vendor packs (e.g. a big "SAMPLE_PACKS_V1" dump) was getting misread as one giant pack, because its subfolder names loosely matched category words by coincidence. Fixed by checking how *concentrated* a folder's subfolders are in the category vocabulary (kick, snare, bass, melodic, fx, …), with word-boundary matching instead of loose substring matching, and treating a folder as one pack only when that concentration is high enough — scaling with how many subfolders there are, since a large container matching by coincidence gets rarer, not more likely, as folder count grows.

2. **The instrument-label problem.** The opposite failure: a well-organized real pack split into dozens of category folders (Kicks, Snares, 808 Bass, Hi Hats, One Shots, …) started having each of those folders misread as its own separate "pack" — so the sidebar would show entries literally named "808," "Bass," or "Kick" instead of the real product name. Fixed with an explicit check: is this folder's name *nothing but* an instrument/sound label ("808 Bass," "Hi Hats," "Kicks"), as opposed to a real product name that merely *contains* one of those words ("Abletunes – Future Bass Drums Vol 3" fails this check; "808 Bass" passes it)? When a folder is a bare label, the scanner looks for a real pack folder above it and attributes everything to that instead — but only when the ancestor it lands on actually qualifies as a real pack in its own right (a metadata file, loose audio directly inside it, or a coherent set of category subfolders). Without that qualification check, the fix over-corrected: a stray "Keys" folder sitting inside a generic archive/misc dump caused the *entire archive* — including other real, distinct packs living alongside it — to collapse into one mislabeled pack. Requiring the escalation target to independently look like a real pack keeps the fix scoped to its actual case (a category folder genuinely nested inside one pack) without swallowing unrelated content.

Both refinements were verified against synthetic folder trees reproducing the exact failure shapes before shipping, not just eyeballed against the real library.

## 7. Architecture, briefly

- **Electron + React + TypeScript**, built with Vite (`vite-plugin-electron`). No backend, no network calls beyond the local filesystem.
- Clean process split: `electron/main.ts` (scanning, pack detection, file dialogs, native drag-out, JSON persistence) and `electron/preload.ts` (the `window.api` contextBridge surface, hand-kept in sync with main's types) on one side; `src/` (the React renderer, all UI and browsing state) on the other.
- Persistence is a single JSON file (`store.json` under Electron's userData path) holding favorites, the list of sessions, and which one is active. No database, no server.
- `src/hooks/useLibrary.ts` is the single source of truth for library state, session state, and browse/navigation state — `App.tsx` stays a thin layout that wires that hook's data into components.
- The sample table is virtualized (`react-window`) to stay smooth across 50,000+ rows.
- CSS is a small custom design-token system (`index.css`): CSS custom properties for color (`--accent`, `--surface`, `--pin`, …) plus reusable utility classes (`.btn`, `.chip`, `.icon-btn`, `.nav-pill`, …) rather than a component library — keeps the whole app's visual language in one readable file.

---

*Reference material for this project also includes `Sample_Browser_Product_Handoff.md` (the original product spec and acceptance criteria this build was scoped against) and the original Palantir Product Design Show & Tell brief.*
