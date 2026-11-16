import { useEffect, useRef, useState } from 'react'
import type { PackTag } from '../../electron/preload'
import { TAG_COLORS } from '../hooks/useLibrary'
import { ArrowLeftIcon, CheckIcon, ChevronIcon, SwapIcon } from './Icon'

// The ⋯ / right-click menu for one pack in the sidebar.
//
// Workflow note: shuffling session packs kept handing me packs with nothing I
// liked, and the only way to deal with one was to open the Edit packs modal
// and find it in a 400-pack list. Every pack action now lives right on the
// pack itself — hover for ⋯, or right-click, the same way Finder and Ableton
// work.
//
// Two different "get rid of it" actions, on purpose:
//   • Remove from session — the common case. One click, no questions.
//   • Hide from sessions  — "this pack isn't my sound." Removes it from the
//     session too (you'd always want both), and keeps it out of every future
//     Shuffle / Pick for me. Undo lives in a toast instead of a confirm
//     dialog, so neither action costs an extra click.
//
// Tags open as a second view inside the same menu (not a flyout), so it
// stays one compact card and works the same from a right-click.

interface Props {
  packPath: string
  packName: string
  // Where to draw the menu (viewport coords) — from the ⋯ button or the
  // right-click position.
  x: number
  y: number
  inSession: boolean
  isHidden: boolean
  tags: PackTag[]
  onClose: () => void
  onSwap: () => void
  onAddToSession: () => void
  onRemoveFromSession: () => void
  onHide: () => void
  onUnhide: () => void
  onToggleTag: (tagId: string) => void
  onCreateTag: (name: string, color: string) => void
}

export function PackMenu({
  packPath,
  packName,
  x,
  y,
  inSession,
  isHidden,
  tags,
  onClose,
  onSwap,
  onAddToSession,
  onRemoveFromSession,
  onHide,
  onUnhide,
  onToggleTag,
  onCreateTag,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'main' | 'tags'>('main')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])

  // Close on outside click or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Keep the menu on screen when opened near the bottom/right edge.
  const MENU_W = 230
  const left = Math.min(x, window.innerWidth - MENU_W - 8)
  const top = Math.min(y, window.innerHeight - 300)

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const submitNewTag = () => {
    if (!newName.trim()) return
    onCreateTag(newName, newColor)
    setNewName('')
    setCreating(false)
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${packName}`}
      className="modal-card pack-menu"
      style={{ position: 'fixed', left, top, width: MENU_W, padding: 6, zIndex: 30 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {view === 'main' ? (
        <>
          <div className="pack-menu-title" title={packName}>
            {packName}
          </div>
          {inSession ? (
            <>
              <button role="menuitem" className="menu-item" onClick={act(onSwap)}>
                <SwapIcon size={12} />
                Swap for another pack
              </button>
              <button role="menuitem" className="menu-item" onClick={act(onRemoveFromSession)}>
                Remove from session
              </button>
            </>
          ) : (
            !isHidden && (
              <button role="menuitem" className="menu-item" onClick={act(onAddToSession)}>
                Add to session
              </button>
            )
          )}
          <button role="menuitem" className="menu-item" onClick={() => setView('tags')}>
            Tags
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
              {tags
                .filter((t) => t.packPaths.includes(packPath))
                .map((t) => (
                  <span key={t.id} className="tag-dot" style={{ background: t.color }} />
                ))}
              <ChevronIcon size={10} />
            </span>
          </button>
          <div className="menu-divider" />
          {isHidden ? (
            <button role="menuitem" className="menu-item" onClick={act(onUnhide)}>
              Unhide pack
            </button>
          ) : (
            <button
              role="menuitem"
              className="menu-item"
              onClick={act(onHide)}
              title="Removes it from this session and keeps it out of future Shuffles. Files aren't touched."
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>Hide from sessions</span>
                <span className="menu-hint">Not my sound — never shuffle it in</span>
              </span>
            </button>
          )}
        </>
      ) : (
        <>
          <button className="menu-item" onClick={() => setView('main')} style={{ color: 'var(--text-muted)' }}>
            <ArrowLeftIcon size={12} />
            Tags
          </button>
          <div className="menu-divider" />
          {tags.length === 0 && !creating && (
            <div className="menu-hint" style={{ padding: '4px 8px 6px' }}>
              Group packs your way — e.g. "Ableton", "Drill", "Go-to drums".
            </div>
          )}
          {tags.map((t) => {
            const on = t.packPaths.includes(packPath)
            return (
              <button key={t.id} role="menuitemcheckbox" aria-checked={on} className="menu-item" onClick={() => onToggleTag(t.id)}>
                <span className="tag-dot" style={{ background: t.color }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{t.name}</span>
                {on && <CheckIcon size={12} />}
              </button>
            )
          })}
          {creating ? (
            // Inline create: name + one of six colors, Enter to save. The new
            // tag is applied to this pack immediately — making a tag is
            // almost always because you want it on the pack in front of you.
            <div style={{ padding: '6px 6px 4px' }}>
              <input
                autoFocus
                className="input"
                placeholder="Tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') submitNewTag()
                  if (e.key === 'Escape') setCreating(false)
                }}
                style={{ width: '100%', height: 28, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Color ${c}`}
                    className={`color-swatch${newColor === c ? ' is-selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={submitNewTag} disabled={!newName.trim()}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button className="menu-item" onClick={() => setCreating(true)} style={{ color: 'var(--accent-strong)' }}>
              + New tag
            </button>
          )}
        </>
      )}
    </div>
  )
}
