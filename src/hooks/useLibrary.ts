import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PackTag, SampleCategory, SavedSession, ScannedSample, StoreShape } from '../../electron/preload'

export type Scope = 'all' | 'favorites' | 'session' | 'pack'
export type Format = 'loop' | 'oneshot'

// The type-filter row shows these up front; Cymbal/Perc/Unclassified live in
// a "More types" overflow so the row doesn't turn into a wall of chips —
// still fully selectable, just not first in line.
export const PRIMARY_CATEGORIES: SampleCategory[] = [
  'kick',
  'snare',
  'clap',
  'hat',
  'bass',
  'vocal',
  'melodic',
  'fx',
]
export const OVERFLOW_CATEGORIES: SampleCategory[] = ['cymbal', 'perc', 'unknown']
export const CATEGORY_ORDER: SampleCategory[] = [...PRIMARY_CATEGORIES, ...OVERFLOW_CATEGORIES]
export const CATEGORY_LABELS: Record<SampleCategory, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hat: 'Hat',
  cymbal: 'Cymbal',
  perc: 'Perc',
  bass: 'Bass',
  vocal: 'Vocal',
  melodic: 'Melodic',
  fx: 'FX',
  // "Unclassified" rather than "Other" — this bucket specifically means the
  // filename/folder didn't say what it was, not a distinct fourth category.
  unknown: 'Unclassified',
}

export interface BrowseState {
  scope: Scope
  // packPath + folderPath together = "focus": when set, the main list shows
  // every sample under folderPath (flattened, including sub-subfolders) —
  // folderPath starts equal to packPath and moves deeper as you click a
  // node in the pack tree sidebar or a breadcrumb.
  packPath?: string
  folderPath?: string
  query: string
  // Lightweight discovery filters, derived from filenames/folder names at
  // scan time (no audio analysis) — see classifyCategory in main.ts.
  // undefined category = no type filter applied; undefined format = any.
  category?: SampleCategory
  format?: Format
}

export interface PackInfo {
  packPath: string
  packName: string
  count: number
}

export type BrowseItem = { kind: 'sample'; sample: ScannedSample } | { kind: 'missing'; id: string }

export interface Crumb {
  name: string
  folderPath: string
}

export interface PackTreeNode {
  name: string
  path: string
  children: PackTreeNode[]
}

const INITIAL_BROWSE: BrowseState = { scope: 'all', query: '' }

// The six colors a tag can be. A small fixed palette (instead of a full
// color picker) keeps tag creation to one click and keeps every tag
// readable against the app's soft green theme.
export const TAG_COLORS = ['#d9534f', '#e8a33d', '#d4c24a', '#4f9d69', '#4a7fc1', '#9161b8']

// New sessions get a unique default name ("Session 2", "Session 3", …)
// instead of every one being "Untitled session" — two identically named
// rows in the session menu made it impossible to tell which was which.
function nextSessionName(existing: SavedSession[]) {
  const taken = new Set(existing.map((s) => s.name))
  let n = existing.length + 1
  while (taken.has(`Session ${n}`)) n++
  return `Session ${n}`
}

// Macos-only app (per the product doc), so plain '/' splitting is safe —
// no need to pull in node's `path` module inside renderer code.
function relativeSegments(fullPath: string, base: string): string[] {
  if (fullPath === base) return []
  if (!fullPath.startsWith(base + '/')) return []
  return fullPath.slice(base.length + 1).split('/').filter(Boolean)
}

function matchesFormat(s: ScannedSample, format?: Format): boolean {
  if (!format) return true
  return format === 'loop' ? s.isLoop : !s.isLoop
}

// Everything the app knows about the library, plus the persisted parts
// (favorites, pins, session packs) and in-session browsing state. Kept in
// one hook so App.tsx stays a thin layout.
export function useLibrary() {
  const [folder, setFolder] = useState<string | null>(null)
  const [samples, setSamples] = useState<ScannedSample[]>([])
  const [status, setStatus] = useState('')

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  // Packs marked "not for me". Global (not per-session): once you've decided
  // a pack isn't your sound, no future session should draw it either.
  const [hiddenPacks, setHiddenPacks] = useState<Set<string>>(new Set())
  // User-made pack tags (color dot + name). Global, like favorites.
  const [tags, setTags] = useState<PackTag[]>([])
  // Pinned samples and the session-packs selection both live *inside* the
  // active session (see SavedSession) — these two are just that session's
  // data mirrored into fast-access state while it's the one being browsed.
  // Favorites, the sample library, and folder structure stay outside any
  // session, shared everywhere.
  const [pinned, setPinned] = useState<string[]>([])
  const [sessionPackPaths, setSessionPackPaths] = useState<Set<string>>(new Set())
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  // Surfaces real persistence state next to the session name, instead of a
  // silent write that might quietly fail — 'idle' only before the very
  // first save of the session.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const [browse, setBrowse] = useState<BrowseState>(INITIAL_BROWSE)
  const backStack = useRef<BrowseState[]>([])
  const [canGoBack, setCanGoBack] = useState(false)

  const samplesById = useMemo(() => {
    const map = new Map<string, ScannedSample>()
    for (const s of samples) map.set(s.id, s)
    return map
  }, [samples])

  const persist = useCallback(
    (overrides: Partial<StoreShape> = {}) => {
      window.api.getStore().then((current) => {
        const next: StoreShape = {
          ...current,
          lastFolder: folder ?? current.lastFolder,
          favorites: Array.from(favorites),
          sessions,
          activeSessionId,
          ...overrides,
        }
        window.api.setStore(next)
      })
    },
    [folder, favorites, sessions, activeSessionId],
  )

  function makeSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // Initial load: restore the last folder and everything saved with it.
  // Deliberately silent — no "Restored last folder…" banner. Picking up
  // where you left off should feel like the app's normal resting state, not
  // an event worth announcing every time it starts.
  useEffect(() => {
    ;(async () => {
      const store = await window.api.getStore()
      setFavorites(new Set(store.favorites))
      setHiddenPacks(new Set(store.hiddenPacks ?? []))
      setTags(store.tags ?? [])

      // Normalize every saved session up front — one saved before `pinned`
      // existed on SavedSession (or any other legacy gap) would otherwise
      // hand `undefined` to setPinned below, which crashes the moment
      // anything does pinned.map/.includes (the pinned tray, togglePin) —
      // that's a blank white screen with no error shown, not a friendly
      // failure. Every session gets real arrays whether or not it needs the
      // whole-store migration below.
      let needsResave = false
      let sess = (store.sessions ?? []).map((s) => {
        if (Array.isArray(s.pinned) && Array.isArray(s.packPaths)) return s
        needsResave = true
        return { ...s, packPaths: s.packPaths ?? [], pinned: s.pinned ?? [] }
      })
      if (sess.length === 0) {
        // Migration from before named sessions existed — fold whatever was
        // there (or nothing, on a first run) into one Untitled session
        // rather than losing it.
        sess = [
          {
            id: makeSessionId(),
            name: 'Untitled session',
            packPaths: store.sessionPackPaths ?? [],
            pinned: store.pinned ?? [],
            updatedAt: Date.now(),
          },
        ]
        needsResave = true
      }
      const activeId = store.activeSessionId && sess.some((s) => s.id === store.activeSessionId) ? store.activeSessionId : sess[0].id
      if (activeId !== store.activeSessionId) needsResave = true
      const active = sess.find((s) => s.id === activeId)!

      setSessions(sess)
      setActiveSessionId(activeId)
      setSessionPackPaths(new Set(active.packPaths ?? []))
      setPinned(active.pinned ?? [])
      if (needsResave) {
        window.api.getStore().then((current) =>
          window.api.setStore({ ...current, sessions: sess, activeSessionId: activeId, pinned: undefined, sessionPackPaths: undefined }),
        )
      }

      if (store.lastFolder) {
        setFolder(store.lastFolder)
        const found = await window.api.scanFolder(store.lastFolder)
        setSamples(found)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chooseFolder = useCallback(async () => {
    const picked = await window.api.openFolderDialog()
    if (!picked) return
    setFolder(picked)
    setStatus('Scanning…')
    const found = await window.api.scanFolder(picked)
    setSamples(found)
    setStatus(`Found ${found.length} WAV file(s)`)
    const current = await window.api.getStore()
    await window.api.setStore({ ...current, lastFolder: picked })
  }, [])

  const packs = useMemo<PackInfo[]>(() => {
    const map = new Map<string, PackInfo>()
    for (const s of samples) {
      const existing = map.get(s.packPath)
      if (existing) existing.count++
      else map.set(s.packPath, { packPath: s.packPath, packName: s.packName, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => a.packName.localeCompare(b.packName))
  }, [samples])

  // One folder tree per pack, built from the flat sample list (no extra
  // scanning needed — every sample already carries its full path). Powers
  // the sidebar: chevrons expand/collapse, clicking a node flattens
  // everything under it into the main list.
  const packTrees = useMemo(() => {
    const trees = new Map<string, PackTreeNode>()
    for (const s of samples) {
      let tree = trees.get(s.packPath)
      if (!tree) {
        tree = { name: s.packName, path: s.packPath, children: [] }
        trees.set(s.packPath, tree)
      }
      const segs = relativeSegments(s.path, s.packPath)
      const folderSegs = segs.slice(0, -1)
      let cursor = tree
      let cursorPath = s.packPath
      for (const seg of folderSegs) {
        cursorPath = `${cursorPath}/${seg}`
        let child = cursor.children.find((c) => c.path === cursorPath)
        if (!child) {
          child = { name: seg, path: cursorPath, children: [] }
          cursor.children.push(child)
        }
        cursor = child
      }
    }
    function sortTree(node: PackTreeNode) {
      node.children.sort((a, b) => a.name.localeCompare(b.name))
      node.children.forEach(sortTree)
    }
    trees.forEach(sortTree)
    return trees
  }, [samples])

  // --- Favorites ---
  const toggleFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        writeStore({ favorites: Array.from(next) })
        return next
      })
    },
    // writeStore is defined below, a plain function (not state), so it's stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Local helper so the setters below can persist without a stale closure on
  // `folder`/other state — always reads the freshest store first, and
  // surfaces real success/failure via saveStatus rather than saving
  // silently and hoping it worked.
  function writeStore(overrides: Partial<StoreShape>) {
    setSaveStatus('saving')
    window.api
      .getStore()
      .then((current) => window.api.setStore({ ...current, lastFolder: folder ?? current.lastFolder, ...overrides }))
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'))
  }

  // Every pack/pin change writes straight back into the active session —
  // autosave, no separate "save" step to remember. `sessions` is threaded
  // through as an argument (rather than closed over) so callers always
  // write from a guaranteed-current array via the setSessions updater form.
  function syncActiveSession(nextPacks: Set<string>, nextPinned: string[]) {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === activeSessionId ? { ...s, packPaths: Array.from(nextPacks), pinned: nextPinned, updatedAt: Date.now() } : s,
      )
      writeStore({ sessions: next })
      return next
    })
  }

  const retrySave = useCallback(() => {
    writeStore({ sessions, activeSessionId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, activeSessionId])

  // --- Pins (order preserved, no duplicates) — per-session, like the packs
  // selected below.
  const togglePin = useCallback(
    (id: string) => {
      setPinned((prev) => {
        const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        syncActiveSession(sessionPackPaths, next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionPackPaths, activeSessionId],
  )

  const removePin = useCallback(
    (id: string) => {
      setPinned((prev) => {
        const next = prev.filter((p) => p !== id)
        syncActiveSession(sessionPackPaths, next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionPackPaths, activeSessionId],
  )

  // --- Session packs ---
  const addPackToSession = useCallback(
    (packPath: string) => {
      setSessionPackPaths((prev) => {
        const next = new Set(prev)
        next.add(packPath)
        syncActiveSession(next, pinned)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinned, activeSessionId],
  )

  const removePackFromSession = useCallback(
    (packPath: string) => {
      setSessionPackPaths((prev) => {
        const next = new Set(prev)
        next.delete(packPath)
        // Removing a pack only removes it from the selection — pins on
        // samples from that pack are left alone. You may still want those
        // candidates even without the rest of the pack in view.
        syncActiveSession(next, pinned)
        return next
      })
      setBrowse((b) => (b.scope === 'session' && b.packPath === packPath ? { ...b, packPath: undefined, folderPath: undefined } : b))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinned, activeSessionId],
  )

  const pickRandomPacks = useCallback(
    (count: number) => {
      // Hidden packs are never drawn — that's the whole point of hiding one.
      const eligible = packs.filter((p) => !sessionPackPaths.has(p.packPath) && !hiddenPacks.has(p.packPath))
      const shuffled = [...eligible].sort(() => Math.random() - 0.5)
      const picked = shuffled.slice(0, Math.max(0, count))
      setSessionPackPaths((prev) => {
        const next = new Set(prev)
        for (const p of picked) next.add(p.packPath)
        syncActiveSession(next, pinned)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packs, sessionPackPaths, hiddenPacks, pinned, activeSessionId],
  )

  const replacePack = useCallback(
    (oldPackPath: string) => {
      const eligible = packs.filter(
        (p) => p.packPath !== oldPackPath && !sessionPackPaths.has(p.packPath) && !hiddenPacks.has(p.packPath),
      )
      if (eligible.length === 0) return
      const replacement = eligible[Math.floor(Math.random() * eligible.length)]
      setSessionPackPaths((prev) => {
        const next = new Set(prev)
        next.delete(oldPackPath)
        next.add(replacement.packPath)
        syncActiveSession(next, pinned)
        return next
      })
      setBrowse((b) =>
        b.scope === 'session' && b.packPath === oldPackPath ? { ...b, packPath: undefined, folderPath: undefined } : b,
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packs, sessionPackPaths, hiddenPacks, pinned, activeSessionId],
  )

  // Reshuffle: a fresh random draw at the SAME size as the current
  // selection (5 packs in → 5 new random packs out), replacing the whole
  // set rather than adding to it — the one-click "start over with a
  // different pool" action, as opposed to Pick-for-me's add-only draw from
  // the pack picker. Drawn from the whole library, not just packs that
  // aren't already selected, so it's a genuinely independent redraw.
  const reshuffleSessionPacks = useCallback(() => {
    const count = sessionPackPaths.size
    if (count === 0 || packs.length === 0) return
    const drawable = packs.filter((p) => !hiddenPacks.has(p.packPath))
    const shuffled = [...drawable].sort(() => Math.random() - 0.5)
    const picked = shuffled.slice(0, Math.min(count, drawable.length))
    const next = new Set(picked.map((p) => p.packPath))
    setSessionPackPaths(next)
    syncActiveSession(next, pinned)
    setBrowse((b) => (b.scope === 'session' ? { ...b, packPath: undefined, folderPath: undefined } : b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs, sessionPackPaths, hiddenPacks, pinned, activeSessionId])

  // "Deselect all" — empties the packs (and, per the pins-follow-the-pack
  // rule above, leaves pins untouched) in the *current* session, without
  // creating a new one. Creating a new session is its own explicit action.
  const clearSessionPacks = useCallback(() => {
    setSessionPackPaths(() => {
      const next = new Set<string>()
      syncActiveSession(next, pinned)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, activeSessionId])

  // --- Hide a pack ("not for me") ---
  // Workflow note: when a Shuffle hands you a pack with nothing you like,
  // "remove" alone wasn't enough — the next Shuffle could hand it right back.
  // Hiding does both jobs in ONE action: it removes the pack from the current
  // session AND keeps it out of every future draw. Nothing on disk changes;
  // the pack's samples are still searchable from All samples.
  const hidePack = useCallback(
    (packPath: string) => {
      setHiddenPacks((prev) => {
        const next = new Set(prev)
        next.add(packPath)
        writeStore({ hiddenPacks: Array.from(next) })
        return next
      })
      if (sessionPackPaths.has(packPath)) removePackFromSession(packPath)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionPackPaths, removePackFromSession],
  )

  // Unhide — also the "Undo" behind the toast that follows a hide. When
  // undoing, `restoreToSession` puts the pack back exactly where it was.
  const unhidePack = useCallback(
    (packPath: string, restoreToSession = false) => {
      setHiddenPacks((prev) => {
        const next = new Set(prev)
        next.delete(packPath)
        writeStore({ hiddenPacks: Array.from(next) })
        return next
      })
      if (restoreToSession) addPackToSession(packPath)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addPackToSession],
  )

  // --- Pack tags ---
  // Tags are created right from a pack's ⋯ menu (name + one of six colors)
  // and applied to that pack in the same step — no separate "manage tags"
  // screen to visit first.
  const saveTags = (next: PackTag[]) => {
    writeStore({ tags: next })
    return next
  }

  const createTag = useCallback((name: string, color: string, firstPackPath?: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const tag: PackTag = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      color,
      packPaths: firstPackPath ? [firstPackPath] : [],
    }
    setTags((prev) => saveTags([...prev, tag]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleTagOnPack = useCallback((tagId: string, packPath: string) => {
    setTags((prev) =>
      saveTags(
        prev.map((t) =>
          t.id !== tagId
            ? t
            : {
                ...t,
                packPaths: t.packPaths.includes(packPath)
                  ? t.packPaths.filter((p) => p !== packPath)
                  : [...t.packPaths, packPath],
              },
        ),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deleteTag = useCallback((tagId: string) => {
    setTags((prev) => saveTags(prev.filter((t) => t.id !== tagId)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // packPath -> its tags, for drawing color dots next to pack names.
  const tagsByPack = useMemo(() => {
    const map = new Map<string, PackTag[]>()
    for (const t of tags) {
      for (const p of t.packPaths) {
        const list = map.get(p) ?? []
        list.push(t)
        map.set(p, list)
      }
    }
    return map
  }, [tags])

  const activeSession = useMemo(() => sessions.find((s) => s.id === activeSessionId), [sessions, activeSessionId])

  // Recent-first, so the session dropdown surfaces what you were just in
  // rather than always the same alphabetical top.
  const recentSessions = useMemo(() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt), [sessions])

  // Starts a fresh, empty working context — zero packs, zero pins (favorites
  // stay available regardless, since they're global). Deliberately skips
  // asking for a name upfront: "Untitled session", renamed later, is a much
  // lower-friction start than a naming prompt every time.
  const createSession = useCallback(() => {
    const session: SavedSession = { id: makeSessionId(), name: nextSessionName(sessions), packPaths: [], pinned: [], updatedAt: Date.now() }
    setSessions((prev) => {
      const next = [...prev, session]
      writeStore({ sessions: next, activeSessionId: session.id })
      return next
    })
    setActiveSessionId(session.id)
    setSessionPackPaths(new Set())
    setPinned([])
    setScope('session')
    return session.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions])

  // Switching sessions restores that session's packs *and* pins — the whole
  // working context comes back, not just the pack list.
  const switchSession = useCallback(
    (id: string) => {
      const session = sessions.find((s) => s.id === id)
      if (!session) return
      setActiveSessionId(id)
      setSessionPackPaths(new Set(session.packPaths ?? []))
      setPinned(session.pinned ?? [])
      writeStore({ activeSessionId: id })
      setBrowse((b) => (b.scope === 'session' ? { scope: 'session', query: '' } : b))
      backStack.current = []
      setCanGoBack(false)
    },
    [sessions],
  )

  const renameSession = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
      writeStore({ sessions: next })
      return next
    })
  }, [])

  // Makes a separate copy of a session — the explicit way to branch off a
  // working set without disturbing the original.
  const duplicateSession = useCallback(
    (id: string) => {
      const source = sessions.find((s) => s.id === id)
      if (!source) return
      const copy: SavedSession = {
        id: makeSessionId(),
        name: `${source.name} copy`,
        packPaths: [...(source.packPaths ?? [])],
        pinned: [...(source.pinned ?? [])],
        updatedAt: Date.now(),
      }
      setSessions((prev) => {
        const next = [...prev, copy]
        writeStore({ sessions: next, activeSessionId: copy.id })
        return next
      })
      setActiveSessionId(copy.id)
      setSessionPackPaths(new Set(copy.packPaths))
      setPinned(copy.pinned)
    },
    [sessions],
  )

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        // Never end up with zero sessions — deleting the last one resets it
        // to a fresh Untitled session instead of leaving nothing active.
        const remaining = prev.filter((s) => s.id !== id)
        const next = remaining.length > 0 ? remaining : [{ id: makeSessionId(), name: 'Untitled session', packPaths: [], pinned: [], updatedAt: Date.now() }]
        const stillActiveId = next.some((s) => s.id === activeSessionId) ? activeSessionId : next[0].id
        const stillActive = next.find((s) => s.id === stillActiveId)!
        writeStore({ sessions: next, activeSessionId: stillActiveId })
        setActiveSessionId(stillActiveId)
        setSessionPackPaths(new Set(stillActive.packPaths ?? []))
        setPinned(stillActive.pinned ?? [])
        return next
      })
    },
    [activeSessionId],
  )

  // --- Browse navigation ---
  // A type filter (Kick, Loops-only, …) should survive ordinary navigation —
  // picking Kick and then browsing from pack to pack to compare kicks is the
  // whole point. It should only reset when it would otherwise silently show
  // zero results: jumping to a destination that provably has none of the
  // active category/format. This checks the real classified samples rather
  // than guessing from the folder's name.
  function carryFilters(prev: BrowseState, scopedSamples: ScannedSample[]): Pick<BrowseState, 'category' | 'format'> {
    const category = prev.category && scopedSamples.some((s) => s.category === prev.category) ? prev.category : undefined
    const format = prev.format && scopedSamples.some((s) => matchesFormat(s, prev.format)) ? prev.format : undefined
    return { category, format }
  }

  // Entering a pack from a flat list (All samples / Favorites / Session):
  // this is the one navigation that pushes a back-stack entry, since it's
  // the one place there's no persistent sidebar to jump back with.
  const openPack = useCallback(
    (packPath: string) => {
      setBrowse((prevBrowse) => {
        backStack.current.push(prevBrowse)
        setCanGoBack(true)
        const inScope = samples.filter((s) => s.packPath === packPath)
        return { scope: 'pack', packPath, folderPath: packPath, query: '', ...carryFilters(prevBrowse, inScope) }
      })
    },
    [samples],
  )

  // Direct jump to any node in a pack tree (sidebar click or breadcrumb) —
  // no back-stack push, since the sidebar/breadcrumb are always there to
  // jump elsewhere directly. Keeps the current scope and query.
  const focusNode = useCallback(
    (packPath: string, folderPath: string) => {
      setBrowse((b) => {
        const prefix = folderPath + '/'
        const inScope = samples.filter(
          (s) => s.packPath === packPath && (s.path === folderPath || s.path.startsWith(prefix)),
        )
        return { ...b, packPath, folderPath, ...carryFilters(b, inScope) }
      })
    },
    [samples],
  )

  // "All session samples" in the sidebar, or leaving a pack's focus while
  // staying in the same scope. Query and type filter are both preserved —
  // widening scope only ever adds more candidates, never fewer, so there's
  // no conflict to resolve here.
  const clearFocus = useCallback(() => {
    setBrowse((b) => ({ ...b, packPath: undefined, folderPath: undefined }))
  }, [])

  const goBack = useCallback(() => {
    const prev = backStack.current.pop()
    setCanGoBack(backStack.current.length > 0)
    if (prev) setBrowse(prev)
    else setBrowse(INITIAL_BROWSE)
  }, [])

  const setScope = useCallback((scope: Scope) => {
    backStack.current = []
    setCanGoBack(false)
    setBrowse({ scope, query: '' })
  }, [])

  const setQuery = useCallback((query: string) => {
    setBrowse((b) => ({ ...b, query }))
  }, [])

  const setCategory = useCallback((category: SampleCategory | undefined) => {
    setBrowse((b) => ({ ...b, category }))
  }, [])

  const setFormat = useCallback((format: Format | undefined) => {
    setBrowse((b) => ({ ...b, format }))
  }, [])

  // "Search all samples": jump all the way out to the whole library,
  // keeping the query and any type filter.
  const searchAll = useCallback(() => {
    setBrowse((b) => ({ scope: 'all', query: b.query, category: b.category, format: b.format }))
    backStack.current = []
    setCanGoBack(false)
  }, [])

  // "Search all session packs": widen out of a focused pack/folder back to
  // the session-wide view, without leaving Session scope. Keeps the query
  // and any type filter.
  const searchSessionWide = useCallback(() => {
    setBrowse((b) => ({ scope: 'session', query: b.query, category: b.category, format: b.format }))
  }, [])

  // For All/Favorites/Session-unfocused: a flat, searchable list — those
  // views intentionally cut across many packs, where one vendor's folder
  // hierarchy doesn't mean anything shared. For any focused pack (whether
  // reached via a plain pack click, or via the Session sidebar), the list
  // flattens everything under the focused node — the sidebar tree is what
  // lets you narrow from "Monte Booker" down to "Monte Booker / Drums /
  // Kicks", not folder-by-folder clicking in the main list itself.
  //
  // categoryCounts/formatCounts are computed alongside browseItems from the
  // same scope/focus/search-filtered pool, BEFORE the type filter itself is
  // applied — so the filter row always reflects "how many of each type match
  // what you've searched so far", live as you type.
  const { browseItems, categoryCounts, formatCounts } = useMemo(() => {
    const q = browse.query.trim().toLowerCase()
    const { category, format } = browse

    const counts = new Map<SampleCategory, number>()
    const fCounts = { loop: 0, oneshot: 0 }
    const tally = (s: ScannedSample) => {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1)
      if (s.isLoop) fCounts.loop++
      else fCounts.oneshot++
    }
    const passesType = (s: ScannedSample) => (!category || s.category === category) && matchesFormat(s, format)

    let items: BrowseItem[]

    if (browse.packPath && browse.folderPath) {
      const prefix = browse.folderPath + '/'
      let pool = samples.filter(
        (s) => s.packPath === browse.packPath && (s.path === browse.folderPath || s.path.startsWith(prefix)),
      )
      if (q) pool = pool.filter((s) => s.name.toLowerCase().includes(q))
      pool.forEach(tally)
      items = pool
        .filter(passesType)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((sample) => ({ kind: 'sample' as const, sample }))
    } else if (browse.scope === 'favorites') {
      // Unlike the other flat scopes, Favorites can reference samples that
      // aren't in the current scan (moved file, or a smaller folder chosen
      // since). Those show as "missing" rather than silently vanishing —
      // acceptance criteria: a missing file keeps its saved metadata. Only
      // shown when no filter is narrowing the view (a missing file has no
      // type/loop data left to filter by).
      const list: BrowseItem[] = []
      for (const id of favorites) {
        const sample = samplesById.get(id)
        if (sample) {
          if (q && !sample.name.toLowerCase().includes(q)) continue
          tally(sample)
          if (passesType(sample)) list.push({ kind: 'sample', sample })
        } else if (!q && !category && !format) {
          list.push({ kind: 'missing', id })
        }
      }
      items = list
    } else {
      let base: ScannedSample[]
      switch (browse.scope) {
        case 'session':
          base = samples.filter((s) => sessionPackPaths.has(s.packPath))
          break
        case 'all':
        default:
          base = samples
      }
      if (q) base = base.filter((s) => s.name.toLowerCase().includes(q))
      base.forEach(tally)
      items = base.filter(passesType).map((sample) => ({ kind: 'sample' as const, sample }))
    }

    return { browseItems: items, categoryCounts: counts, formatCounts: fCounts }
  }, [samples, samplesById, browse, favorites, sessionPackPaths])

  const currentPackName = useMemo(() => {
    if (!browse.packPath) return null
    return packs.find((p) => p.packPath === browse.packPath)?.packName ?? browse.packPath
  }, [browse, packs])

  // Breadcrumb trail from the pack root down to the current focus node,
  // e.g. Monte Booker / Drums / Kicks — each segment jumps straight there.
  const breadcrumbs = useMemo<Crumb[]>(() => {
    if (!browse.packPath || !browse.folderPath) return []
    const segs = relativeSegments(browse.folderPath, browse.packPath)
    const crumbs: Crumb[] = [{ name: currentPackName ?? browse.packPath, folderPath: browse.packPath }]
    let acc = browse.packPath
    for (const seg of segs) {
      acc = `${acc}/${seg}`
      crumbs.push({ name: seg, folderPath: acc })
    }
    return crumbs
  }, [browse, currentPackName])

  // The pack(s) whose tree the sidebar should show: just the one pack when
  // standalone (scope 'pack'), every selected pack when in Session, or every
  // pack in the library when browsing All samples by folder — the App layer
  // decides whether that last one is actually displayed (the Folders
  // toggle), this just makes the data available either way.
  const sidebarPacks = useMemo<PackInfo[]>(() => {
    if (browse.scope === 'pack' && browse.packPath) {
      const p = packs.find((pk) => pk.packPath === browse.packPath)
      return p ? [p] : []
    }
    if (browse.scope === 'session') {
      return packs.filter((p) => sessionPackPaths.has(p.packPath))
    }
    if (browse.scope === 'all') {
      return packs
    }
    return []
  }, [browse, packs, sessionPackPaths])

  return {
    folder,
    samples,
    samplesById,
    status,
    chooseFolder,
    packs,
    packTrees,
    sidebarPacks,
    favorites,
    toggleFavorite,
    hiddenPacks,
    hidePack,
    unhidePack,
    tags,
    tagsByPack,
    createTag,
    toggleTagOnPack,
    deleteTag,
    pinned,
    togglePin,
    removePin,
    sessionPackPaths,
    addPackToSession,
    removePackFromSession,
    pickRandomPacks,
    replacePack,
    reshuffleSessionPacks,
    sessions,
    recentSessions,
    activeSessionId,
    activeSession,
    saveStatus,
    retrySave,
    createSession,
    switchSession,
    renameSession,
    duplicateSession,
    deleteSession,
    clearSessionPacks,
    browse,
    canGoBack,
    openPack,
    focusNode,
    clearFocus,
    goBack,
    setScope,
    setQuery,
    setCategory,
    setFormat,
    searchAll,
    searchSessionWide,
    browseItems,
    categoryCounts,
    formatCounts,
    currentPackName,
    breadcrumbs,
    persist,
  }
}
