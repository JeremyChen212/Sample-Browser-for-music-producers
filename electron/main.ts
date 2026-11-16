import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import zlib from 'node:zlib'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const DIST = path.join(__dirname, '../dist')

// Spike scope: WAV only, per the product doc's initial validation target.
const AUDIO_EXTENSIONS = new Set(['.wav'])

// Tiny embedded drag-cursor icon so we don't depend on a bundled asset file.
const DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAM0lEQVR42mNgGBFAo+LOfxgetWDUgiFgATqmqeEUW0KM4RRZMmrBqAX0S6qDOyePApoDABRCQoZ70v2/AAAAAElFTkSuQmCC'

const STORE_PATH = () => path.join(app.getPath('userData'), 'store.json')

// A session is the whole working context you're in — which packs, which
// pins — like a lightweight project file for browsing, not an Ableton
// project. Packs and pins live inside it; the sample library, favorites, and
// original folder structure are shared across every session (see StoreShape
// below).
interface SavedSession {
  id: string
  name: string
  packPaths: string[]
  pinned: string[]
  updatedAt: number
  // Samples dragged into Ableton during this session, and the Ableton set
  // (.als) this session is linked to — see preload.ts for the reasoning.
  tried?: string[]
  alsPath?: string
  projectSamples?: string[]
}

interface StoreShape {
  lastFolder?: string
  favorites: string[]
  sessions: SavedSession[]
  activeSessionId: string
  // Packs marked "Hide from sessions" and user-made pack tags — see
  // preload.ts for the full shape and reasoning. Stored as plain JSON
  // alongside everything else, no extra handling needed here.
  hiddenPacks?: string[]
  tags?: { id: string; name: string; color: string; packPaths: string[] }[]
  // Legacy top-level fields from before named sessions existed. Only ever
  // read once, by the renderer's migration on first load after upgrading —
  // new code always reads pins/packs off the active session instead.
  pinned?: string[]
  sessionPackPaths?: string[]
}

const STORE_DEFAULTS: Omit<StoreShape, 'lastFolder'> = {
  favorites: [],
  sessions: [],
  activeSessionId: '',
}

function readStore(): StoreShape {
  try {
    const raw = fs.readFileSync(STORE_PATH(), 'utf-8')
    return { ...STORE_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...STORE_DEFAULTS }
  }
}

function writeStore(data: StoreShape) {
  fs.mkdirSync(path.dirname(STORE_PATH()), { recursive: true })
  fs.writeFileSync(STORE_PATH(), JSON.stringify(data, null, 2), 'utf-8')
}

// Filename-and-folder-name classification only — no audio analysis, no AI
// calls at runtime. A sample that doesn't clearly say what it is stays
// 'unknown' rather than guessing; better an honest gap than a wrong label
// (a choir sample sitting inside a "Drum Kit" folder should not become a
// drum just because of where it lives).
export type SampleCategory =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'cymbal'
  | 'perc'
  | 'bass'
  | 'vocal'
  | 'melodic'
  | 'fx'
  | 'unknown'

export interface ScannedSample {
  id: string
  name: string
  path: string
  packName: string
  packPath: string
  ext: string
  size: number
  category: SampleCategory
  isLoop: boolean
}

// Pack boundary rule (doc section 7A): "Initially, treat explicitly added pack
// folders as packs" — but "has audio directly inside" isn't a reliable test
// on its own. A well-organized pack (LEOD, say) often has ZERO loose files —
// everything's already sorted into Kicks/Hats/Loops/etc — so that rule
// wrongly treats each category folder as its own pack. Two better signals,
// used together: a real pack root usually carries metadata files (Cover.*,
// Info.txt, readme) right in it, and its subfolders tend to be generic
// category names (Kicks, Hats, FX) rather than product/vendor names. A pure
// container (RECENTS) has neither — its children look like proper nouns
// (Monte Booker, Vengeance Drums Vol 3), not categories. Both signals are
// heuristics on real-world folder naming, documented here rather than
// hidden, per the doc's call for "a clear documented rule."
const CATEGORY_KEYWORDS = [
  'kick', 'snare', 'hat', 'hi-hat', 'hihat', 'cymbal', 'crash', 'ride',
  'perc', 'percussion', 'tom', 'clap', 'loop', 'one shot', 'one-shot',
  'oneshot', 'fx', 'sfx', 'vocal', 'vox', 'bass', 'melodic', 'chord', 'key',
  'synth', 'pad', 'texture', 'riser', 'impact', 'drum', 'scratch', 'shaker',
  'tape', 'static', 'stem', 'break', 'atmosphere', 'ambience', 'sub',
  'lead', 'arp', 'pluck', 'brass', 'string', 'guitar', 'piano', 'groove',
  'fill', 'transition', 'sweep', 'noise', 'glitch', 'foley', 'open', 'closed',
]
const METADATA_BASENAMES = ['cover', 'readme', 'license', 'licence', 'info', 'credits']

// Word-boundary matching (via wordPattern, defined below — function
// declarations hoist, so this reference is fine at module load time), not a
// plain substring .includes(). Substring matching let vendor/product names
// that merely CONTAIN a category word (a pack called "Basshead", a folder
// named "Locksmith Drums") count as "category-like" too, which inflated a
// container's categoryRatio and was part of why big containers of separate
// packs could get misread as one pack.
const CATEGORY_KEYWORD_PATTERN = wordPattern(CATEGORY_KEYWORDS)

function looksLikeCategoryName(name: string): boolean {
  return CATEGORY_KEYWORD_PATTERN.test(name)
}

// Per-sample "what is this" classification — ordered most-specific-first, so
// e.g. "808 Kick.wav" reads as a kick rather than the broader "bass" match
// further down the list. Checked against the filename first, then the
// immediate parent folder name (so "Monte Booker/Drums/Kicks/weird_03.wav"
// still classifies from "Kicks" even though the filename alone says nothing).
//
// Boundaries use lookaround against LETTERS only (not JS's default \b, which
// treats "_" as a word character) — sample filenames separate tokens with
// underscores/hyphens/digits far more often than spaces ("bd_1.wav",
// "Clap-04.wav"), and \b silently fails to match "bd" in "bd_1" because
// there's no letter/non-letter boundary there. This is why "bd_" (a common
// bass-drum/kick alias) wasn't matching before.
function wordPattern(tokens: string[]): RegExp {
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?<![a-zA-Z])(?:${escaped.join('|')})(?![a-zA-Z])`, 'i')
}

const CATEGORY_TOKENS: [SampleCategory, string[]][] = [
  ['kick', ['kick', 'kicks', 'kck', 'bd']],
  ['snare', ['snare', 'snares', 'snr', 'sd']],
  ['clap', ['clap', 'claps']],
  ['hat', ['hat', 'hats', 'hihat', 'hihats', 'hi-hat', 'hi-hats', 'hh']],
  ['cymbal', ['cymbal', 'cymbals', 'crash', 'crashes', 'ride', 'rides']],
  ['perc', ['perc', 'percussion', 'shaker', 'shakers', 'tom', 'toms', 'conga', 'congas', 'bongo', 'bongos', 'tambourine']],
  ['bass', ['bass', 'basses', 'subbass', '808', '808s', 'sub', 'subs']],
  ['vocal', ['vocal', 'vocals', 'vox', 'voice', 'chant', 'chants', 'choir', 'acapella', 'cappella']],
  [
    'melodic',
    [
      'melody', 'melodic', 'chord', 'chords', 'key', 'keys', 'piano', 'synth', 'synths', 'pad', 'pads',
      'arp', 'arps', 'arpeggio', 'pluck', 'plucks', 'guitar', 'string', 'strings', 'brass', 'bell', 'bells', 'lead', 'leads',
    ],
  ],
  [
    'fx',
    [
      'fx', 'sfx', 'riser', 'risers', 'impact', 'impacts', 'sweep', 'sweeps', 'transition', 'transitions',
      'noise', 'glitch', 'foley', 'texture', 'textures', 'atmosphere', 'ambience', 'static', 'tape', 'scratch', 'scratches',
    ],
  ],
]
const CATEGORY_PATTERNS: [SampleCategory, RegExp][] = CATEGORY_TOKENS.map(([category, tokens]) => [
  category,
  wordPattern(tokens),
])
const ONE_SHOT_PATTERN = wordPattern(['one shot', 'one-shot', 'one_shot', 'oneshot', 'oneshots'])
const LOOP_PATTERN = wordPattern(['loop', 'loops', 'break', 'breaks', 'groove', 'grooves'])

// The full vocabulary a BARE instrument/sound label can be built from —
// every token used anywhere for per-sample classification, plus a few
// words ("808", "909", drum-machine numbers; "full", "hits", "shots") that
// only ever show up as part of a category-style folder name, never as a
// real product name on their own.
const BARE_LABEL_WORDS = new Set<string>([
  ...CATEGORY_TOKENS.flatMap(([, tokens]) => tokens.flatMap((t) => t.split(/\s+/))),
  ...CATEGORY_KEYWORDS.flatMap((k) => k.split(/\s+/)),
  '808', '909', '707', '606', '303',
  'hit', 'hits', 'shot', 'shots', 'full', 'drums', 'top', 'bottom', 'layer', 'layers', 'layered', 'and', 'hi', 's',
])

// True when a folder's name is NOTHING BUT an instrument/sound label —
// "808 Bass", "Hi Hats", "Kicks", "One Shots" — as opposed to a real pack
// name that merely happens to CONTAIN one of those words ("Abletunes -
// Future Bass Drums Vol 3" has 6+ words and several, like "Abletunes" and
// "Vol", aren't in the vocabulary at all, so it fails this check even
// though "Bass" and "Drums" both appear in it). A folder like this is
// virtually always a category subfolder living INSIDE a real pack, not a
// pack in its own right — real vendors essentially never ship a product
// named literally "Bass" or "808 Bass" with nothing else added, so
// requiring every word to match, and capping the word count, keeps this
// from firing on genuine multi-word product names.
function isBareCategoryLabel(name: string): boolean {
  const words = name
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0 || words.length > 3) return false
  return words.every((w) => BARE_LABEL_WORDS.has(w) || BARE_LABEL_WORDS.has(w.replace(/s$/, '')))
}

function classifyCategory(...texts: string[]): SampleCategory {
  for (const text of texts) {
    for (const [category, pattern] of CATEGORY_PATTERNS) {
      if (pattern.test(text)) return category
    }
  }
  return 'unknown'
}

// A "loop" tag is independent of the type tag above — a kick can be a
// one-shot or part of a loop. An explicit "one shot" label always wins over
// an incidental "loop" match elsewhere (e.g. a pack folder named "Drum
// Loops" containing individually-labelled one-shot hits).
function classifyIsLoop(...texts: string[]): boolean {
  if (texts.some((t) => ONE_SHOT_PATTERN.test(t))) return false
  return texts.some((t) => LOOP_PATTERN.test(t))
}

function scanFolder(rootPath: string): ScannedSample[] {
  const results: ScannedSample[] = []

  function collectPackContents(dir: string, packName: string, packPath: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isSymbolicLink()) continue // avoid symlink recursion
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        collectPackContents(full, packName, packPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (AUDIO_EXTENSIONS.has(ext)) {
          let size = 0
          try {
            size = fs.statSync(full).size
          } catch {
            // unreadable file — skip gracefully
          }
          const base = path.basename(entry.name, ext)
          const parentFolder = path.basename(dir)
          const category = classifyCategory(base, parentFolder)
          const isLoop = classifyIsLoop(base, parentFolder)
          results.push({ id: full, name: entry.name, path: full, packName, packPath, ext, size, category, isLoop })
        }
      }
    }
  }

  // Folders promoted from a bare instrument/sound label up to the real pack
  // above them (see isBareCategoryLabel) — keyed by the real pack's path, so
  // that once "Vendor Pack" has been collected whole (because "Vendor
  // Pack/808 Bass" escalated up to it), every OTHER sibling under it
  // ("Vendor Pack/Kicks", "Vendor Pack/Extras", …) is recognized as already
  // covered instead of getting collected again as a second, duplicate pack.
  const promotedPackRoots = new Set<string>()

  function isUnderPromotedRoot(dir: string): boolean {
    for (const root of promotedPackRoots) {
      if (dir === root || dir.startsWith(root + path.sep)) return true
    }
    return false
  }

  // A directory's own immediate contents, read once and shared by both the
  // main findPacks walk and the escalation check below, so a bare-label
  // folder's ancestor chain doesn't each re-scan the filesystem separately
  // from the normal traversal.
  function readDirSignals(dir: string): { subdirs: string[]; hasDirectAudio: boolean; hasMetadataFile: boolean } | undefined {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return undefined
    }
    const subdirs: string[] = []
    let hasDirectAudio = false
    let hasMetadataFile = false
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        subdirs.push(entry.name)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (AUDIO_EXTENSIONS.has(ext)) hasDirectAudio = true
        const base = path.basename(entry.name, ext).toLowerCase()
        if (METADATA_BASENAMES.some((m) => base.startsWith(m))) hasMetadataFile = true
      }
    }
    return { subdirs, hasDirectAudio, hasMetadataFile }
  }

  // Same "does this look like one pack" test findPacks uses on its own
  // directory, reused here to vet an escalation TARGET before accepting it.
  // Two signals, in order of confidence. bareLabelRatio — most of the
  // subfolders are THEMSELVES nothing but an instrument/sound label
  // ("Kicks", "808s", "One Shots") — is the strong, size-independent one: a
  // real pack organized by sound type can easily have well over a dozen of
  // these, while a container of separate vendor packs essentially never has
  // folder names that are ENTIRELY just a category word, no matter how many
  // packs it holds. categoryRatio is the softer fallback for
  // descriptive-but-not-quite-bare names ("Kick Drums One Shots"), so it
  // still needs a small folder count to guard against a big vendor-name
  // container coincidentally mentioning "bass" or "drum" in several product
  // titles. A metadata file (Cover.*, readme, license) loose in the folder
  // overrides both — real containers of many packs don't ship one at the
  // container's own top level.
  function qualifiesAsPackRoot(dir: string): boolean {
    const info = readDirSignals(dir)
    if (!info) return false
    // Loose audio sitting directly in the folder, or a metadata file, is
    // conclusive on its own — same as the hasDirectAudio/hasMetadataFile
    // shortcuts findPacks itself uses.
    if (info.hasDirectAudio || info.hasMetadataFile) return true
    if (info.subdirs.length === 0) return false
    const bareLabelRatio = info.subdirs.filter(isBareCategoryLabel).length / info.subdirs.length
    if (bareLabelRatio >= 0.5) return true
    const categoryRatio = info.subdirs.filter(looksLikeCategoryName).length / info.subdirs.length
    return info.subdirs.length <= 12 && categoryRatio >= 0.6
  }

  // Walks up from a bare-label folder ("808 Bass", "Kicks") looking for the
  // real pack above it — but only accepts an ancestor that actually
  // QUALIFIES as one (see qualifiesAsPackRoot), not just any ancestor whose
  // name happens not to be a bare label. Climbing straight to the first
  // non-bare name is what let a folder like "Keys" sitting loose inside a
  // big misc/archive dump get "promoted" into swallowing that entire
  // archive — including whatever other distinct real packs lived alongside
  // it — as one giant mislabeled pack. Requiring the landing spot to look
  // like a real pack in its own right (a coherent set of category
  // subfolders, or a metadata file) keeps the escalation to cases like
  // "Vendor Pack/808 Bass" while leaving a stray "Keys" folder inside a
  // generic container alone rather than merging that container. Returns
  // undefined when no ancestor up to (but not including) rootPath qualifies.
  function nearestQualifyingAncestor(dir: string): string | undefined {
    let current = dir
    while (current !== rootPath) {
      const parent = path.dirname(current)
      if (parent === current) return undefined // filesystem root guard
      current = parent
      if (current === rootPath) return undefined // never escalate to the whole scanned library
      if (isBareCategoryLabel(path.basename(current))) continue
      return qualifiesAsPackRoot(current) ? current : undefined
    }
    return undefined
  }

  // Collects `dir` as one pack — unless `dir`'s own name is just an
  // instrument/sound label ("808 Bass", "Kicks", "One Shots"), in which case
  // that's a category subfolder, not a pack on its own, so this looks for a
  // real pack above it and collects THAT instead (once — see
  // promotedPackRoots). If nothing above it actually qualifies as a real
  // pack, it falls back to collecting the bare-label folder as itself rather
  // than risk merging an unrelated container.
  function collectAsPack(dir: string) {
    if (dir !== rootPath && isBareCategoryLabel(path.basename(dir))) {
      const packRoot = nearestQualifyingAncestor(dir)
      if (packRoot) {
        if (promotedPackRoots.has(packRoot)) return
        promotedPackRoots.add(packRoot)
        collectPackContents(packRoot, path.basename(packRoot), packRoot)
        return
      }
    }
    collectPackContents(dir, path.basename(dir), dir)
  }

  function findPacks(dir: string) {
    if (isUnderPromotedRoot(dir)) return // already collected via its real pack above

    const info = readDirSignals(dir)
    if (!info) return
    const { subdirs, hasDirectAudio, hasMetadataFile } = info

    if (hasDirectAudio) {
      // Unambiguous: a container of separate packs should never have loose
      // audio sitting directly in it, so this is a real pack root — unless
      // its own name is a bare instrument label, in which case collectAsPack
      // escalates to the real pack above it instead.
      collectAsPack(dir)
      return
    }

    if (subdirs.length === 0) return // empty or non-audio dead end

    const bareLabelRatio = subdirs.filter(isBareCategoryLabel).length / subdirs.length
    const categoryRatio = subdirs.filter(looksLikeCategoryName).length / subdirs.length
    const looksLikeSinglePack =
      hasMetadataFile || bareLabelRatio >= 0.5 || (subdirs.length <= 12 && categoryRatio >= 0.6)

    if (looksLikeSinglePack) {
      // No loose audio, but this looks like one pack organized into
      // category subfolders (Kicks/Hats/Loops) rather than a container of
      // separate packs — treat the whole thing as one pack.
      collectAsPack(dir)
    } else {
      // Pure container (like RECENTS): children look like product/vendor
      // names, not categories — keep descending to find the real packs.
      for (const name of subdirs) {
        findPacks(path.join(dir, name))
      }
    }
  }

  findPacks(rootPath)
  return results
}

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('dialog:openFolder', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:scanFolder', (_e, folderPath: string) => scanFolder(folderPath))

  ipcMain.handle('fs:readFile', (_e, filePath: string) => {
    const buf = fs.readFileSync(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('fs:revealInFinder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // Native outbound drag: this is the highest-risk piece per the product doc.
  ipcMain.on('drag:start', (event, filePath: string) => {
    const icon = nativeImage.createFromDataURL(DRAG_ICON_DATA_URL)
    event.sender.startDrag({ file: filePath, icon })
  })

  // --- Ableton set link ("is this sample still in my project?") ---
  //
  // Workflow note: I didn't want to come back to the app after every beat
  // just to heart the samples that made it. Full .als parsing didn't land in
  // the original 3-hour build, but this needs far less: an .als file is
  // gzip-compressed XML, and every sample a set uses is stored with its
  // file path. So we decompress and look for the exact paths of the samples
  // this session dragged/pinned. No XML parsing, no format guesswork.
  //
  // Honesty rules (same as the rest of the app):
  //  • exact path found         → "in project"
  //  • only the filename found  → reported separately as a likelier-but-not-
  //    certain match (two packs can both have "Kick 1.wav")
  //  • not found                → stays "tried"; we never claim it was deleted,
  //    only that the last SAVED version of the set doesn't reference it.
  ipcMain.handle('dialog:openAls', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { properties: ['openFile' as const], filters: [{ name: 'Ableton Live Set', extensions: ['als'] }] }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('als:check', (_e, alsPath: string, samplePaths: string[]) => checkAlsReferences(alsPath, samplePaths))

  ipcMain.handle('store:get', () => readStore())
  ipcMain.handle('store:set', (_e, data: StoreShape) => {
    writeStore(data)
    return true
  })
})

// Cache the decompressed set by modification time — the renderer polls every
// few seconds, but we only re-read and decompress when Ableton actually
// saved a new version.
let alsCache: { path: string; mtimeMs: number; text: string } | null = null

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;')
}

function checkAlsReferences(alsPath: string, samplePaths: string[]) {
  try {
    const stat = fs.statSync(alsPath)
    if (!alsCache || alsCache.path !== alsPath || alsCache.mtimeMs !== stat.mtimeMs) {
      const raw = fs.readFileSync(alsPath)
      let text: string
      try {
        text = zlib.gunzipSync(raw).toString('utf-8')
      } catch {
        // Not gzipped (some tools save plain XML) — read it as-is.
        text = raw.toString('utf-8')
      }
      alsCache = { path: alsPath, mtimeMs: stat.mtimeMs, text }
    }
    const text = alsCache.text
    const found: string[] = []
    const nameOnly: string[] = []
    for (const p of samplePaths) {
      if (text.includes(p) || text.includes(xmlEscape(p))) {
        found.push(p)
        continue
      }
      const base = path.basename(p)
      if (text.includes(`"${xmlEscape(base)}"`)) nameOnly.push(p)
    }
    return { ok: true as const, mtimeMs: stat.mtimeMs, name: path.basename(alsPath), found, nameOnly }
  } catch (err) {
    return { ok: false as const, name: path.basename(alsPath), error: (err as Error).message }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
