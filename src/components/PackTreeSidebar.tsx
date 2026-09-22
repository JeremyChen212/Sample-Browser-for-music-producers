import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PackInfo, PackTreeNode } from '../hooks/useLibrary'
import { ChevronIcon } from './Icon'

interface TreeItemProps {
  node: PackTreeNode
  depth: number
  focusedPath?: string
  onFocus: (packPath: string, folderPath: string) => void
  packPath: string
}

// Expand/collapse is local and separate from selection on purpose (per the
// redesign): the chevron only reveals children, clicking the name is what
// changes what the main list shows.
function TreeItem({ node, depth, focusedPath, onFocus, packPath }: TreeItemProps) {
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
        className={`tree-item${isFocused ? ' is-focused' : ''}`}
        style={{ paddingLeft: depth * 12, background: isAncestor ? 'var(--surface-alt)' : undefined }}
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
          title={node.name}
        >
          {node.name}
        </button>
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
}: Props) {
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
        <div className="section-label" style={{ padding: '2px 4px 8px' }}>
          Packs · {packs.length}
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
      {packs.map((p) => {
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
          />
        )
      })}
      {packs.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px', lineHeight: 1.5 }}>{emptyMessage}</div>
      )}
    </div>
  )
}
