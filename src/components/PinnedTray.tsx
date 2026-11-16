import type { ScannedSample } from '../../electron/preload'
import { PlayIcon, PauseIcon, CloseIcon, PinIcon } from './Icon'

interface Props {
  pinned: string[]
  samplesById: Map<string, ScannedSample>
  playingId: string | null
  onPlay: (sample: ScannedSample) => void
  onStop: () => void
  onRemovePin: (id: string) => void
  onDragged: (id: string) => void
}

// Persistent compact tray, reachable while browsing any scope: alternatives
// to compare against a pattern, or a combination to try together. One tray
// serves both uses — no separate modes.
export function PinnedTray({ pinned, samplesById, playingId, onPlay, onStop, onRemovePin, onDragged }: Props) {
  // Collapsed to a compact "Pinned · 0" label when empty, expanding only
  // once something's actually pinned — an empty tray shouldn't hold as much
  // vertical space as a full one. A fixed min-height on both branches still
  // keeps the first/last pin from nudging everything below it.
  if (pinned.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 32,
          fontSize: 12,
          color: 'var(--text-faint)',
          padding: '2px',
        }}
        title="Pin a sample to keep it handy while you keep browsing"
      >
        <PinIcon size={12} />
        Pinned · 0
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 32, padding: '2px' }}>
      <span
        className="text-faint"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }}
      >
        <PinIcon size={12} />
        Pinned · {pinned.length}
      </span>
      {pinned.map((id) => {
        const s = samplesById.get(id)
        if (!s) {
          return (
            <div key={id} className="chip" style={{ color: 'var(--text-faint)' }}>
              (missing file)
              <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => onRemovePin(id)}>
                <CloseIcon size={10} />
              </button>
            </div>
          )
        }
        const isPlaying = playingId === s.id
        return (
          <div
            key={id}
            draggable
            onDragStart={(e) => {
              e.preventDefault()
              window.api.startDrag(s.path)
              onDragged(s.id)
            }}
            className="chip is-selected"
            style={{ cursor: 'grab' }}
            title={`${s.name} — ${s.packName}`}
          >
            <button
              className="icon-btn"
              style={{ width: 18, height: 18, color: 'inherit' }}
              onClick={() => (isPlaying ? onStop() : onPlay(s))}
            >
              {isPlaying ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
            </button>
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <button
              className="icon-btn"
              style={{ width: 18, height: 18, color: 'inherit' }}
              onClick={() => onRemovePin(id)}
              title="Unpin"
            >
              <CloseIcon size={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
