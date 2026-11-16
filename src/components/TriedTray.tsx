import type { ScannedSample } from '../../electron/preload'
import { CheckIcon, CloseIcon, PauseIcon, PinIcon, PlayIcon } from './Icon'

// "Tried this session" — every sample you dragged into Ableton, recorded
// automatically, newest first.
//
// Workflow note: dragging a sample straight into Ableton (without pinning
// it first) used to leave no trace — an hour later, "what was that hat I
// tried?" meant searching all over again. Now every drag lands here quietly.
// Pin → Drag → Heart = consider → try → keep: this tray is the "try" step.
//
// Only appears once something has been dragged, so a fresh session stays
// as calm as before.
interface Props {
  tried: string[]
  samplesById: Map<string, ScannedSample>
  playingId: string | null
  pinned: string[]
  inProject: Set<string>
  linked: boolean
  onPlay: (s: ScannedSample) => void
  onStop: () => void
  onPin: (id: string) => void
  onRemove: (id: string) => void
  onDragged: (id: string) => void
}

export function TriedTray({ tried, samplesById, playingId, pinned, inProject, linked, onPlay, onStop, onPin, onRemove, onDragged }: Props) {
  const items = tried.map((id) => samplesById.get(id)).filter((s): s is ScannedSample => Boolean(s))
  if (items.length === 0) return null
  const keptCount = items.filter((s) => inProject.has(s.id)).length

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 32, padding: '2px' }}>
      <span className="text-faint" style={{ fontSize: 12, flexShrink: 0 }} title="Samples you dragged into Ableton this session">
        ↗ Tried · {items.length}
        {linked && ` · ${keptCount} in project`}
      </span>
      {items.slice(0, 12).map((s) => {
        const isPlaying = playingId === s.id
        const kept = inProject.has(s.id)
        return (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.preventDefault()
              window.api.startDrag(s.path)
              onDragged(s.id)
            }}
            className={`chip tried-chip${kept ? ' is-kept' : ''}`}
            style={{ cursor: 'grab' }}
            title={`${s.name} — ${s.packName}${kept ? ' · in your saved Ableton set' : ''}`}
          >
            <button className="icon-btn" style={{ width: 18, height: 18, color: 'inherit' }} onClick={() => (isPlaying ? onStop() : onPlay(s))}>
              {isPlaying ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
            </button>
            {kept && <CheckIcon size={10} />}
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            {!pinned.includes(s.id) && (
              <button className="icon-btn" style={{ width: 18, height: 18, color: 'inherit' }} onClick={() => onPin(s.id)} title="Pin">
                <PinIcon size={10} />
              </button>
            )}
            <button className="icon-btn" style={{ width: 18, height: 18, color: 'inherit' }} onClick={() => onRemove(s.id)} title="Clear from Tried">
              <CloseIcon size={10} />
            </button>
          </div>
        )
      })}
      {items.length > 12 && <span className="text-faint" style={{ fontSize: 12 }}>+{items.length - 12} more</span>}
    </div>
  )
}
