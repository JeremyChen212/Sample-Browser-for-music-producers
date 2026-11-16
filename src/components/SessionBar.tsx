import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SavedSession } from '../../electron/preload'
import { CheckIcon, ChevronIcon, PencilIcon } from './Icon'

interface Props {
  activeSession?: SavedSession
  recentSessions: SavedSession[]
  activeSessionId: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onSwitch: (id: string) => void
  onCreate: () => string | void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
  // Ableton set link for this session (one beat = one session = one set).
  projectStatus: { name: string; error?: string } | null
  onLinkSet: () => void
  onUnlinkSet: () => void
}

// One always-visible header: which session you're in, that it's autosaving,
// and everything to manage sessions — all behind a single title button
// rather than spread across a name pill, a separate switcher select, and a
// floating pencil icon. Rendered once, above the nav tabs, so it reads as
// "this is your current workspace" rather than belonging to any one tab.
// Session switching lives entirely in this popover; pack editing (Shuffle,
// Edit packs) lives in the Session packs sidebar instead — the two are kept
// visually separate on purpose.
export function SessionBar({
  activeSession,
  recentSessions,
  activeSessionId,
  saveStatus,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onRetry,
  projectStatus,
  onLinkSet,
  onUnlinkSet,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  // Which row in the dropdown is being renamed in place, and which row is
  // asking "Delete?" — both live on the row itself instead of acting only
  // on the active session from a menu at the bottom.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rowDraft, setRowDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Set right after "+ New session" so the new session's name opens ready
  // to type over, instead of piling up more identically named sessions.
  const [renameAfterCreate, setRenameAfterCreate] = useState(false)

  useEffect(() => {
    if (!renameAfterCreate || !activeSession) return
    setNameDraft(activeSession.name)
    setRenaming(true)
    setRenameAfterCreate(false)
  }, [renameAfterCreate, activeSession])

  useEffect(() => {
    if (!menuOpen) {
      setEditingId(null)
      setConfirmDeleteId(null)
    }
  }, [menuOpen])

  const commitRowRename = (id: string) => {
    const trimmed = rowDraft.trim()
    if (trimmed) onRename(id, trimmed)
    setEditingId(null)
  }
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!menuOpen) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    // Land keyboard focus on the first item the moment the menu opens, so
    // arrow keys work immediately without an extra Tab press.
    const raf = requestAnimationFrame(() => itemRefs.current[0]?.focus())
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      cancelAnimationFrame(raf)
    }
  }, [menuOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    triggerRef.current?.focus()
  }

  // Roving keyboard nav across whatever menu items are currently rendered
  // (New session, each recent session, Rename/Duplicate/Delete) — arrow keys
  // move focus, Home/End jump to the ends, Escape and Tab both close and
  // hand focus back to the trigger.
  const handleMenuKeyDown = (e: KeyboardEvent) => {
    // Typing a new name inside a row shouldn't trigger menu navigation.
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el))
    const currentIndex = items.findIndex((el) => el === document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(currentIndex + 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(currentIndex - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
    } else if (e.key === 'Tab') {
      closeMenu()
    }
  }

  const startRename = () => {
    setNameDraft(activeSession?.name ?? '')
    setRenaming(true)
    setMenuOpen(false)
  }
  const confirmRename = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && activeSessionId) onRename(activeSessionId, trimmed)
    setRenaming(false)
  }

  if (renaming) {
    return (
      <input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        type="text"
        className="input"
        style={{ width: 220, height: 30, fontSize: 14, fontWeight: 700, padding: '3px 10px' }}
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onBlur={confirmRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmRename()
          if (e.key === 'Escape') setRenaming(false)
        }}
      />
    )
  }

  // Assigns sequential slots in itemRefs as menu items render below, so
  // keyboard nav always matches what's actually on screen (the recent
  // sessions list can be empty, grow, or shrink).
  let itemIndex = -1
  const nextIndex = () => {
    itemIndex += 1
    return itemIndex
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <button
        ref={triggerRef}
        onClick={() => setMenuOpen((v) => !v)}
        // Workflow note: renaming used to be buried at the bottom of the
        // menu and only worked on whichever session was active. Double-
        // clicking the title now renames it right where you're looking.
        onDoubleClick={startRename}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Switch or manage sessions · double-click to rename"
        className={`session-title-btn${menuOpen ? ' is-open' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text)',
          padding: '5px 8px',
          maxWidth: 260,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeSession?.name ?? 'Untitled session'}
        </span>
        <ChevronIcon direction="down" size={12} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
      </button>

      <span className="text-faint" style={{ fontSize: 12 }}>
        {saveStatus === 'saving' && 'Saving…'}
        {saveStatus === 'error' && (
          <>
            Couldn't save{' '}
            <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </span>

      {/* Lives next to the session name because a session IS a beat — the
          set it's linked to is part of its identity, not a global setting. */}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
        {projectStatus ? (
          <>
            <span className={`set-link${projectStatus.error ? ' is-error' : ''}`} title={projectStatus.error ?? 'Samples in this set\'s last save are marked "In project"'}>
              <span className="set-link-dot" />
              {projectStatus.name}
              {projectStatus.error && ` · ${projectStatus.error}`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={onUnlinkSet}>
              Unlink
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onLinkSet}
            title="Pick this beat's Ableton set (.als). Samples you drag in get marked “In project” whenever you save it."
          >
            Link Ableton set…
          </button>
        )}
      </span>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Sessions"
          onKeyDown={handleMenuKeyDown}
          className="modal-card"
          style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 240, padding: 6, zIndex: 20 }}
        >
          <button
            ref={(el) => {
              itemRefs.current[nextIndex()] = el
            }}
            role="menuitem"
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
            onClick={() => {
              setMenuOpen(false)
              onCreate()
              setRenameAfterCreate(true)
            }}
          >
            + New session
          </button>
          {recentSessions.length > 0 && (
            <div className="scroll-area" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {recentSessions.map((s) => {
                const count = s.packPaths?.length ?? 0
                const isActive = s.id === activeSessionId
                // Rename in place — same row, same spot.
                if (editingId === s.id) {
                  return (
                    <div key={s.id} style={{ padding: '3px 4px' }}>
                      <input
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        className="input"
                        value={rowDraft}
                        onChange={(e) => setRowDraft(e.target.value)}
                        onBlur={() => commitRowRename(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRowRename(s.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        style={{ width: '100%', height: 28, fontSize: 13 }}
                      />
                    </div>
                  )
                }
                // Delete asks once, on the row itself — a session holds your
                // pins, so a single mis-click shouldn't wipe it out.
                if (confirmDeleteId === s.id) {
                  return (
                    <div key={s.id} className="session-row" style={{ background: 'var(--surface-alt)' }}>
                      <span style={{ flex: 1, fontSize: 13 }}>Delete “{s.name}”?</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => {
                          setConfirmDeleteId(null)
                          onDelete(s.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )
                }
                return (
                  <div key={s.id} className={`session-row${isActive ? ' is-active' : ''}`}>
                    <button
                      ref={(el) => {
                        itemRefs.current[nextIndex()] = el
                      }}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        if (!isActive) onSwitch(s.id)
                      }}
                      onDoubleClick={() => {
                        setRowDraft(s.name)
                        setEditingId(s.id)
                      }}
                      className="session-row-main"
                      title="Open · double-click to rename"
                    >
                      <span style={{ width: 14, flexShrink: 0, display: 'flex' }}>{isActive && <CheckIcon size={12} />}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      <span className="session-row-count">
                        {count} pack{count === 1 ? '' : 's'}
                      </span>
                    </button>
                    {/* Hover actions: rename and delete any session, not just the active one. */}
                    <span className="session-row-actions">
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        title="Rename"
                        aria-label={`Rename ${s.name}`}
                        onClick={() => {
                          setRowDraft(s.name)
                          setEditingId(s.id)
                        }}
                      >
                        <PencilIcon size={11} />
                      </button>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22, color: 'var(--danger)' }}
                        title="Delete"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => setConfirmDeleteId(s.id)}
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          {/* Rename/Delete moved onto each row above; only Duplicate stays
              here since it's about the session you're currently in. */}
          <button
            ref={(el) => {
              itemRefs.current[nextIndex()] = el
            }}
            role="menuitem"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              setMenuOpen(false)
              onDuplicate(activeSessionId)
            }}
          >
            Duplicate current session
          </button>
        </div>
      )}
    </div>
  )
}

function TrashIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
    </svg>
  )
}
