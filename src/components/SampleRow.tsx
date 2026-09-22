import type { ListChildComponentProps } from 'react-window'
import type { ScannedSample } from '../../electron/preload'
import type { BrowseItem } from '../hooks/useLibrary'
import { CATEGORY_LABELS } from '../hooks/useLibrary'
import { PlayIcon, PauseIcon, HeartIcon, PinIcon, FolderIcon } from './Icon'

export interface RowData {
  items: BrowseItem[]
  playingId: string | null
  favorites: Set<string>
  pinned: string[]
  showPackColumn: boolean
  onPlay: (sample: ScannedSample) => void
  onStop: () => void
  onToggleFavorite: (id: string) => void
  onTogglePin: (sample: ScannedSample) => void
  onOpenPack: (packPath: string) => void
}

// Renders a sample row (play/pin/favorite/reveal/drag), or a "missing"
// placeholder for a favorited file no longer in the current scan.
// Folder-tree navigation lives in the sidebar now, not in this list.
export function BrowseRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const {
    items,
    playingId,
    favorites,
    pinned,
    showPackColumn,
    onPlay,
    onStop,
    onToggleFavorite,
    onTogglePin,
    onOpenPack,
  } = data
  const item = items[index]

  if (item.kind === 'missing') {
    return (
      <div className="row" style={{ ...style, color: 'var(--text-faint)', fontStyle: 'italic' }}>
        <div style={{ flex: 1, padding: '0 6px' }}>Missing file (was favorited)</div>
        <div style={{ width: 90, flexShrink: 0, padding: '0 6px' }}>
          <button className="btn btn-sm" onClick={() => onToggleFavorite(item.id)}>
            Remove
          </button>
        </div>
      </div>
    )
  }

  const s = item.sample
  const isPlaying = playingId === s.id
  const isFavorite = favorites.has(s.id)
  const isPinned = pinned.includes(s.id)

  return (
    <div
      className={`row${isPlaying ? ' is-playing' : ''}`}
      style={{ ...style, cursor: 'grab' }}
      draggable
      onDragStart={(e) => {
        // Native drag-out per Electron's file-drag pattern: cancel the
        // default HTML5 drag and hand the OS a real file drag instead.
        e.preventDefault()
        window.api.startDrag(s.path)
      }}
    >
      <div style={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button
          className={`icon-btn${isPlaying ? ' is-playing' : ''}`}
          onClick={() => (isPlaying ? onStop() : onPlay(s))}
          title={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
      <div
        style={{ flex: 1, minWidth: 0, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}
        title={s.name}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
        {s.category !== 'unknown' && <span className="type-tag">{CATEGORY_LABELS[s.category]}</span>}
      </div>
      {showPackColumn && (
        <div
          style={{
            width: 170,
            flexShrink: 0,
            padding: '0 6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={s.packName}
        >
          <button
            className="btn-ghost btn-sm"
            style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', border: 'none', padding: '2px 4px' }}
            onClick={() => onOpenPack(s.packPath)}
            title={`Open ${s.packName}`}
          >
            {s.packName}
          </button>
        </div>
      )}
      <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button
          className={`icon-btn${isPinned ? ' is-pinned' : ''}`}
          onClick={() => onTogglePin(s)}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <PinIcon filled={isPinned} />
        </button>
      </div>
      <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button
          className={`icon-btn${isFavorite ? ' is-favorite' : ''}`}
          onClick={() => onToggleFavorite(s.id)}
          title={isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
      <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button className="icon-btn" onClick={() => window.api.revealInFinder(s.path)} title="Reveal in Finder">
          <FolderIcon size={13} />
        </button>
      </div>
    </div>
  )
}
