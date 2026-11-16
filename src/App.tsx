import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FixedSizeList as List } from 'react-window'
import type { ScannedSample } from '../electron/preload'
import { useLibrary } from './hooks/useLibrary'
import { BrowseRow, type RowData } from './components/SampleRow'
import { PinnedTray } from './components/PinnedTray'
import { SessionPackPicker } from './components/SessionPackPicker'
import { PackTreeSidebar } from './components/PackTreeSidebar'
import { CategoryFilterBar } from './components/CategoryFilterBar'
import { SessionBar } from './components/SessionBar'
import { PackMenu } from './components/PackMenu'
import { ArrowLeftIcon, BrandMark, ChevronIcon, FolderIcon, PencilIcon, SearchIcon, ShuffleIcon } from './components/Icon'

const ROW_HEIGHT = 40

// The sample list used to get a fixed 440px height, which meant the page's
// real height was header+toolbar+440px+everything-else stacked up — taller
// than most windows, so the whole page scrolled instead of just the list.
// This measures whatever space is actually left after everything above it,
// so the outer page never needs to scroll — only this one list does.
//
// Uses a callback ref rather than a plain ref + effect-on-mount: the wrapper
// div this measures is only rendered while there are items to show
// (browseItems.length > 0), so it can unmount and remount as you switch
// scopes or filters. An effect with `[]` deps only ever attaches its
// ResizeObserver to whichever DOM node existed the very first time it ran —
// if that node was later unmounted, the observer is left watching a
// detached element and the measured height freezes forever, leaving a gap
// between the (stale, too-short) list and the bottom of the panel. A
// callback ref re-fires on every mount/unmount, so the observer always
// tracks whatever node is actually on screen right now.
function useMeasuredHeight() {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(320)
  const ref = useCallback((el: HTMLDivElement | null) => setNode(el), [])
  useEffect(() => {
    if (!node) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h) setHeight(h)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [node])
  return [ref, height] as const
}

export default function App() {
  const lib = useLibrary()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [managePacksOpen, setManagePacksOpen] = useState(false)
  // All-samples has two ways to look at the same data: a flat searchable
  // list, or the same pack/folder tree browsing Session packs uses. A single
  // on/off toggle rather than a two-way switch, and it lives in the
  // full-width toolbar below (outside the row whose width actually changes)
  // so its own position never moves when the sidebar appears or disappears.
  const [showAllSamplesFolders, setShowAllSamplesFolders] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playRequestId = useRef(0)
  const [listWrapRef, listHeight] = useMeasuredHeight()
  // Which pack's ⋯ / right-click menu is open, and where to draw it.
  const [packMenu, setPackMenu] = useState<{ packPath: string; x: number; y: number } | null>(null)
  // Tag filter for the sidebar's pack list (undefined = show all packs).
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined)
  // One-line confirmation with Undo, used after hiding a pack — undo
  // instead of an "Are you sure?" dialog keeps hiding to a single click.
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  // A tag filter belongs to the pack list you set it on — switching tabs
  // starts clean rather than carrying a filter into a list it may not fit.
  useEffect(() => {
    setActiveTagId(undefined)
  }, [lib.browse.scope])

  const openPackMenu = useCallback((packPath: string, x: number, y: number) => setPackMenu({ packPath, x, y }), [])
  const closePackMenu = useCallback(() => setPackMenu(null), [])

  const hidePackWithUndo = useCallback(
    (packPath: string) => {
      const wasInSession = lib.sessionPackPaths.has(packPath)
      const name = lib.packs.find((p) => p.packPath === packPath)?.packName ?? 'Pack'
      lib.hidePack(packPath)
      setToast({
        message: wasInSession ? `“${name}” removed and hidden from sessions` : `“${name}” hidden from sessions`,
        onUndo: () => lib.unhidePack(packPath, wasInSession),
      })
    },
    [lib],
  )

  const toggleAllSamplesFolders = useCallback(() => {
    // Hiding the panel only hides it — it doesn't reset the folder you were
    // looking at, so reopening lands you right back where you were.
    setShowAllSamplesFolders((v) => !v)
  }, [])

  // Guards against "play() request was interrupted by a new load request":
  // clicking a new row before the previous play() promise settles is normal
  // usage, not a real failure.
  const play = useCallback(async (sample: ScannedSample) => {
    const requestId = ++playRequestId.current
    try {
      const buf = await window.api.readFileBuffer(sample.path)
      if (requestId !== playRequestId.current) return

      const blob = new Blob([buf], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const audio = audioRef.current
      if (!audio) return

      audio.pause()
      audio.src = url
      await audio.play()

      if (requestId !== playRequestId.current) {
        audio.pause()
        return
      }
      setPlayingId(sample.id)
    } catch (err) {
      if (requestId !== playRequestId.current) return
      const name = (err as { name?: string })?.name
      if (name === 'AbortError') return
      console.error(err)
    }
  }, [])

  const stop = useCallback(() => {
    playRequestId.current++
    audioRef.current?.pause()
    setPlayingId(null)
  }, [])

  const togglePin = useCallback((sample: ScannedSample) => lib.togglePin(sample.id), [lib])

  const rowData: RowData = {
    items: lib.browseItems,
    playingId,
    favorites: lib.favorites,
    pinned: lib.pinned,
    showPackColumn: !lib.browse.packPath,
    onPlay: play,
    onStop: stop,
    onToggleFavorite: lib.toggleFavorite,
    onTogglePin: togglePin,
    onOpenPack: lib.openPack,
  }

  const isFocused = Boolean(lib.browse.packPath)
  const sessionIsEmpty = lib.browse.scope === 'session' && lib.sessionPackPaths.size === 0
  // A session with zero packs gets a dedicated full-width empty state
  // instead — the sidebar has nothing to show yet, so it's replaced rather
  // than shown empty with an instructional line.
  const showSidebar =
    lib.browse.scope === 'pack' ||
    (lib.browse.scope === 'session' && !sessionIsEmpty) ||
    (lib.browse.scope === 'all' && showAllSamplesFolders)

  const sidebarRootLabel =
    lib.browse.scope === 'session'
      ? 'All session samples'
      : lib.browse.scope === 'all'
        ? 'All samples'
        : undefined

  // Session packs gets its own sidebar header: the count plus the two pack
  // actions (Shuffle, Edit packs) grouped right where the packs themselves
  // live — kept visually separate from session switching, which lives in
  // the header above instead. Every other scope falls back to the sidebar's
  // plain default "Packs · N" label.
  const sidebarHeader =
    lib.browse.scope === 'session' ? (
      <div style={{ marginBottom: 8 }}>
        {/* column-head = same 28px row as "Sound type" on the right, so the
            two column titles line up across the divider. */}
        <div className="section-label column-head" style={{ padding: '0 4px', marginBottom: 8 }}>
          Session packs · {lib.sessionPackPaths.size}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 4px' }}>
          <button
            className="btn btn-sm"
            onClick={lib.reshuffleSessionPacks}
            title="Swap every pack in this session for a new random pick, same count"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <ShuffleIcon size={13} />
            Shuffle
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setManagePacksOpen(true)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <PencilIcon size={12} />
            Edit packs
          </button>
        </div>
      </div>
    ) : undefined

  const searchPlaceholder = isFocused
    ? 'Search this pack…'
    : lib.browse.scope === 'session'
      ? 'Search session packs…'
      : lib.browse.scope === 'favorites'
        ? 'Search favorites…'
        : 'Search all samples…'

  const sampleCount = lib.browseItems.filter((i) => i.kind === 'sample').length
  const hasTypeFilter = Boolean(lib.browse.category) || Boolean(lib.browse.format)
  const hasActiveFilter = Boolean(lib.browse.query) || hasTypeFilter

  const clearTypeFilter = useCallback(() => {
    lib.setCategory(undefined)
    lib.setFormat(undefined)
  }, [lib])

  const folderDisplayName = useMemo(() => {
    if (!lib.folder) return ''
    const segs = lib.folder.split('/').filter(Boolean)
    return segs[segs.length - 1] ?? lib.folder
  }, [lib.folder])

  // Escalating "no matches" options — widen one step at a time rather than
  // dumping you straight back to the whole library.
  const noMatchActions = useMemo(() => {
    const actions: { label: string; onClick: () => void }[] = []
    if (isFocused && lib.browse.scope === 'session') {
      actions.push({ label: 'Search all session packs', onClick: lib.searchSessionWide })
    }
    if (lib.browse.scope !== 'all') {
      actions.push({ label: 'Search entire library', onClick: lib.searchAll })
    }
    return actions
  }, [isFocused, lib.browse.scope, lib.searchSessionWide, lib.searchAll])

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: '14px 20px 28px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        // Belt-and-suspenders: nothing inside should ever need to push the
        // whole window wider to be seen — anything that doesn't fit scrolls
        // inside its own row (Sound type, the sample list), never here.
        overflowX: 'hidden',
      }}
    >
      {/* Compact header: brand, current library (abbreviated, full path on
          hover), and the one action that changes it — all one row. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <BrandMark />
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Sample Browser</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lib.folder && (
            <span className="text-faint" style={{ fontSize: 12 }} title={lib.folder}>
              {folderDisplayName}
            </span>
          )}
          <button className="btn" onClick={lib.chooseFolder}>
            {lib.folder ? 'Change folder…' : 'Choose folder…'}
          </button>
        </div>
      </div>
      {lib.status && (
        <div style={{ fontSize: 12, color: 'var(--accent-strong)', marginTop: 4, flexShrink: 0 }}>{lib.status}</div>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} style={{ display: 'none' }} />

      {packMenu &&
        (() => {
          const info = lib.packs.find((p) => p.packPath === packMenu.packPath)
          if (!info) return null
          const path = packMenu.packPath
          return (
            <PackMenu
              packPath={path}
              packName={info.packName}
              x={packMenu.x}
              y={packMenu.y}
              inSession={lib.sessionPackPaths.has(path)}
              isHidden={lib.hiddenPacks.has(path)}
              tags={lib.tags}
              onClose={closePackMenu}
              onSwap={() => lib.replacePack(path)}
              onAddToSession={() => lib.addPackToSession(path)}
              onRemoveFromSession={() => lib.removePackFromSession(path)}
              onHide={() => hidePackWithUndo(path)}
              onUnhide={() => lib.unhidePack(path)}
              onToggleTag={(tagId) => lib.toggleTagOnPack(tagId, path)}
              onCreateTag={(name, color) => lib.createTag(name, color, path)}
            />
          )
        })()}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              className="btn btn-ghost btn-sm toast-undo"
              onClick={() => {
                toast.onUndo?.()
                setToast(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {!lib.folder ? (
        <p className="text-muted" style={{ marginTop: 24 }}>
          Choose a folder to get started.
        </p>
      ) : (
        <>
          {/* Session header: which session you're in and whether it's
              autosaving, visible above all three tabs — not something that
              belongs to just one of them. Session switching lives entirely
              in this popover; pack editing (Shuffle, Edit packs) lives down
              in the Session packs sidebar instead, so the two stay visually
              separate. */}
          <div style={{ marginTop: 14, flexShrink: 0 }}>
            <SessionBar
              activeSession={lib.activeSession}
              recentSessions={lib.recentSessions}
              activeSessionId={lib.activeSessionId}
              saveStatus={lib.saveStatus}
              onSwitch={lib.switchSession}
              onCreate={lib.createSession}
              onRename={lib.renameSession}
              onDuplicate={lib.duplicateSession}
              onDelete={lib.deleteSession}
              onRetry={lib.retrySave}
            />
          </div>

          {/* Nav: All samples / Favorites / Session packs — one browser, three scopes */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 10, flexShrink: 0 }}>
            <button
              className={`nav-pill${lib.browse.scope === 'all' ? ' is-active' : ''}`}
              onClick={() => lib.setScope('all')}
            >
              All samples
            </button>
            <button
              className={`nav-pill${lib.browse.scope === 'favorites' ? ' is-active' : ''}`}
              onClick={() => lib.setScope('favorites')}
            >
              Favorites ({lib.favorites.size})
            </button>
            <button
              className={`nav-pill${lib.browse.scope === 'session' ? ' is-active' : ''}`}
              onClick={() => lib.setScope('session')}
            >
              Session packs ({lib.sessionPackPaths.size})
            </button>
          </div>

          {/* Pinned tray: reachable regardless of scope */}
          <div style={{ flexShrink: 0 }}>
            <PinnedTray
              pinned={lib.pinned}
              samplesById={lib.samplesById}
              playingId={playingId}
              onPlay={play}
              onStop={stop}
              onRemovePin={lib.removePin}
            />
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 12px', flexShrink: 0 }} />

          {managePacksOpen && (
            <div
              className="modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setManagePacksOpen(false)
              }}
            >
              <SessionPackPicker
                packs={lib.packs}
                sessionPackPaths={lib.sessionPackPaths}
                onAdd={lib.addPackToSession}
                onRemove={lib.removePackFromSession}
                onPickRandom={lib.pickRandomPacks}
                onReplace={lib.replacePack}
                onClearAll={lib.clearSessionPacks}
                onClose={() => setManagePacksOpen(false)}
                hiddenPacks={lib.hiddenPacks}
                onUnhide={(path) => lib.unhidePack(path)}
              />
            </div>
          )}

          {/* Stable browsing toolbar: one full-width row, same in every
              scope — whatever leading control applies (Back, or the Folders
              toggle on All samples) flush left, search filling the rest.
              Session switching (header above) and pack editing (Session
              packs sidebar below) both live elsewhere now, so this row
              never has to change shape or width between scopes, and its
              controls never move when the Folders sidebar opens or closes. */}
          {!(sessionIsEmpty) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 14, flexShrink: 0 }}>
              {lib.canGoBack ? (
                <button className="icon-btn" onClick={lib.goBack} title="Back" style={{ flexShrink: 0 }}>
                  <ArrowLeftIcon />
                </button>
              ) : lib.browse.scope === 'all' ? (
                <button
                  className={`icon-btn${showAllSamplesFolders ? ' is-active' : ''}`}
                  onClick={toggleAllSamplesFolders}
                  title={showAllSamplesFolders ? 'Hide folders' : 'Show folders'}
                  style={{ flexShrink: 0 }}
                >
                  <FolderIcon size={14} />
                </button>
              ) : null}
              <div className="search-field" style={{ flex: 1, height: 36, minWidth: 0 }}>
                <SearchIcon />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={lib.browse.query}
                  onChange={(e) => lib.setQuery(e.target.value)}
                  className="input"
                  style={{ height: 36, boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}

          {/* Sidebar + results share this row — this is the part that's
              allowed to change width when the Folders panel opens or
              closes. The toolbar above never moves because of it. Everything
              that describes THIS location — breadcrumb, sound-type filters,
              result count — now lives inside the results column on the
              right, so it visually aligns with the list it's describing
              instead of spanning over the sidebar too. When the sidebar is
              hidden, this column simply expands to fill the row. This row
              also fills whatever vertical space is left in the window,
              rather than growing the page past it — the sample list inside
              is what scrolls, not the page. */}
          <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, minWidth: 0 }}>
            {sessionIsEmpty ? (
              // A brand-new session (or one you've cleared) starts here —
              // an inviting jumping-off point instead of a blank sidebar and
              // an empty table, shown only for this exact moment (opening an
              // empty Session packs tab or right after creating a session).
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ maxWidth: 380 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Choose a few packs to explore</h2>
                  <p className="text-muted" style={{ fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                    Build a smaller pool of sounds for this session so you're not scrolling the whole library. Favorites
                    still work everywhere, and you can change this selection anytime.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                    <button className="btn btn-primary" onClick={() => setManagePacksOpen(true)}>
                      Choose packs
                    </button>
                    <button
                      className="btn"
                      onClick={() => lib.pickRandomPacks(3)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      disabled={lib.packs.length === 0}
                    >
                      <ShuffleIcon size={13} />
                      Pick 3 for me
                    </button>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => lib.setScope('all')}>
                    Browse all samples instead
                  </button>
                </div>
              </div>
            ) : (
              <>
                {showSidebar && (
                  <PackTreeSidebar
                    packs={lib.sidebarPacks}
                    packTrees={lib.packTrees}
                    focusedPath={lib.browse.folderPath}
                    rootLabel={sidebarRootLabel}
                    header={sidebarHeader}
                    onFocus={lib.focusNode}
                    onClearFocus={lib.clearFocus}
                    tags={lib.tags}
                    tagsByPack={lib.tagsByPack}
                    hiddenPacks={lib.hiddenPacks}
                    activeTagId={activeTagId}
                    onSelectTag={setActiveTagId}
                    onOpenPackMenu={openPackMenu}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Empty states that route forward instead of dead-ending.
                  (Session's zero-pack case gets its own full-width state
                  above, replacing this whole row instead.) */}
              {lib.browse.scope === 'favorites' && lib.favorites.size === 0 && (
                <p className="text-muted">
                  No favorites yet.{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => lib.setScope('all')}>
                    Browse all samples
                  </button>
                </p>
              )}

              {/* "What am I looking for" — a filter on the current location,
                  not a second way to navigate. Session packs → Monte Booker →
                  Drums, filtered to Kick: these work together, not against
                  each other. Lives here, next to the list it filters, rather
                  than up in the toolbar. */}
              <CategoryFilterBar
                counts={lib.categoryCounts}
                formatCounts={lib.formatCounts}
                activeCategory={lib.browse.category}
                activeFormat={lib.browse.format}
                onSelectCategory={lib.setCategory}
                onSelectFormat={lib.setFormat}
              />

              {/* "Where am I + how many": the pack/folder trail and the result
                  count share one quiet line directly above the list. This
                  used to be a separate title row ABOVE Sound type, which
                  pushed the filters down and out of line with the sidebar's
                  header. Now both columns start on the same row. */}
              {(lib.browseItems.length > 0 || isFocused) && (
                <div className="count-line">
                  {isFocused && lib.breadcrumbs.length > 0 ? (
                    lib.breadcrumbs.map((crumb, i) => (
                      <span key={crumb.folderPath} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {i > 0 && (
                          <span style={{ color: 'var(--text-faint)', display: 'flex' }}>
                            <ChevronIcon size={10} />
                          </span>
                        )}
                        <button
                          className={`crumb${i === lib.breadcrumbs.length - 1 ? ' is-current' : ''}`}
                          onClick={() => lib.focusNode(lib.browse.packPath!, crumb.folderPath)}
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))
                  ) : sidebarRootLabel && showSidebar ? (
                    <span className="crumb is-current" style={{ cursor: 'default' }}>
                      {sidebarRootLabel}
                    </span>
                  ) : null}
                  <span className="text-faint">
                    {(isFocused || (sidebarRootLabel && showSidebar)) && '· '}
                    {sampleCount.toLocaleString()} sample{sampleCount === 1 ? '' : 's'}
                  </span>
                </div>
              )}

              <div
                className="panel"
                style={{ padding: '0 14px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                {lib.browseItems.length > 0 && (
                  <>
                    <div className="row-header" style={{ flexShrink: 0 }}>
                      <div style={{ width: 40, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>Name</div>
                      {!isFocused && <div style={{ width: 170, flexShrink: 0 }}>Pack</div>}
                      <div style={{ width: 32, flexShrink: 0 }} />
                      <div style={{ width: 32, flexShrink: 0 }} />
                      <div style={{ width: 32, flexShrink: 0 }} />
                    </div>
                    <div ref={listWrapRef} style={{ flex: 1, minHeight: 0 }}>
                      <List
                        className="scroll-area"
                        height={listHeight}
                        width="100%"
                        itemCount={lib.browseItems.length}
                        itemSize={ROW_HEIGHT}
                        itemData={rowData}
                      >
                        {BrowseRow}
                      </List>
                    </div>
                  </>
                )}

                {lib.browseItems.length === 0 &&
                  lib.browse.scope === 'all' &&
                  lib.samples.length === 0 && (
                    <p className="text-muted" style={{ padding: '18px 0' }}>
                      <FolderIcon size={13} style={{ marginRight: 6, verticalAlign: -1 }} />
                      No WAV files found in this folder.
                    </p>
                  )}

                {lib.browseItems.length === 0 &&
                  hasActiveFilter &&
                  (lib.samples.length > 0 || lib.browse.scope !== 'all') &&
                  (lib.browse.scope !== 'favorites' || lib.favorites.size > 0) &&
                  (lib.browse.scope !== 'session' || lib.sessionPackPaths.size > 0) && (
                    <p className="text-muted" style={{ padding: '18px 0' }}>
                      {lib.browse.query ? `No matches for "${lib.browse.query}" here.` : 'Nothing matches this filter here.'}{' '}
                      {hasTypeFilter && (
                        <button className="btn btn-ghost btn-sm" onClick={clearTypeFilter} style={{ marginRight: 6 }}>
                          Clear filters
                        </button>
                      )}
                      {noMatchActions.map((a) => (
                        <button key={a.label} className="btn btn-ghost btn-sm" onClick={a.onClick} style={{ marginRight: 6 }}>
                          {a.label}
                        </button>
                      ))}
                    </p>
                  )}
              </div>
            </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
