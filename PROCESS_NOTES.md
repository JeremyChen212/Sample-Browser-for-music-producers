# Process Notes: workflow-improvements branch

Changes I made after the Palantir Show & Tell submission, based on using the app on my own library (409 packs, 53k+ samples). Each one starts with something I noticed while making music.

---

## Design principle: show controls where they're used

The app has a lot of features: sessions, packs, tags, hiding, pins, favorites, and type filters. I didn't want to add a settings page, a "manage tags" screen, or any more modals. **Every control appears where the decision happens**, and the rest of the time it stays out of the way.

| Feature | Where it appears | Where it doesn't |
|---|---|---|
| Hide a pack | On the pack itself (⋯ or right-click) | No separate "manage hidden packs" page. Hidden packs only appear as a collapsed section in Edit packs, where you'd go to bring one back |
| Tags | Created and applied from a pack's ⋯ menu, in one step | No tag manager. The tag filter row only appears once a tag exists and only lists tags on packs in the current view |
| Rename a session | Double-click the title, or ✎ on any row | Not buried at the bottom of a menu |
| Delete a session | 🗑 on the row, then a confirmation on that same row | No pop-up dialog |
| Pack ⋯ button | Shows on hover | Not shown on all 400 rows at once |
| Tried / In project | A quiet mark on the row plus a Tried row, which appears only after your first drag | No toast on every drag, no "review your session" screen |
| Ableton set link | Next to the session name (a session is a beat) | Not a global setting |

**Backend work you never see, but that shows up at the right moment:**
- **Shuffle, Pick for me, and Swap all skip hidden packs.** Hiding a pack once means no future session ever draws it.
- **Hiding never touches files.** A hidden pack's samples can still be found in All samples. The pack is dimmed in folder view, not gone.
- **Undo can put a pack back exactly where it was.** When a pack is hidden, the app remembers whether it was in the session, so Undo restores both states.
- **The tag filter hides dead ends.** A tag that would filter the current list down to zero packs doesn't get a chip.
- **New sessions get unique names** (Session 2, Session 3…), so the session menu never shows two identical rows.
- **Hidden packs and tags save to the same file as everything else**, and older saves still load without any migration.

---

## 1. Removing vs. hiding a pack

**What I noticed:** Shuffle kept giving me packs I knew I'd never use. Removing one meant opening Edit packs and scrolling a 400-pack list to uncheck it. Worse, the next Shuffle could hand the same pack right back.

**What I added:** a ⋯ menu on each pack (hover, or right-click like Finder or Ableton) with two separate actions:
- **Remove from session.** The common case, so it's one click with no questions.
- **Hide from sessions.** For "this isn't my sound." It removes the pack from the session too, because whenever you hide a pack you'd also want it out of the session, so it's one action instead of two. It also keeps the pack out of every future Shuffle.

**Decisions:**
- **No "Hide or remove?" pop-up.** Most of the time you're just removing a pack, so that shouldn't cost an extra step.
- **Undo instead of "Are you sure?"** A toast says *"'VPE1 Impacts' removed and hidden from sessions · Undo"*. It's still safe, without slowing you down.
- **I named it "Hide," not "Archive."** Files never move in this app, and "archive" sounds like they do.

## 2. Tags (color dot + name)

**What I noticed:** With 400+ packs, I kept wanting views like "just Ableton's stock packs" or "just the drill kits." Folder names from different sellers don't group things the way I think about them.

**What I added:** tags with a color dot and a name. From a pack's ⋯ menu, **Tags ▸** shows your tags as checkboxes, and **+ New tag** lets you type a name and pick one of 6 colors. The new tag is applied to that pack right away. Tag dots show next to pack names. A collapsible **Tags** row above the pack list filters it (click again, or "All", to clear).

**Decisions:**
- **Tags are on packs; hearts are on sounds.** Favorites mark individual samples and work everywhere. Tags organize packs. Keeping them separate means neither competes with the other.
- **6 preset colors, not a color picker.** That keeps creating a tag to one click, and every color stays readable on the app's background.
- **Tags open as a second view inside the same menu, not a flyout.** It stays one compact card and works the same from a right-click.

## 3. Lining up the two columns

**What I noticed:** The pack name sat in a separate title row above the Sound type filters. That pushed the filters down, so "Session packs · 3" on the left and "Sound type" on the right never lined up across the divider.

**What I changed:** both column headers now share one 28px row. The pack name and folder trail moved into the count line above the list: **"LuGeR KiT · 115 samples"**. Where you are and how many results there are now read together, directly above the list they describe.

## 4. Session manager

**What I noticed:** Renaming only worked on the active session, from the bottom of the menu, and every new session was called "Untitled session." I had two identical rows and couldn't tell which one I was renaming.

**What I changed:**
- **Double-click the session title** to rename it in place.
- **Each row in the menu:** click to open, ✎ to rename right there, 🗑 to delete with a "Delete? Cancel / Delete" check on that same row. A session holds your pins, so a stray click shouldn't erase it.
- **New sessions get unique names** and open with the name selected, ready to type over.

## 5. Consider → try → keep (Pin → Drag → Heart)

**What I noticed:** If I dragged a sample straight into Ableton without pinning it first, the app forgot it. An hour later, finding "that hat I tried" meant searching all over again. I also didn't want to come back after every beat just to heart the samples that made it into the track.

**What I added:**
- **Every drag into Ableton is recorded automatically** under **"↗ Tried · N"** in the session, newest first. You can play, pin, or clear each one. Rows get a quiet **Tried** mark.
- **Link Ableton set…** sits next to the session name. One session = one beat = one set. Whenever you save that set in Ableton, samples it references get an **"In project"** mark, and the Tried row shows "2 in project". No extra clicks.

**How the link works:** a `.als` file is gzip-compressed XML, and every sample a set uses is stored by its file path. Full project parsing didn't work within the original 3-hour build, but this needs much less: decompress the file and look for the exact paths of the samples this session dragged or pinned. The app checks every few seconds but only re-reads the file when Ableton actually saves a new version.

**Being honest about what it can see:**
- Exact path found → **In project**
- Only the filename found → **In project?** (dashed), because two packs can both have "Kick 1.wav"
- Dragged but not in the saved set → stays **Tried**. The app never claims you deleted it, only that the last *saved* version doesn't reference it.

**Decisions:**
- **Drags show no notification.** You drag dozens of samples per beat, and a toast each time would break your focus.
- **Drags aren't auto-pinned.** Pins mean "maybe, try later." Filling them with every drag would make the shortlist meaningless.
- **Hearts stay manual.** "In project" is a fact about one beat. "Keeper" is a judgment about your taste, so the app records facts and leaves judgments to you.
- **Pins:** consider. **Drags:** try. **Hearts:** keep. Each step is a bigger commitment, and only the last one carries across sessions.

---

## Tab structure: should Favorites be its own tab?

I kept **All samples / Favorites / Session packs** as three tabs. Favorites work across every session, so they need their own quick place to land. Hiding them as a filter inside All samples would make them harder to reach.

## Next steps (designed, not built yet)
- Let the tag filter also narrow the sample list in "All session samples", not just the pack list
- Suggest (not auto-apply) a heart for samples that end up "In project" across 3+ beats
- Auto-detect the set instead of linking it: guess the most recently saved .als in your Projects folder
- Read BPM and key from filenames
- Keyboard browsing: arrow keys plus auto-preview, the way producers audition sounds
