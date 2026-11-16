import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PackTag } from '../../electron/preload'
import type { PackInfo, PackTreeNode } from '../hooks/useLibrary'
import { ChevronIcon, MoreIcon } from './Icon'

interface TreeItemProps {
  node: PackTreeNode
  depth: number
  focusedPath?: string
  onFocus: (packPath: string, folderPath: string) => void
  packPath: string
  // Only pack roots (depth 0) get tag dots, the ⋯ button and right-click —
  // pack-level actions don't mean anything on a subfolder.
  packTags?: PackTag[]
  isHidden?: boolean
  onOpenMenu?: (packPath: string, x: number, y: number) => void
}

// Expand/collapse is local and separate from selection on purpose (per the
// redesign): the chevron only reveals children, clicking the name is what
// changes what the main list shows.
function TreeItem({ node, depth, focusedPath, onFocus, packPath, packTags, isHidden, onOpenMenu }: TreeItemProps) {
  const isPackRoot = depth === 0 && Boolean(onOpenMenu)
  // Every node starts collapsed, including pack roots — with dozens of packs
  // in a library, auto-expanding the top level turns the sidebar into a
  // wall of category folders before you've clicked anything.
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const isFocused = focusedPath === node.path
  // An ancestor of the focused node gets a quieter tint than the focused
  // node itself — enough to trace the path down to where you are, without
  // competing with the one row that's actually selected.
  const isAncestor = !isFocused && Boolean(focusedPath) && focusedPath!.startsWith(node.path + '/')

  return (
    <div>
      <div
        className={`tree-item${isFocused ? ' is-focused' : ''}${isPackRoot ? ' is-pack-root' : ''}`}
        style={{
          paddingLeft: depth * 12,
          background: isAncestor ? 'var(--surface-alt)' : undefined,
          // Hidden packs (only visible in All samples' folder view) are
          // dimmed rather than removed — still findable, clearly set aside.
          opacity: isHidden ? 0.5 : 1,
        }}
        onContextMenu={
          isPackRoot
            ? (e) => {
                e.preventDefault()
                onOpenMenu!(packPath, e.clientX, e.clientY)
              }
            : undefined
        }
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            width: 18,
            height: 24,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-faint)',
            visibility: hasChildren ? 'visible' : 'hidden',
            padding: 0,
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronIcon direction={expanded ? 'down' : 'right'} />
        </button>
        <button
          onClick={() => onFocus(packPath, node.path)}
          style={{
            flex: 1,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 13,
            fontWeight: isFocused ? 600 : 400,
            color: isFocused ? 'var(--accent-strong)' : 'var(--text)',
            padding: '4px 4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={isHidden ? `${node.name} (hidden from sessions)` : node.name}
        >
          {node.name}
        </button>
        {isPackRoot && packTags && packTags.length > 0 && (
          <span style={{ display: 'flex', gap: 3, flexShrink: 0, paddingRight: 2 }} title={packTags.map((t) => t.name).join(', ')}>
            {packTags.map((t) => (
              <span key={t.id} className="tag-dot" style={{ background: t.color }} />
            ))}
          </span>
        )}
        {isPackRoot && (
          // Revealed on row hover (see .tree-item.is-pack-root in CSS) so the
          // list stays calm, but always reachable — and right-click opens
          // the same menu for people who reach for that first.
          <button
            className="icon-btn pack-more-btn"
            title="Pack actions"
            aria-label={`Actions for ${node.name}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onOpenMenu!(packPath, r.left, r.bottom + 4)
            }}
            style={{ width: 22, height: 22, flexShrink: 0 }}
          >
            <MoreIcon size={13} />
          </button>
        )}
      </div>
      {expanded && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              focusedPath={focusedPath}
              onFocus={onFocus}
              packPath={packPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  packs: PackInfo[]
  packTrees: Map<string, { name: string; path: string; children: PackTreeNode[] }>
  focusedPath?: string
  // Label for the "clear focus, show everything" root row — omit to hide it
  // (e.g. a standalone single-pack view has no wider scope to return to).
  rootLabel?: string
  // Shown instead of the tree when there's nothing to show yet — wording is
  // scope-specific (Session's "add some packs" isn't right for All samples).
  emptyMessage?: string
  // Replaces the default "Packs · N" label entirely when given — used by
  // Session packs to show its own count plus the Shuffle/Edit packs actions
  // grouped right where the packs themselves live, kept visually separate
  // from session switching (which lives in the header above, not here).
  header?: ReactNode
  onFocus: (packPath: string, folderPath: string) => void
  onClearFocus: () => void
  // Pack-level extras (⋯ menu, tag dots, hidden dimming, tag filter row).
  tags?: PackTag[]
  tagsByPack?: Map<string, PackTag[]>
  hiddenPacks?: Set<string>
  activeTagId?: string
  onSelectTag?: (tagId: string | undefined) => void
  onOpenPackMenu?: (packPath: string, x: number, y: number) => void
}

// Left sidebar: an optional "root" row (All session samples / All samples)
// plus each pack's real folder tree. Clicking a pack or folder flattens
// everything under it into the main list; the chevron just expands/collapses.
export function PackTreeSidebar({
  packs,
  packTrees,
  focusedPath,
  rootLabel,
  emptyMessage = 'No packs selected yet.',
  header,
  onFocus,
  onClearFocus,
  tags = [],
  tagsByPack,
  hiddenPacks,
  activeTagId,
  onSelectTag,
  onOpenPackMenu,
}: Props) {
  // The tag row can be collapsed so it only takes space when you want it.
  const [tagsOpen, setTagsOpen] = useState(true)
  // Only show tags that are actually on a pack in THIS list — a "Drill" chip
  // that filters the session down to nothing is a dead end.
  const visibleTags = tags.filter((t) => packs.some((p) => t.packPaths.includes(p.packPath)))
  const activeTag = tags.find((t) => t.id === activeTagId)
  const shownPacks = activeTag ? packs.filter((p) => activeTag.packPaths.includes(p.packPath)) : packs

  return (
    <div
      className="scroll-area"
      style={{
        width: 250,
        flexShrink: 0,
        minHeight: 0,
        borderRight: '1px solid var(--border)',
        paddingRight: 10,
        overflowY: 'auto',
      }}
    >
      {header ?? (
        // Same 28px row height as the "Sound type" chip row on the right, so
        // the two column headers sit on one line across the divider.
        <div className="section-label column-head" style={{ padding: '0 4px', marginBottom: 8 }}>
          Packs · {packs.length}
        </div>
      )}
      {/* Tag filter — workflow note: with 400+ packs, I kept wanting "just
          my Ableton stock packs" or "just the drill kits". Tags (color dot +
          name) filter the pack list; click again or "All" to clear. */}
      {onSelectTag && visibleTags.length > 0 && (
        <div style={{ margin: '0 4px 8px' }}>
          <button
            className="section-label"
            onClick={() => setTagsOpen((v) => !v)}
            style={{ background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            aria-expanded={tagsOpen}
          >
            <ChevronIcon size={9} direction={tagsOpen ? 'down' : 'right'} />
            Tags{activeTag ? ` · ${activeTag.name}` : ''}
          </button>
          {tagsOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <button className={`chip chip-sm${!activeTag ? ' is-selected' : ''}`} onClick={() => onSelectTag(undefined)}>
                All
              </button>
              {visibleTags.map((t) => (
                <button
                  key={t.id}
                  className={`chip chip-sm${activeTagId === t.id ? ' is-selected' : ''}`}
                  onClick={() => onSelectTag(activeTagId === t.id ? undefined : t.id)}
                >
                  <span className="tag-dot" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {rootLabel && (
        <button
          onClick={onClearFocus}
          className={`tree-item${!focusedPath ? ' is-focused' : ''}`}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: !focusedPath ? 'var(--accent-soft)' : 'none',
            font: 'inherit',
            fontSize: 13,
            fontWeight: !focusedPath ? 600 : 400,
            color: !focusedPath ? 'var(--accent-strong)' : 'var(--text)',
            padding: '5px 8px',
            marginBottom: 8,
          }}
        >
          {rootLabel}
        </button>
      )}
      {shownPacks.map((p) => {
        const tree = packTrees.get(p.packPath)
        if (!tree) return null
        return (
          <TreeItem
            key={p.packPath}
            node={tree}
            depth={0}
            focusedPath={focusedPath}
            onFocus={onFocus}
            packPath={p.packPath}
            packTags={tagsByPack?.get(p.packPath)}
            isHidden={hiddenPacks?.has(p.packPath)}
            onOpenMenu={onOpenPackMenu}
          />
        )
      })}
      {activeTag && shownPacks.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px' }}>No packs here with this tag.</div>
      )}
      {packs.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px', lineHeight: 1.5 }}>{emptyMessage}</div>
      )}
    </div>
  )
}
