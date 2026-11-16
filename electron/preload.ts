import { contextBridge, ipcRenderer } from 'electron'

// Kept in sync with electron/main.ts by hand (see note there on why).
export type SampleCategory =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'cymbal'
  | 'perc'
  | 'bass'
  | 'vocal'
  | 'melodic'
  | 'fx'
  | 'unknown'

export interface ScannedSample {
  id: string
  name: string
  path: string
  packName: string
  packPath: string
  ext: string
  size: number
  category: SampleCategory
  isLoop: boolean
}

// A session is the whole working context you're in while browsing — its
// selected packs, its pinned candidates, its name — like a lightweight
// project file for sample browsing, not a saved Ableton project. Exactly one
// is always active. The sample library, favorites, and original folder
// structure are shared across every session (see StoreShape below).
export interface SavedSession {
  id: string
  name: string
  packPaths: string[]
  pinned: string[]
  updatedAt: number
}

// A user-made label for organizing packs (e.g. "● Ableton", "● Drill").
// Tags live on PACKS, not samples — favorites (hearts) already mark
// individual sounds, so the two never compete: hearts mark sounds, tags
// organize packs. Global like favorites, not tied to any one session.
export interface PackTag {
  id: string
  name: string
  color: string
  packPaths: string[]
}

export interface StoreShape {
  lastFolder?: string
  favorites: string[]
  // Packs the user has said "not for me" about. Hidden packs are kept out of
  // every session (Shuffle, Pick for me, Swap) but are NOT deleted or moved —
  // their samples stay searchable in All samples. Optional so older saved
  // stores load without a migration.
  hiddenPacks?: string[]
  tags?: PackTag[]
  sessions: SavedSession[]
  activeSessionId: string
  // Legacy top-level fields from before named sessions existed. Only ever
  // read once, by useLibrary's migration on first load after upgrading.
  pinned?: string[]
  sessionPackPaths?: string[]
}

const api = {
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  scanFolder: (folderPath: string): Promise<ScannedSample[]> =>
    ipcRenderer.invoke('fs:scanFolder', folderPath),
  readFileBuffer: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  revealInFinder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:revealInFinder', filePath),
  startDrag: (filePath: string): void => ipcRenderer.send('drag:start', filePath),
  getStore: (): Promise<StoreShape> => ipcRenderer.invoke('store:get'),
  setStore: (data: StoreShape): Promise<boolean> => ipcRenderer.invoke('store:set', data),
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
