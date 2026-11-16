import type { SampleCategory } from '../../electron/preload'
import { CATEGORY_LABELS, CATEGORY_ORDER, type Format } from '../hooks/useLibrary'

interface Props {
  counts: Map<SampleCategory, number>
  formatCounts: { loop: number; oneshot: number }
  activeCategory?: SampleCategory
  activeFormat?: Format
  onSelectCategory: (category: SampleCategory | undefined) => void
  onSelectFormat: (format: Format | undefined) => void
}

// The "what am I looking for" entry point: a lightweight type filter derived
// purely from filenames/folder names at scan time (see classifyCategory in
// main.ts) — no audio analysis, no AI calls. Every type that actually has
// matches gets its own chip in one row — no "More types…" dropdown hiding
// some of them.
//
// Containing that row is a CSS Grid column sized `minmax(0, 1fr)` rather
// than a flex `flex: 1` — a flex item's default min-width is its content's
// natural size, which is exactly what let the chip row grow past the
// results column instead of ever actually being clipped (a fade overlay
// papered over that but didn't fix it, and the overlay itself doubled as
// a second, ghosted copy of whatever chip fell under it). A grid track
// with `minmax(0, 1fr)` is capped at 0 regardless of the content inside
// it, so the row can never force the column wider than the space it was
// given — it only ever scrolls internally. Loop/one-shot lives on its own
// row below rather than competing with the categories for the same line.
export function CategoryFilterBar({
  counts,
  formatCounts,
  activeCategory,
  activeFormat,
  onSelectCategory,
  onSelectFormat,
}: Props) {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const present = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 12px', minWidth: 0 }}>
      {/* Top edge sits at 0 with a 28px label row — matches the sidebar's
          column-head so "Session packs · 3" and "Sound type" share a line. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'start', gap: 8 }}>
        <span className="section-label column-head">Sound type</span>
        <div className="chip-row" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button className={`chip${!activeCategory ? ' is-selected' : ''}`} onClick={() => onSelectCategory(undefined)}>
            All
          </button>
          {present.map((category) => (
            <button
              key={category}
              className={`chip${activeCategory === category ? ' is-selected' : ''}`}
              onClick={() => onSelectCategory(activeCategory === category ? undefined : category)}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      </div>
      {formatCounts.loop > 0 && (
        <div className="segmented" style={{ alignSelf: 'flex-start' }}>
          <button className={!activeFormat ? 'is-active' : ''} onClick={() => onSelectFormat(undefined)}>
            Any
          </button>
          <button className={activeFormat === 'loop' ? 'is-active' : ''} onClick={() => onSelectFormat('loop')}>
            Loops
          </button>
          <button className={activeFormat === 'oneshot' ? 'is-active' : ''} onClick={() => onSelectFormat('oneshot')}>
            One-shots
          </button>
        </div>
      )}
    </div>
  )
}
