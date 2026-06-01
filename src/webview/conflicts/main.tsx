import altArrowDownIcon from '@iconify/icons-solar/alt-arrow-down-line-duotone'
import altArrowRightIcon from '@iconify/icons-solar/alt-arrow-right-line-duotone'
import altArrowUpIcon from '@iconify/icons-solar/alt-arrow-up-line-duotone'
import checkCircleIcon from '@iconify/icons-solar/check-circle-line-duotone'
import closeCircleIcon from '@iconify/icons-solar/close-circle-line-duotone'
import codeSquareIcon from '@iconify/icons-solar/code-square-line-duotone'
import disketteIcon from '@iconify/icons-solar/diskette-line-duotone'
import documentIcon from '@iconify/icons-solar/document-text-line-duotone'
import doubleArrowLeftIcon from '@iconify/icons-solar/double-alt-arrow-left-line-duotone'
import doubleArrowRightIcon from '@iconify/icons-solar/double-alt-arrow-right-line-duotone'
import folderIcon from '@iconify/icons-solar/folder-line-duotone'
import folderOpenIcon from '@iconify/icons-solar/folder-open-line-duotone'
import penIcon from '@iconify/icons-solar/pen-new-square-line-duotone'
import refreshIcon from '@iconify/icons-solar/refresh-circle-line-duotone'
import restartIcon from '@iconify/icons-solar/restart-line-duotone'
import dangerIcon from '@iconify/icons-solar/shield-warning-line-duotone'
import { render } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import '../details/styles.css'

interface VsCodeApi {
  postMessage: (message: unknown) => void
}

declare function acquireVsCodeApi(): VsCodeApi

interface GitCommitInfo {
  hash: string
  shortHash: string
  author: string
  relativeDate: string
  subject: string
}

interface GitOperation {
  kind: 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  label: string
  ours?: GitCommitInfo
  theirs?: GitCommitInfo
  note?: string
}

interface RepositoryOption {
  root: string
  name: string
  label: string
  description: string
}

interface ConflictFile {
  path: string
  originalPath?: string
  index: string
  worktree: string
  kind: 'added' | 'copied' | 'conflict' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  staged: boolean
  conflicted: boolean
  summary: string
  resolved: boolean
}

interface ContextConflictChunk {
  type: 'context'
  content: string
}

interface ChoiceConflictChunk {
  type: 'conflict'
  id: number
  oursLabel: string
  theirsLabel: string
  baseLabel?: string
  ours: string
  theirs: string
  base?: string
}

type ConflictChunk = ContextConflictChunk | ChoiceConflictChunk
type Side = 'ours' | 'theirs'
// undefined = no result choice yet, Side[] = applied sides in click order (supports both)
type Resolution = Side[]
type SideHandling = Partial<Record<Side, boolean>>

interface ConflictDetail {
  filePath: string
  status: string
  base: string
  ours: string
  theirs: string
  current: string
  chunks: ConflictChunk[]
  operation: GitOperation
  binary: boolean
  canResolveInline: boolean
  resolved: boolean
}

interface ReadySnapshot {
  state: 'ready'
  root: string
  repoName: string
  repositories: RepositoryOption[]
  selectedRepositoryRoot: string
  operation: GitOperation
  conflicts: ConflictFile[]
  selectedPath?: string
  detail?: ConflictDetail
}

interface EmptySnapshot {
  state: 'empty'
  reason: string
  repositories: RepositoryOption[]
  selectedRepositoryRoot?: string
}

type ConflictSnapshot = ReadySnapshot | EmptySnapshot

interface SnapshotMessage {
  type: 'snapshot'
  snapshot: ConflictSnapshot
}

interface TreeNode {
  kind: 'directory' | 'file'
  name: string
  path: string
  children: TreeNode[]
  file?: ConflictFile
}

interface SolarIconData {
  width?: number
  height?: number
  body: string
}

const LINE_HEIGHT = 20
const vscode = acquireVsCodeApi()

const solarIcons = {
  acceptLeft: doubleArrowLeftIcon,
  acceptRight: doubleArrowRightIcon,
  chevronDown: altArrowDownIcon,
  chevronRight: altArrowRightIcon,
  danger: dangerIcon,
  file: documentIcon,
  folder: folderIcon,
  folderOpen: folderOpenIcon,
  ignore: closeCircleIcon,
  navNext: altArrowDownIcon,
  navPrev: altArrowUpIcon,
  refresh: refreshIcon,
  resolved: checkCircleIcon,
  reset: restartIcon,
  save: disketteIcon,
  text: penIcon,
  merge: codeSquareIcon,
} satisfies Record<string, SolarIconData>

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function Icon({ name, className }: { name: keyof typeof solarIcons, className?: string }) {
  const icon = solarIcons[name]
  return (
    <svg
      className={cn('inline-block h-[1em] w-[1em] shrink-0', className)}
      viewBox={`0 0 ${icon.width ?? 24} ${icon.height ?? 24}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}

function RepositorySelect({
  className,
  repositories,
  selectedRoot,
}: {
  className?: string
  repositories: RepositoryOption[]
  selectedRoot?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState<{ left: number, top: number, width: number }>()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = repositories.find(repository => repository.root === selectedRoot) ?? repositories[0]

  function updateMenuRect(): void {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect)
      return

    const width = Math.min(360, Math.max(190, rect.width))
    const menuHeight = Math.min(260, repositories.length * 38 + 8)
    const below = window.innerHeight - rect.bottom
    const above = rect.top
    const top = below >= Math.min(menuHeight, 150) || below >= above
      ? rect.bottom + 4
      : Math.max(8, rect.top - menuHeight - 4)
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    )

    setMenuRect({ left, top, width })
  }

  useEffect(() => {
    if (!open)
      return

    updateMenuRect()

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node))
        return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target))
        return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setOpen(false)
    }
    const reposition = () => updateMenuRect()

    document.addEventListener('pointerdown', closeOnPointerDown, true)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, repositories.length])

  if (!selected)
    return null

  if (repositories.length === 1) {
    return (
      <div className={cn('flex h-[26px] min-w-0 items-center gap-1.5 rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_74%,transparent)] px-2 text-[12px] text-[var(--fg)]', className)} title={selected.root}>
        <Icon name="folder" className="text-[13px] text-[var(--muted)]" />
        <span className="min-w-0 truncate">{selected.label}</span>
      </div>
    )
  }

  return (
    <div className={cn('relative h-[26px] min-w-0', className)} title={selected.root}>
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'grid h-[26px] w-full min-w-0 cursor-pointer grid-cols-[16px_minmax(0,1fr)_16px] items-center gap-1.5 rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_74%,transparent)] px-2 text-left text-[12px] text-[var(--fg)] outline-none hover:bg-[var(--hover)] focus:border-[color-mix(in_srgb,var(--blue)_58%,transparent)]',
          open && 'border-[color-mix(in_srgb,var(--blue)_58%,transparent)] bg-[var(--hover)]',
        )}
        type="button"
        onClick={() => {
          updateMenuRect()
          setOpen(value => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            updateMenuRect()
            setOpen(true)
          }
        }}
      >
        <Icon name="folder" className="text-[13px] text-[var(--muted)]" />
        <span className="min-w-0 truncate font-semibold">{selected.label}</span>
        <Icon name="chevronDown" className={cn('justify-self-end text-[12px] text-[var(--muted)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && menuRect && (
        <div
          ref={menuRef}
          className="fixed z-[1000] max-h-[260px] overflow-auto rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#17141f)] p-1 text-[12px] text-[var(--fg)] shadow-[0_14px_34px_rgba(0,0,0,0.38)]"
          role="listbox"
          style={{ left: `${menuRect.left}px`, top: `${menuRect.top}px`, width: `${menuRect.width}px` }}
        >
          {repositories.map((repository) => {
            const active = repository.root === selected.root
            return (
              <button
                key={repository.root}
                aria-selected={active}
                className={cn(
                  'grid min-h-[34px] w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded border-0 bg-transparent px-2 py-1 text-left text-[12px] text-[var(--fg)] outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]',
                  active && 'bg-[color-mix(in_srgb,var(--selected)_70%,transparent)]',
                )}
                role="option"
                title={repository.root}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (repository.root !== selected.root)
                    vscode.postMessage({ type: 'selectRepository', root: repository.root })
                }}
              >
                <Icon name={active ? 'folderOpen' : 'folder'} className={cn('text-[13px]', active ? 'text-[var(--blue)]' : 'text-[var(--muted)]')} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{repository.label}</span>
                  {repository.description !== '.' && <span className="block truncate text-[10px] text-[var(--muted)]">{repository.description}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function App() {
  const [snapshot, setSnapshot] = useState<ConflictSnapshot>({ state: 'empty', reason: 'Loading conflicts...', repositories: [] })

  useEffect(() => {
    const listener = (event: MessageEvent<SnapshotMessage>) => {
      if (event.data.type === 'snapshot')
        setSnapshot(event.data.snapshot)
    }

    window.addEventListener('message', listener)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', listener)
  }, [])

  if (snapshot.state === 'empty') {
    return (
      <main className="grid h-screen place-items-center bg-[var(--bg)] px-4 text-[var(--muted)]">
        <div className="grid max-w-[360px] gap-3 text-center">
          <div className="mb-2 text-[15px] font-semibold text-[var(--fg)]">Git Forge Conflicts</div>
          <RepositorySelect className="w-full" repositories={snapshot.repositories} selectedRoot={snapshot.selectedRepositoryRoot} />
          <div>{snapshot.reason}</div>
        </div>
      </main>
    )
  }

  return <ConflictResolver snapshot={snapshot} />
}

function ConflictResolver({ snapshot }: { snapshot: ReadySnapshot }) {
  const tree = useMemo(() => buildTree(snapshot.conflicts), [snapshot.conflicts])

  return (
    <main className="grid h-screen grid-cols-[260px_minmax(0,1fr)] bg-[var(--bg)] text-[var(--fg)]">
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_88%,#17141f)]">
        <header className="border-b border-[var(--border)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="danger" className="text-[15px] text-[var(--danger)]" />
            <RepositorySelect className="min-w-0 flex-1" repositories={snapshot.repositories} selectedRoot={snapshot.selectedRepositoryRoot} />
            <button className="icon-button" title="Refresh" onClick={() => vscode.postMessage({ type: 'refresh' })}>
              <Icon name="refresh" />
            </button>
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--muted)]">{snapshot.operation.label}</div>
        </header>
        <div className="min-h-0 overflow-auto p-2">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold uppercase text-[var(--muted)]">
            <span>Conflicts</span>
            <span>{snapshot.conflicts.length}</span>
          </div>
          {tree.map(node => (
            <TreeItem key={node.path} node={node} selectedPath={snapshot.selectedPath} />
          ))}
        </div>
      </aside>

      <section className="grid min-h-0 grid-rows-[minmax(0,1fr)]">
        <ConflictDetailView detail={snapshot.detail} operation={snapshot.operation} />
      </section>
    </main>
  )
}

function TreeItem({ node, selectedPath, depth = 0 }: { node: TreeNode, selectedPath?: string, depth?: number }) {
  const [open, setOpen] = useState(true)
  const isSelected = node.path === selectedPath

  if (node.kind === 'directory') {
    return (
      <div>
        <button
          className="flex h-[24px] w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-left text-[12px] text-[var(--fg)] hover:bg-[var(--hover)]"
          style={{ paddingLeft: `${4 + depth * 12}px` }}
          onClick={() => setOpen(value => !value)}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} className="text-[11px] text-[var(--muted)]" />
          <Icon name={open ? 'folderOpen' : 'folder'} className="text-[13px] text-[var(--muted)]" />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
        {open && node.children.map(child => (
          <TreeItem key={child.path} node={child} selectedPath={selectedPath} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      className={cn(
        'flex h-[25px] w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-left text-[12px] hover:bg-[var(--hover)]',
        isSelected && 'bg-[var(--selected)]',
      )}
      style={{ paddingLeft: `${18 + depth * 12}px` }}
      onClick={() => vscode.postMessage({ type: 'selectConflict', path: node.file?.path })}
    >
      <Icon name="file" className="text-[13px] text-[var(--danger)]" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="text-[10px] text-[var(--muted)]">
        {`${node.file?.index ?? ''}${node.file?.worktree ?? ''}`}
      </span>
    </button>
  )
}

function ConflictDetailView({ detail, operation }: { detail?: ConflictDetail, operation: GitOperation }) {
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({})
  const [handledSides, setHandledSides] = useState<Record<number, SideHandling>>({})
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'merge' | 'text'>('merge')
  const [activeId, setActiveId] = useState<number | undefined>(undefined)
  const paneRefs = {
    ours: useRef<HTMLDivElement>(null),
    center: useRef<HTMLDivElement>(null),
    theirs: useRef<HTMLDivElement>(null),
  }

  const conflictChunks = useMemo(
    () => (detail?.chunks ?? []).filter((chunk): chunk is ChoiceConflictChunk => chunk.type === 'conflict'),
    [detail?.chunks],
  )
  const layout = useMemo(() => buildLayout(detail?.chunks ?? [], resolutions, handledSides), [detail?.chunks, handledSides, resolutions])

  useEffect(() => {
    setResolutions({})
    setHandledSides({})
    setDraft(detail?.current ?? '')
    setMode('merge')
    setActiveId(conflictChunks[0]?.id)
  }, [detail?.filePath, detail?.current])

  if (!detail)
    return <div className="grid place-items-center text-[var(--muted)]">Select a conflicted file.</div>

  if (!detail.canResolveInline)
    return <FallbackResolver detail={detail} />

  const resolvedCount = conflictChunks.filter(chunk => resolutions[chunk.id] !== undefined).length
  const total = conflictChunks.length
  const allResolved = resolvedCount === total

  const scrollToConflict = (id: number) => {
    const target = paneRefs.center.current?.querySelector<HTMLElement>(`[data-cid="${id}"]`)
    if (!target)
      return
    const top = Math.max(0, target.offsetTop - LINE_HEIGHT * 2)
    for (const ref of Object.values(paneRefs)) {
      if (ref.current)
        ref.current.scrollTop = top
    }
  }

  const focusConflict = (id: number, options: FocusConflictOptions = {}) => {
    setActiveId(id)
    if (options.scroll)
      scrollToConflict(id)
  }

  const setResolution = (id: number, value: Resolution | undefined) => {
    setResolutions((prev) => {
      const next = { ...prev }
      if (value === undefined)
        delete next[id]
      else
        next[id] = value
      return next
    })
  }

  const setSideHandled = (id: number, side: Side, value: boolean) => {
    setHandledSides((prev) => {
      const next = { ...prev }
      const current = { ...(next[id] ?? {}) }
      if (value)
        current[side] = true
      else
        delete current[side]

      if (current.ours || current.theirs)
        next[id] = current
      else
        delete next[id]
      return next
    })
  }

  // Toggle a side into the result. Clicking ours then theirs keeps both (in click order); clicking again removes it.
  const toggleSide = (id: number, side: Side) => {
    const current = resolutions[id]
    const order = Array.isArray(current) ? current : []
    const next = order.includes(side) ? order.filter(item => item !== side) : [...order, side]
    if (!order.includes(side))
      setSideHandled(id, side, false)
    setResolution(id, next.length ? next : undefined)
  }

  const ignoreSide = (id: number, side: Side) => {
    const order = resolutions[id] ?? []
    const next = order.filter(item => item !== side)
    const otherSide: Side = side === 'ours' ? 'theirs' : 'ours'
    const otherHandled = next.includes(otherSide) || isSideHandled(handledSides[id], otherSide)

    setSideHandled(id, side, true)
    setResolution(id, next.length || otherHandled ? next : undefined)
  }

  const setAll = (side: Side) => {
    const next: Record<number, Resolution> = {}
    for (const chunk of conflictChunks)
      next[chunk.id] = [side]
    setResolutions(next)
  }

  const navigate = (direction: -1 | 1) => {
    if (!total)
      return
    const index = conflictChunks.findIndex(chunk => chunk.id === activeId)
    const nextIndex = (index + direction + total) % total
    focusConflict(conflictChunks[nextIndex].id, { scroll: true })
  }

  const save = () => {
    const content = mode === 'text' ? draft : resolveChunks(detail.chunks, resolutions)
    vscode.postMessage({ type: 'saveResolution', path: detail.filePath, content })
  }

  const toggleMode = () => {
    if (mode === 'merge') {
      setDraft(resolveChunks(detail.chunks, resolutions))
      setMode('text')
    }
    else {
      setMode('merge')
    }
  }

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_74%,#17141f)] px-3 py-2">
        <span className="min-w-0 max-w-[40%] truncate text-[13px] font-semibold" title={detail.filePath}>{detail.filePath}</span>
        <span className={cn('merge-pill', allResolved ? 'merge-pill--ok' : 'merge-pill--warn')}>
          <Icon name={allResolved ? 'resolved' : 'danger'} />
          {`Resolved ${resolvedCount} / ${total}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button className="icon-button" title="Previous conflict" disabled={mode === 'text'} onClick={() => navigate(-1)}>
            <Icon name="navPrev" />
          </button>
          <button className="icon-button" title="Next conflict" disabled={mode === 'text'} onClick={() => navigate(1)}>
            <Icon name="navNext" />
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--border)]" />
          <button className="soft-button" title="Accept all left (ours)" disabled={mode === 'text'} onClick={() => setAll('ours')}>Accept ours</button>
          <button className="soft-button" title="Accept all right (theirs)" disabled={mode === 'text'} onClick={() => setAll('theirs')}>Accept theirs</button>
          <button className="soft-button" title="Toggle plain text editing" onClick={toggleMode}>
            <Icon name={mode === 'merge' ? 'text' : 'merge'} />
            {mode === 'merge' ? 'Text' : 'Merge'}
          </button>
          <button className="danger-button" onClick={() => vscode.postMessage({ type: 'abortOperation' })}>Abort</button>
          <button className="primary-button" onClick={save}>
            <Icon name="save" />
            Save
          </button>
        </div>
        {operation.note && (
          <div className="basis-full text-[11px] text-[var(--muted)]">{operation.note}</div>
        )}
      </header>

      {mode === 'text'
        ? (
            <textarea
              className="min-h-0 resize-none bg-[color-mix(in_srgb,var(--bg)_96%,#17141f)] p-3 [font-family:var(--vscode-editor-font-family)] text-[12px] leading-5 text-[var(--fg)] outline-none"
              spellcheck={false}
              value={draft}
              onInput={event => setDraft(event.currentTarget.value)}
            />
          )
        : (
            <MergeEditor
              layout={layout}
              activeId={activeId}
              oursLabel={conflictChunks[0]?.oursLabel ?? 'Local'}
              theirsLabel={conflictChunks[0]?.theirsLabel ?? 'Incoming'}
              paneRefs={paneRefs}
              resolutions={resolutions}
              handledSides={handledSides}
              onToggleSide={toggleSide}
              onIgnoreSide={ignoreSide}
              onFocusConflict={focusConflict}
            />
          )}
    </div>
  )
}

function FallbackResolver({ detail }: { detail: ConflictDetail }) {
  return (
    <div className="min-h-0 overflow-auto p-4">
      <div className="mb-3 text-[13px] font-semibold">{detail.status}</div>
      <div className="max-w-[720px] rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_72%,#17141f)] p-4 text-[12px] text-[var(--muted)]">
        This conflict cannot be safely resolved in the inline text resolver. Use one side, or open a staged version for inspection.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="soft-button" onClick={() => vscode.postMessage({ type: 'openSide', path: detail.filePath, side: 'ours' })}>Open ours</button>
        <button className="soft-button" onClick={() => vscode.postMessage({ type: 'openSide', path: detail.filePath, side: 'theirs' })}>Open theirs</button>
        <button className="soft-button" onClick={() => vscode.postMessage({ type: 'acceptSide', path: detail.filePath, side: 'ours' })}>Keep ours</button>
        <button className="soft-button" onClick={() => vscode.postMessage({ type: 'acceptSide', path: detail.filePath, side: 'theirs' })}>Keep theirs</button>
      </div>
    </div>
  )
}

interface PaneRefs {
  ours: { current: HTMLDivElement | null }
  center: { current: HTMLDivElement | null }
  theirs: { current: HTMLDivElement | null }
}

const DIVIDER_W = 46

interface FocusConflictOptions {
  scroll?: boolean
}

function MergeEditor({
  layout,
  activeId,
  oursLabel,
  theirsLabel,
  paneRefs,
  resolutions,
  handledSides,
  onToggleSide,
  onIgnoreSide,
  onFocusConflict,
}: {
  layout: MergeLayout
  activeId?: number
  oursLabel: string
  theirsLabel: string
  paneRefs: PaneRefs
  resolutions: Record<number, Resolution>
  handledSides: Record<number, SideHandling>
  onToggleSide: (id: number, side: Side) => void
  onIgnoreSide: (id: number, side: Side) => void
  onFocusConflict: (id: number, options?: FocusConflictOptions) => void
}) {
  const syncingRef = useRef(false)
  const scrollTopRef = useRef(0)
  const dividerRefs = {
    left: useRef<HTMLDivElement>(null),
    right: useRef<HTMLDivElement>(null),
  }

  // Single source of vertical scroll keeps the three editors and the connector
  // ribbons perfectly aligned; ribbons live in non-scrolling columns and are
  // translated manually to avoid re-rendering the SVG on every scroll tick.
  const syncScroll = (source: HTMLElement) => {
    if (syncingRef.current)
      return
    syncingRef.current = true
    scrollTopRef.current = source.scrollTop
    for (const ref of [paneRefs.ours.current, paneRefs.center.current, paneRefs.theirs.current]) {
      if (ref && ref !== source)
        ref.scrollTop = source.scrollTop
    }
    for (const ref of [dividerRefs.left.current, dividerRefs.right.current]) {
      if (ref)
        ref.style.transform = `translateY(${-source.scrollTop}px)`
    }
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div
        className="grid border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_60%,#17141f)]"
        style={{ gridTemplateColumns: `minmax(0,1fr) ${DIVIDER_W}px minmax(0,1fr) ${DIVIDER_W}px minmax(0,1fr)` }}
      >
        <PaneHeader title="Local" subtitle={oursLabel} />
        <div />
        <PaneHeader title="Result" />
        <div />
        <PaneHeader title="Incoming" subtitle={theirsLabel} />
      </div>

      <div
        className="grid min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: `minmax(0,1fr) ${DIVIDER_W}px minmax(0,1fr) ${DIVIDER_W}px minmax(0,1fr)`,
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        <MergePane side="ours" layout={layout} activeId={activeId} scrollRef={paneRefs.ours} onScroll={syncScroll} onFocusConflict={onFocusConflict} />
        <MergeDivider
          kind="left"
          layout={layout}
          activeId={activeId}
          resolutions={resolutions}
          handledSides={handledSides}
          innerRef={dividerRefs.left}
          scrollTopRef={scrollTopRef}
          onToggleSide={onToggleSide}
          onIgnoreSide={onIgnoreSide}
          onFocusConflict={onFocusConflict}
        />
        <MergePane side="center" layout={layout} activeId={activeId} scrollRef={paneRefs.center} onScroll={syncScroll} onFocusConflict={onFocusConflict} />
        <MergeDivider
          kind="right"
          layout={layout}
          activeId={activeId}
          resolutions={resolutions}
          handledSides={handledSides}
          innerRef={dividerRefs.right}
          scrollTopRef={scrollTopRef}
          onToggleSide={onToggleSide}
          onIgnoreSide={onIgnoreSide}
          onFocusConflict={onFocusConflict}
        />
        <MergePane side="theirs" layout={layout} activeId={activeId} scrollRef={paneRefs.theirs} onScroll={syncScroll} onFocusConflict={onFocusConflict} />
      </div>
    </div>
  )
}

function PaneHeader({ title, subtitle }: { title: string, subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-2">
      <span className="text-[12px] font-semibold">{title}</span>
      {subtitle && <span className="min-w-0 truncate text-[11px] text-[var(--muted)]">{subtitle}</span>}
    </div>
  )
}

function MergePane({
  side,
  layout,
  activeId,
  scrollRef,
  onScroll,
  onFocusConflict,
}: {
  side: MergeSide
  layout: MergeLayout
  activeId?: number
  scrollRef: { current: HTMLDivElement | null }
  onScroll: (source: HTMLElement) => void
  onFocusConflict: (id: number, options?: FocusConflictOptions) => void
}) {
  return (
    <div className="merge-pane-wrap border-r border-[var(--border)]">
      <div
        ref={scrollRef}
        className="merge-scroll merge-pane"
        onScroll={event => onScroll(event.currentTarget)}
      >
        {layout.groups.map(group => (
          group.kind === 'context'
            ? <ContextGroup key={group.key} rows={group[side]} />
            : (
                <ConflictRegion
                  key={group.key}
                  active={group.conflictId === activeId}
                  group={group}
                  rows={group[side]}
                  settled={isSideSettled(group, side)}
                  onFocusConflict={onFocusConflict}
                />
              )
        ))}
      </div>
      <OverviewRuler layout={layout} activeId={activeId} onJump={onFocusConflict} />
    </div>
  )
}

function ConflictRegion({
  active,
  group,
  rows,
  settled,
  onFocusConflict,
}: {
  active: boolean
  group: MergeGroup
  rows: MergeRow[]
  settled: boolean
  onFocusConflict: (id: number, options?: FocusConflictOptions) => void
}) {
  const spacerRows = Math.max(0, group.rowCount - rows.length)

  return (
    <div className="merge-conflict-group" data-cid={group.conflictId} onMouseDown={() => onFocusConflict(group.conflictId!)}>
      <div
        className={cn(
          'merge-region',
          active && 'merge-region--active',
          settled && 'merge-region--resolved',
        )}
      >
        {rows.map((row, index) => <RowView key={index} row={row} />)}
      </div>
      {spacerRows > 0 && <div className="merge-spacer" style={{ height: `${spacerRows * LINE_HEIGHT}px` }} />}
    </div>
  )
}

function OverviewRuler({
  layout,
  activeId,
  onJump,
}: {
  layout: MergeLayout
  activeId?: number
  onJump: (id: number, options?: FocusConflictOptions) => void
}) {
  // The scroll content has a 45vh bottom padding, so include it in the total
  // height to keep ruler ticks aligned with the actual conflict positions.
  const total = (layout.totalHeight || 1) + window.innerHeight * 0.45
  return (
    <div className="overview-ruler" aria-hidden="true">
      {layout.regions.map((region) => {
        const top = (region.top / total) * 100
        const height = ((region.bottom - region.top) / total) * 100
        return (
          <button
            key={region.id}
            type="button"
            className={cn(
              'overview-tick',
              region.resolved && 'overview-tick--resolved',
              region.id === activeId && 'overview-tick--active',
            )}
            style={{ top: `${top}%`, height: `${height}%` }}
            title={region.resolved ? 'Resolved conflict' : 'Unresolved conflict'}
            onClick={() => onJump(region.id, { scroll: true })}
          />
        )
      })}
    </div>
  )
}

function ContextGroup({ rows }: { rows: MergeRow[] }) {
  return (
    <div>
      {rows.map((row, index) => <RowView key={index} row={row} />)}
    </div>
  )
}

function MergeDivider({
  kind,
  layout,
  activeId,
  resolutions,
  handledSides,
  innerRef,
  scrollTopRef,
  onToggleSide,
  onIgnoreSide,
  onFocusConflict,
}: {
  kind: 'left' | 'right'
  layout: MergeLayout
  activeId?: number
  resolutions: Record<number, Resolution>
  handledSides: Record<number, SideHandling>
  innerRef: { current: HTMLDivElement | null }
  scrollTopRef: { current: number }
  onToggleSide: (id: number, side: Side) => void
  onIgnoreSide: (id: number, side: Side) => void
  onFocusConflict: (id: number, options?: FocusConflictOptions) => void
}) {
  const side: Side = kind === 'left' ? 'ours' : 'theirs'
  return (
    <div className="merge-divider border-r border-[var(--border)]">
      <div
        ref={innerRef}
        className="merge-divider__inner"
        style={{ height: `${layout.totalHeight}px`, transform: `translateY(${-scrollTopRef.current}px)` }}
      >
        <svg className="merge-ribbons" width={DIVIDER_W} height={layout.totalHeight} aria-hidden="true">
          {layout.regions.flatMap(region =>
            ribbonShapes(kind, region, side).map((shape, index) => (
              <polygon
                key={`${region.id}-${index}`}
                className={cn(`ribbon ribbon-${shape.source}`, region.id === activeId && 'ribbon--active')}
                points={shape.points}
              />
            )),
          )}
        </svg>
        {layout.regions.map(region => (
          <DividerActions
            key={region.id}
            side={side}
            region={region}
            resolution={resolutions[region.id]}
            handled={isSideHandled(handledSides[region.id], side)}
            onToggleSide={onToggleSide}
            onIgnoreSide={onIgnoreSide}
            onFocusConflict={onFocusConflict}
          />
        ))}
      </div>
    </div>
  )
}

function DividerActions({
  side,
  region,
  resolution,
  handled,
  onToggleSide,
  onIgnoreSide,
  onFocusConflict,
}: {
  side: Side
  region: MergeRegion
  resolution?: Resolution
  handled: boolean
  onToggleSide: (id: number, side: Side) => void
  onIgnoreSide: (id: number, side: Side) => void
  onFocusConflict: (id: number, options?: FocusConflictOptions) => void
}) {
  const active = isSideActive(resolution, side)
  const arrowTitle = side === 'ours' ? 'Accept left (ours)' : 'Accept right (theirs)'
  const acceptSide = () => {
    onFocusConflict(region.id)
    onToggleSide(region.id, side)
  }
  const ignoreSide = () => {
    onFocusConflict(region.id)
    onIgnoreSide(region.id, side)
  }
  const acceptButton = (
    <button
      type="button"
      className={cn('divider-btn', active && 'is-active')}
      title={active ? `${arrowTitle} — applied (click to remove)` : arrowTitle}
      onClick={acceptSide}
    >
      <Icon name={side === 'ours' ? 'acceptRight' : 'acceptLeft'} />
    </button>
  )
  const ignoreButton = (
    <button
      type="button"
      className={cn('divider-btn', handled && 'is-active')}
      title={handled ? 'Ignored side — handled' : 'Ignore this side'}
      onClick={ignoreSide}
    >
      <Icon name="ignore" />
    </button>
  )

  return (
    <div className="divider-actions" style={{ top: `${region.top}px` }}>
      {side === 'ours'
        ? (
            <>
              {ignoreButton}
              {acceptButton}
            </>
          )
        : (
            <>
              {acceptButton}
              {ignoreButton}
            </>
          )}
    </div>
  )
}

function isSideActive(resolution: Resolution | undefined, side: Side): boolean {
  return Array.isArray(resolution) && resolution.includes(side)
}

function isSideHandled(handling: SideHandling | undefined, side: Side): boolean {
  return Boolean(handling?.[side])
}

function isSideSettled(group: MergeGroup, side: MergeSide): boolean {
  if (side === 'ours')
    return group.oursSettled
  if (side === 'theirs')
    return group.theirsSettled
  return group.centerSettled
}

function ribbonShapes(kind: 'left' | 'right', region: MergeRegion, fallbackSource: Side): Array<{ source: Side, points: string }> {
  if (!region.sourceSegments.length)
    return [{ source: fallbackSource, points: fullRibbonPoints(kind, region) }]

  return region.sourceSegments.map(segment => ({
    source: segment.source,
    points: ribbonSegmentPoints(kind, region, segment),
  }))
}

function fullRibbonPoints(kind: 'left' | 'right', region: MergeRegion): string {
  const { top } = region
  const w = DIVIDER_W
  if (kind === 'left')
    return `0,${top} 0,${region.oursBottom} ${w},${region.centerBottom} ${w},${top}`
  return `0,${top} 0,${region.centerBottom} ${w},${region.theirsBottom} ${w},${top}`
}

function ribbonSegmentPoints(kind: 'left' | 'right', region: MergeRegion, segment: MergeSourceSegment): string {
  const w = DIVIDER_W
  const sideBottom = kind === 'left' ? region.oursBottom : region.theirsBottom
  const sideTop = mapRibbonY(segment.top, region.top, region.centerBottom, region.top, sideBottom)
  const sideEnd = mapRibbonY(segment.bottom, region.top, region.centerBottom, region.top, sideBottom)
  if (kind === 'left')
    return `0,${sideTop} 0,${sideEnd} ${w},${segment.bottom} ${w},${segment.top}`
  return `0,${segment.top} 0,${segment.bottom} ${w},${sideEnd} ${w},${sideTop}`
}

function mapRibbonY(value: number, fromTop: number, fromBottom: number, toTop: number, toBottom: number): number {
  if (fromBottom <= fromTop)
    return toTop
  const ratio = (value - fromTop) / (fromBottom - fromTop)
  return toTop + (toBottom - toTop) * ratio
}

function RowView({ row }: { row: MergeRow }) {
  return (
    <div className={cn('merge-row', `tone-${row.tone}`, row.filler && 'merge-row--filler')}>
      <span className="merge-row__no">{row.lineNo ?? ''}</span>
      <span className="merge-row__text">{row.filler ? '' : (row.text || ' ')}</span>
    </div>
  )
}

type MergeSide = 'ours' | 'center' | 'theirs'
type MergeTone = 'ctx' | 'ours' | 'theirs' | 'result' | 'result-ours' | 'result-theirs' | 'unresolved' | 'removed'

interface MergeRow {
  text: string
  lineNo: number | null
  tone: MergeTone
  filler: boolean
}

interface MergeGroup {
  key: string
  kind: 'context' | 'conflict'
  conflictId?: number
  chunk?: ChoiceConflictChunk
  rowCount: number
  oursCount: number
  centerCount: number
  theirsCount: number
  unresolved: boolean
  // Per-pane "handled" flags: a pane's highlight is cleared once that side has
  // actually been interacted with (accepted, or the whole block ignored).
  oursSettled: boolean
  centerSettled: boolean
  theirsSettled: boolean
  sourceSegments: ResultSourceSegment[]
  ours: MergeRow[]
  center: MergeRow[]
  theirs: MergeRow[]
}

interface ResultSourceSegment {
  source: Side
  start: number
  end: number
}

interface MergeSourceSegment {
  source: Side
  top: number
  bottom: number
}

interface MergeRegion {
  id: number
  top: number
  bottom: number
  oursBottom: number
  centerBottom: number
  theirsBottom: number
  resolved: boolean
  sourceSegments: MergeSourceSegment[]
}

interface MergeLayout {
  groups: MergeGroup[]
  regions: MergeRegion[]
  totalHeight: number
}

function buildLayout(chunks: ConflictChunk[], resolutions: Record<number, Resolution>, handledSides: Record<number, SideHandling>): MergeLayout {
  const groups: MergeGroup[] = []
  const regions: MergeRegion[] = []
  const counters = { ours: 0, center: 0, theirs: 0 }
  let row = 0

  chunks.forEach((chunk, index) => {
    if (chunk.type === 'context') {
      const group = buildContextGroup(chunk, index, counters)
      groups.push(group)
      row += group.rowCount
      return
    }

    const group = buildConflictGroup(chunk, resolutions[chunk.id], handledSides[chunk.id], counters)
    groups.push(group)
    const top = row * LINE_HEIGHT
    // For unresolved blocks, stretch the center band to the full region height
    // so the connector ribbons clearly point at the still-open conflict.
    const centerRows = group.unresolved ? group.rowCount : group.centerCount
    regions.push({
      id: chunk.id,
      top,
      bottom: top + group.rowCount * LINE_HEIGHT,
      oursBottom: top + group.oursCount * LINE_HEIGHT,
      centerBottom: top + centerRows * LINE_HEIGHT,
      theirsBottom: top + group.theirsCount * LINE_HEIGHT,
      resolved: !group.unresolved,
      sourceSegments: group.sourceSegments.map(segment => ({
        source: segment.source,
        top: top + segment.start * LINE_HEIGHT,
        bottom: top + segment.end * LINE_HEIGHT,
      })),
    })
    row += group.rowCount
  })

  return { groups, regions, totalHeight: row * LINE_HEIGHT }
}

function buildContextGroup(
  chunk: ContextConflictChunk,
  index: number,
  counters: { ours: number, center: number, theirs: number },
): MergeGroup {
  const lines = splitForDisplay(chunk.content)
  const ours: MergeRow[] = []
  const center: MergeRow[] = []
  const theirs: MergeRow[] = []

  for (const text of lines) {
    ours.push({ text, lineNo: ++counters.ours, tone: 'ctx', filler: false })
    center.push({ text, lineNo: ++counters.center, tone: 'ctx', filler: false })
    theirs.push({ text, lineNo: ++counters.theirs, tone: 'ctx', filler: false })
  }

  return { key: `ctx-${index}`, kind: 'context', rowCount: lines.length, oursCount: lines.length, centerCount: lines.length, theirsCount: lines.length, unresolved: false, oursSettled: false, centerSettled: false, theirsSettled: false, sourceSegments: [], ours, center, theirs }
}

function buildConflictGroup(
  chunk: ChoiceConflictChunk,
  resolution: Resolution | undefined,
  handled: SideHandling | undefined,
  counters: { ours: number, center: number, theirs: number },
): MergeGroup {
  const oursLines = splitForDisplay(chunk.ours)
  const theirsLines = splitForDisplay(chunk.theirs)
  const centerSegs = resolvedSegments(oursLines, theirsLines, resolution)
  const sourceSegments = resultSourceSegments(centerSegs)
  const fillerTone: MergeTone = resolution === undefined ? 'unresolved' : centerSegs.length ? 'result' : 'removed'
  const centerHeight = resolution === undefined
    ? Math.max(oursLines.length, theirsLines.length, 1)
    : Math.max(centerSegs.length, 1)
  const ours = buildSideRows(oursLines, 'ours', counters, 'ours')
  const center = buildCenterRows(centerSegs, centerHeight, fillerTone, counters)
  const theirs = buildSideRows(theirsLines, 'theirs', counters, 'theirs')
  const height = Math.max(ours.length, center.length, theirs.length, 1)

  return {
    key: `cf-${chunk.id}`,
    kind: 'conflict',
    conflictId: chunk.id,
    chunk,
    rowCount: height,
    oursCount: ours.length,
    centerCount: center.length,
    theirsCount: theirs.length,
    unresolved: resolution === undefined,
    oursSettled: isSideActive(resolution, 'ours') || isSideHandled(handled, 'ours'),
    theirsSettled: isSideActive(resolution, 'theirs') || isSideHandled(handled, 'theirs'),
    centerSettled: resolution !== undefined,
    sourceSegments,
    ours,
    center,
    theirs,
  }
}

interface CenterSegment {
  text: string
  source: Side
}

// Each resolved result line keeps its origin so the center pane can colour and
// stripe ours- vs theirs-derived lines, making the merged content obvious.
function resolvedSegments(oursLines: string[], theirsLines: string[], resolution: Resolution | undefined): CenterSegment[] {
  if (!Array.isArray(resolution))
    return []
  return resolution.flatMap(side =>
    (side === 'ours' ? oursLines : theirsLines).map(text => ({ text, source: side })),
  )
}

function resultSourceSegments(segments: CenterSegment[]): ResultSourceSegment[] {
  const result: ResultSourceSegment[] = []
  for (const [index, segment] of segments.entries()) {
    const previous = result[result.length - 1]
    if (previous?.source === segment.source) {
      previous.end = index + 1
      continue
    }
    result.push({ source: segment.source, start: index, end: index + 1 })
  }
  return result
}

function buildCenterRows(
  segments: CenterSegment[],
  height: number,
  fillerTone: MergeTone,
  counters: { ours: number, center: number, theirs: number },
): MergeRow[] {
  const rows: MergeRow[] = []
  for (let i = 0; i < height; i += 1) {
    if (i < segments.length) {
      const segment = segments[i]
      rows.push({
        text: segment.text,
        lineNo: ++counters.center,
        tone: segment.source === 'ours' ? 'result-ours' : 'result-theirs',
        filler: false,
      })
    }
    else {
      rows.push({ text: '', lineNo: null, tone: fillerTone, filler: true })
    }
  }
  return rows
}

function buildSideRows(
  lines: string[],
  tone: MergeTone,
  counters: { ours: number, center: number, theirs: number },
  counterKey: 'ours' | 'center' | 'theirs',
): MergeRow[] {
  const rows: MergeRow[] = []
  for (const line of lines)
    rows.push({ text: line, lineNo: ++counters[counterKey], tone, filler: false })
  return rows
}

function splitForDisplay(text: string): string[] {
  if (!text)
    return []
  const parts = text.split('\n')
  if (parts.length > 1 && parts[parts.length - 1] === '')
    parts.pop()
  return parts
}

function buildTree(files: ConflictFile[]): TreeNode[] {
  const root: TreeNode = { kind: 'directory', name: '', path: '', children: [] }

  files.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const nodePath = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      let child = current.children.find(item => item.name === part)
      if (!child) {
        child = {
          kind: isFile ? 'file' : 'directory',
          name: part,
          path: nodePath,
          children: [],
          file: isFile ? file : undefined,
        }
        current.children.push(child)
      }
      current = child
    })
  })

  return sortTree(root.children)
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .sort((left, right) => {
      if (left.kind !== right.kind)
        return left.kind === 'directory' ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    .map(node => ({
      ...node,
      children: sortTree(node.children),
    }))
}

function resolveChunks(chunks: ConflictChunk[], resolutions: Record<number, Resolution>): string {
  return chunks.map((chunk) => {
    if (chunk.type === 'context')
      return chunk.content

    const resolution = resolutions[chunk.id]
    if (Array.isArray(resolution))
      return joinSides(resolution.map(side => (side === 'ours' ? chunk.ours : chunk.theirs)))

    return [
      `<<<<<<< ${chunk.oursLabel}\n`,
      chunk.ours,
      chunk.base !== undefined && chunk.baseLabel ? `||||||| ${chunk.baseLabel}\n${chunk.base}` : '',
      '=======\n',
      chunk.theirs,
      `>>>>>>> ${chunk.theirsLabel}\n`,
    ].join('')
  }).join('')
}

// Concatenate accepted sides; insert a newline between parts when the previous
// side has no trailing newline (e.g. an end-of-file conflict) so lines never merge.
function joinSides(parts: string[]): string {
  return parts.reduce((acc, part) => {
    if (acc && !acc.endsWith('\n') && part)
      return `${acc}\n${part}`
    return acc + part
  }, '')
}

render(<App />, document.querySelector('#app')!)
