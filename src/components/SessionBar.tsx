import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SavedSession } from '../../electron/preload'
import { CheckIcon, ChevronIcon } from './Icon'

interface Props {
  activeSession?: SavedSession
  recentSessions: SavedSession[]
  activeSessionId: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onSwitch: (id: string) => void
  onCreate: () => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
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
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
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
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Switch or manage sessions"
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
            }}
          >
            + New session
          </button>
          {recentSessions.length > 0 && (
            <div className="scroll-area" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {recentSessions.map((s) => {
                const count = s.packPaths?.length ?? 0
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      itemRefs.current[nextIndex()] = el
                    }}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      if (s.id !== activeSessionId) onSwitch(s.id)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      textAlign: 'left',
                      background: s.id === activeSessionId ? 'var(--accent-soft)' : 'none',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      font: 'inherit',
                      fontSize: 13,
                      color: s.id === activeSessionId ? 'var(--accent-strong)' : 'var(--text)',
                    }}
                  >
                    <span style={{ width: 14, flexShrink: 0, display: 'flex' }}>
                      {s.id === activeSessionId && <CheckIcon size={12} />}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>
                      {count} pack{count === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          <button
            ref={(el) => {
              itemRefs.current[nextIndex()] = el
            }}
            role="menuitem"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={startRename}
          >
            Rename
          </button>
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
            Duplicate
          </button>
          <button
            ref={(el) => {
              itemRefs.current[nextIndex()] = el
            }}
            role="menuitem"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }}
            onClick={() => {
              setMenuOpen(false)
              onDelete(activeSessionId)
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
