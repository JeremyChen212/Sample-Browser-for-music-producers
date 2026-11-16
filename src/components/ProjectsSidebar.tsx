// Sidebar for the Projects tab: one row per beat (session) that has a linked
// Ableton set or any samples dragged into Ableton. Same look as the pack
// sidebar so it reads as "the same browser, a different pool of sounds".
interface Project {
  id: string
  name: string
  setName?: string
  inProject: string[]
  tried: string[]
}
interface Props {
  projects: Project[]
  selectedId?: string
  activeSessionId: string
  onSelect: (id: string) => void
}

export function ProjectsSidebar({ projects, selectedId, activeSessionId, onSelect }: Props) {
  return (
    <div className="scroll-area" style={{ width: 250, flexShrink: 0, minHeight: 0, borderRight: '1px solid var(--border)', paddingRight: 10, overflowY: 'auto' }}>
      <div className="section-label column-head" style={{ padding: '0 4px', marginBottom: 8 }}>
        Projects · {projects.length}
      </div>
      {projects.map((p) => {
        const on = p.id === selectedId
        const extraTried = p.tried.filter((t) => !p.inProject.includes(t)).length
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`tree-item${on ? ' is-focused' : ''}`}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: on ? 'var(--accent-soft)' : 'none', font: 'inherit', padding: '7px 8px', marginBottom: 2 }}
            title={p.setName ? `Linked to ${p.setName}` : 'No Ableton set linked yet: showing samples you tried'}
          >
            <div style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? 'var(--accent-strong)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
              {p.id === activeSessionId && <span className="text-faint" style={{ fontWeight: 400 }}> · current</span>}
            </div>
            <div className="text-faint" style={{ fontSize: 11, marginTop: 2 }}>
              {p.setName ? `${p.inProject.length} in project · ` : 'not linked · '}
              {extraTried} tried
            </div>
          </button>
        )
      })}
    </div>
  )
}
