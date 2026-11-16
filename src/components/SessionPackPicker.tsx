import { useMemo, useState } from 'react'
import type { PackInfo } from '../hooks/useLibrary'
import { CloseIcon, SearchIcon, ShuffleIcon, SwapIcon } from './Icon'

interface Props {
  packs: PackInfo[]
  sessionPackPaths: Set<string>
  onAdd: (packPath: string) => void
  onRemove: (packPath: string) => void
  onPickRandom: (count: number) => void
  onReplace: (oldPackPath: string) => void
  onClearAll: () => void
  onClose: () => void
  hiddenPacks: Set<string>
  onUnhide: (packPath: string) => void
}

// "Edit packs" — the panel's only job is search/add/remove/swap for the
// active session's pack selection. Naming, switching, and saving sessions
// all live in the SessionBar above the nav tabs now; every change here
// autosaves immediately, so this modal is just opened, used, and closed.
export function SessionPackPicker({
  packs,
  sessionPackPaths,
  onAdd,
  onRemove,
  onPickRandom,
  onReplace,
  onClearAll,
  onClose,
  hiddenPacks,
  onUnhide,
}: Props) {
  const [showHidden, setShowHidden] = useState(false)
  const [randomCount, setRandomCount] = useState(3)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  // Selected packs float to the top — with dozens of packs in the library,
  // that's the difference between scanning the whole list to find what you
  // checked and having it all right there to review or deselect.
  const sorted = useMemo(() => {
    return [...packs].sort((a, b) => {
      const aSel = sessionPackPaths.has(a.packPath)
      const bSel = sessionPackPaths.has(b.packPath)
      if (aSel !== bSel) return aSel ? -1 : 1
      return a.packName.localeCompare(b.packName)
    })
  }, [packs, sessionPackPaths])
  // Hidden ("not my sound") packs are kept out of the main list so they
  // stop competing for attention, and listed in their own collapsed section
  // at the bottom where any of them can be brought back.
  const notHidden = sorted.filter((p) => !hiddenPacks.has(p.packPath))
  const hiddenList = sorted.filter((p) => hiddenPacks.has(p.packPath))
  const visible = q ? notHidden.filter((p) => p.packName.toLowerCase().includes(q)) : notHidden
  const eligibleCount = notHidden.filter((p) => !sessionPackPaths.has(p.packPath)).length

  return (
    <div className="modal-card" style={{ width: 460, maxWidth: '90vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>Edit packs</strong>
        <button className="icon-btn" onClick={onClose} title="Close">
          <CloseIcon />
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          padding: '8px 10px',
          background: 'var(--surface-alt)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <ShuffleIcon size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick for me</span>
        <input
          type="number"
          min={1}
          max={Math.max(1, packs.length)}
          value={randomCount}
          onChange={(e) => setRandomCount(Number(e.target.value) || 1)}
          className="input"
          style={{ width: 50, padding: '4px 6px' }}
        />
        <button className="btn btn-sm" onClick={() => onPickRandom(randomCount)} disabled={eligibleCount === 0}>
          random pack(s)
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="search-field" style={{ flex: 1 }}>
          <SearchIcon size={13} />
          <input
            type="text"
            placeholder="Search packs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input"
          />
        </div>
        {/* Emptying this session's pack selection — one click instead of
            unchecking every box by hand. Pins stay put either way. */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onClearAll}
          disabled={sessionPackPaths.size === 0}
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          title="Uncheck every pack in this session"
        >
          Deselect all
        </button>
      </div>

      <div
        className="scroll-area"
        style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
      >
        {visible.length === 0 && (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text-faint)' }}>
            {packs.length === 0 ? 'No packs indexed yet — choose a folder first.' : 'No packs match.'}
          </div>
        )}
        {visible.map((p) => {
          const isSelected = sessionPackPaths.has(p.packPath)
          return (
            <div
              key={p.packPath}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderBottom: '1px solid var(--border)',
                background: isSelected ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => (isSelected ? onRemove(p.packPath) : onAdd(p.packPath))}
              />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  color: isSelected ? 'var(--accent-strong)' : 'var(--text)',
                  fontWeight: isSelected ? 500 : 400,
                }}
                title={p.packName}
              >
                {p.packName}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{p.count}</span>
              {isSelected && (
                // Deliberately a labeled button, not a bare icon: the
                // checkbox already handles "remove this pack", so this one
                // needs to read as its own, different action — swapping it
                // for a different random pack — at a glance.
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => onReplace(p.packPath)}
                  title="Keep a pack selected, but swap this one for a different random pack"
                >
                  <SwapIcon size={12} />
                  Swap
                </button>
              )}
            </div>
          )
        })}
      </div>

      {hiddenList.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            style={{ padding: '2px 4px' }}
          >
            {showHidden ? '▾' : '▸'} Hidden from sessions ({hiddenList.length})
          </button>
          {showHidden && (
            <div
              className="scroll-area"
              style={{ maxHeight: 140, overflowY: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
            >
              {hiddenList.map((p) => (
                <div
                  key={p.packPath}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}
                >
                  <span
                    className="text-muted"
                    style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={p.packName}
                  >
                    {p.packName}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => onUnhide(p.packPath)}>
                    Unhide
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <span className="text-faint" style={{ fontSize: 12 }}>
          {sessionPackPaths.size} pack(s) selected
        </span>
        <button className="btn btn-primary btn-sm" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
