import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  style?: CSSProperties
}

// A small, consistent icon set (currentColor-based, so they inherit
// whatever color/state the button around them sets) — replaces emoji with
// something that reads as considered rather than default-browser.

export function PlayIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style}>
      <path d="M4 2.5v11l9-5.5-9-5.5z" />
    </svg>
  )
}

export function PauseIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style}>
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" />
    </svg>
  )
}

export function HeartIcon({ size = 14, filled, style }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.4}
      style={style}
    >
      <path d="M8 13.5s-5.5-3.3-5.5-7.1C2.5 4 4.2 2.5 6 2.5c1 0 1.7.4 2 1 .3-.6 1-1 2-1 1.8 0 3.5 1.5 3.5 3.9 0 3.8-5.5 7.1-5.5 7.1z" />
    </svg>
  )
}

// A real thumbtack silhouette (Material "push_pin" glyph) rather than an
// abstract shape — reads clearly at small sizes, filled when pinned, a
// lighter outlined cutout otherwise. Same 24x24 source grid regardless of
// the render size passed in.
export function PinIcon({ size = 15, filled, style }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
      {filled ? (
        <path d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
      ) : (
        <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c0 1.1.9 2 2 2v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4c1.1 0 2-.9 2-2z" />
      )}
    </svg>
  )
}

export function ChevronIcon({ size = 12, direction = 'right', style }: IconProps & { direction?: 'right' | 'down' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direction === 'down' ? 'rotate(90deg)' : undefined, ...style }}
    >
      <path d="M6 3.5l5 4.5-5 4.5" />
    </svg>
  )
}

export function SearchIcon({ size = 14, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      style={style}
    >
      <circle cx="6.8" cy="6.8" r="4.3" />
      <path d="M10.2 10.2L14 14" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ size = 12, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      style={style}
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  )
}

export function ArrowLeftIcon({ size = 14, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M10 3.5L5 8l5 4.5" />
    </svg>
  )
}

export function FolderIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style}>
      <path d="M1.5 3.5A1 1 0 012.5 2.5h3.4a1 1 0 01.8.4l.9 1.1h4.9a1 1 0 011 1v7a1 1 0 01-1 1h-10a1 1 0 01-1-1v-8.5z" />
    </svg>
  )
}

export function ShuffleIcon({ size = 13, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M2 4h2.5L10 12h4M2 12h2.5L7 8M11.5 4H14M12.3 2.2L14 4l-1.7 1.8M12.3 13.8L14 12l-1.7-1.8" />
    </svg>
  )
}

// Distinct from ShuffleIcon on purpose: "shuffle" (crossing paths) reads as
// randomizing order, which is exactly the wrong association for a per-row
// action that swaps ONE pack for a different one. Two opposing arrows reads
// as "exchange this" instead, closer to what onReplace actually does.
export function SwapIcon({ size = 13, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M2 5.5h9M11 5.5L8.3 3M11 5.5L8.3 8" />
      <path d="M14 10.5H5M5 10.5L7.7 13M5 10.5L7.7 8" />
    </svg>
  )
}

export function CheckIcon({ size = 12, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  )
}

// Kebab/overflow glyph for secondary, less-frequent actions (Duplicate,
// Delete) tucked out of the way of the primary session controls.
export function MoreIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style}>
      <circle cx="8" cy="3.2" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="12.8" r="1.3" />
    </svg>
  )
}

export function PencilIcon({ size = 13, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M10.5 2.5l3 3-8 8-3.5.5.5-3.5 8-8z" />
    </svg>
  )
}

// A tiny brandmark: two overlapping soft shapes suggesting a pack + a pin,
// rather than a literal logo — cheap to render, gives the header a touch of
// identity beyond plain text.
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="14" height="14" rx="4" fill="var(--accent-soft-strong)" />
      <rect x="8" y="3" width="14" height="14" rx="4" fill="var(--accent)" opacity="0.92" />
    </svg>
  )
}
