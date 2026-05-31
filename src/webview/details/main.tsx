import altArrowDownIcon from '@iconify/icons-solar/alt-arrow-down-line-duotone'
import altArrowRightIcon from '@iconify/icons-solar/alt-arrow-right-line-duotone'
import archiveIcon from '@iconify/icons-solar/archive-line-duotone'
import branchingIcon from '@iconify/icons-solar/branching-paths-down-line-duotone'
import checklistIcon from '@iconify/icons-solar/checklist-line-duotone'
import codeSquareIcon from '@iconify/icons-solar/code-square-line-duotone'
import copyIcon from '@iconify/icons-solar/copy-line-duotone'
import documentTextIcon from '@iconify/icons-solar/document-text-line-duotone'
import fileTextIcon from '@iconify/icons-solar/file-text-line-duotone'
import folderIcon from '@iconify/icons-solar/folder-line-duotone'
import folderOpenIcon from '@iconify/icons-solar/folder-open-line-duotone'
import folderWithFilesIcon from '@iconify/icons-solar/folder-with-files-line-duotone'
import galleryIcon from '@iconify/icons-solar/gallery-wide-line-duotone'
import historyIcon from '@iconify/icons-solar/history-line-duotone'
import searchIcon from '@iconify/icons-solar/minimalistic-magnifer-line-duotone'
import refreshIcon from '@iconify/icons-solar/refresh-circle-line-duotone'
import { render } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import './styles.css'

interface VsCodeApi {
  postMessage: (message: unknown) => void
}

declare function acquireVsCodeApi(): VsCodeApi

interface BranchStatus {
  current: string
  upstream?: string
  ahead: number
  behind: number
  detached: boolean
}

interface GitCounts {
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
}

interface RepositoryOption {
  root: string
  name: string
  label: string
  description: string
}

interface GitChange {
  path: string
  originalPath?: string
  index: string
  worktree: string
  kind: 'added' | 'copied' | 'conflict' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  staged: boolean
  conflicted: boolean
  summary: string
}

interface DetailsCommit {
  hash: string
  shortHash: string
  parents: string[]
  decorations: string[]
  author: string
  authorEmail: string
  relativeDate: string
  authorDate: string
  subject: string
  avatarUrl: string
  filesChanged: number
  additions: number
  deletions: number
  files: DetailsCommitFile[]
}

interface DetailsCommitFile {
  path: string
  additions: number
  deletions: number
  status: string
}

interface CommitFileTreeNode {
  kind: 'directory' | 'file'
  name: string
  path: string
  children: CommitFileTreeNode[]
  file?: DetailsCommitFile
}

interface GitBranch {
  name: string
  ref: string
  shortHash: string
  relativeDate: string
  upstream?: string
  current: boolean
  remote: boolean
  ahead?: number
  behind?: number
}

interface GitStash {
  name: string
  relativeDate: string
  message: string
}

interface GitOperation {
  kind: 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  label: string
}

interface ReadySnapshot {
  state: 'ready'
  root: string
  repoName: string
  repositories: RepositoryOption[]
  selectedRepositoryRoot: string
  branch: BranchStatus
  operation: GitOperation
  changes: GitChange[]
  conflicts: GitChange[]
  commits: DetailsCommit[]
  branches: GitBranch[]
  stashes: GitStash[]
  counts: GitCounts
  generatedAt: string
}

interface EmptySnapshot {
  state: 'empty'
  reason: string
  repositories: RepositoryOption[]
  selectedRepositoryRoot?: string
}

type DetailsSnapshot = ReadySnapshot | EmptySnapshot

interface SnapshotMessage {
  type: 'snapshot'
  snapshot: DetailsSnapshot
}

type GraphConnector = {
  from: number
  to: number
  colorLane: number
} & (
  | { kind: 'fork', newLane: boolean }
  | { kind: 'join-node' }
)

interface GraphRow {
  commit: DetailsCommit
  lane: number
  branchBadge?: BranchBadge
  before: Array<string | undefined>
  after: Array<string | undefined>
  connectors: GraphConnector[]
  columns: number
}

interface BranchBadge {
  label: string
  latest: boolean
}

interface GraphLayout {
  rowHeight: number
  width: number
  start: number
  spacing: number
  nodeOuter: number
  xForLane: (lane: number) => number
}

interface HoverState {
  commit: DetailsCommit
  x: number
  y: number
}

const vscode = acquireVsCodeApi()

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ')
}

interface SolarIconData {
  width?: number
  height?: number
  body: string
}

const solarIcons = {
  archive: archiveIcon,
  branch: branchingIcon,
  checklist: checklistIcon,
  chevronDown: altArrowDownIcon,
  chevronRight: altArrowRightIcon,
  code: codeSquareIcon,
  copy: copyIcon,
  document: documentTextIcon,
  file: fileTextIcon,
  folder: folderIcon,
  folderOpen: folderOpenIcon,
  files: folderWithFilesIcon,
  image: galleryIcon,
  history: historyIcon,
  search: searchIcon,
  refresh: refreshIcon,
} satisfies Record<string, SolarIconData>

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

function laneToken(laneClass: string) {
  if (laneClass === 'lane-1')
    return { pill: 'bg-[color-mix(in_srgb,var(--violet)_68%,#20102d)]', connector: 'bg-[var(--violet)]' }
  if (laneClass === 'lane-2')
    return { pill: 'bg-[color-mix(in_srgb,var(--orange)_68%,#2d1c10)]', connector: 'bg-[var(--orange)]' }
  return { pill: 'bg-[color-mix(in_srgb,var(--blue)_66%,#123)]', connector: 'bg-[var(--blue)]' }
}

interface ReadyViewProps {
  snapshot: ReadySnapshot
  onHover: (state: HoverState) => void
  onHoverEnd: () => void
}

function ReadyView({ snapshot, onHover, onHoverEnd }: ReadyViewProps) {
  const unstaged = snapshot.changes.filter(change => !change.conflicted && (change.kind === 'untracked' || change.worktree !== ' '))
  const staged = snapshot.changes.filter(change => change.staged && !change.conflicted)
  const changed = [...staged, ...unstaged, ...snapshot.conflicts]
  const [commitQuery, setCommitQuery] = useState('')
  const visibleCommits = useMemo(
    () => commitQuery.trim()
      ? snapshot.commits.filter(commit => commitMatchesSearch(commit, commitQuery))
      : snapshot.commits,
    [commitQuery, snapshot.commits],
  )
  const graphRows = useMemo(() => buildGraphRows(visibleCommits), [visibleCommits])
  const graph = useMemo(() => graphLayout(graphRows), [graphRows])
  const hasWorkingRow = changed.length > 0 && !commitQuery.trim()
  const [selectedHash, setSelectedHash] = useState(snapshot.commits[0]?.hash ?? '')
  const [detailsWidth, setDetailsWidth] = useState(380)
  const [scrollState, setScrollState] = useState({ height: 0, top: 0 })
  const [loadingMore, setLoadingMore] = useState(false)
  const layoutRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastLoadRequest = useRef(0)
  const selectedCommit = useMemo(
    () => visibleCommits.find(commit => commit.hash === selectedHash) ?? visibleCommits[0],
    [selectedHash, visibleCommits],
  )

  useEffect(() => {
    if (!visibleCommits.some(commit => commit.hash === selectedHash))
      setSelectedHash(visibleCommits[0]?.hash ?? '')
  }, [selectedHash, visibleCommits])

  useEffect(() => {
    const element = scrollRef.current
    if (!element)
      return

    const update = () => {
      setScrollState({
        height: element.clientHeight,
        top: element.scrollTop,
      })
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = 0

    setLoadingMore(false)
  }, [commitQuery])

  useEffect(() => {
    setLoadingMore(false)
  }, [snapshot.generatedAt, snapshot.commits.length])

  const virtual = useMemo(() => {
    const rowHeight = graph.rowHeight
    const workingRows = hasWorkingRow ? 1 : 0
    const totalItems = workingRows + graphRows.length
    const overscan = 8
    const startItem = Math.max(0, Math.floor(scrollState.top / rowHeight) - overscan)
    const endItem = Math.min(
      totalItems,
      Math.ceil((scrollState.top + scrollState.height) / rowHeight) + overscan,
    )
    const commitStart = Math.max(0, startItem - workingRows)
    const commitEnd = Math.max(commitStart, Math.min(graphRows.length, endItem - workingRows))

    return {
      commitEnd,
      commitStart,
      endItem,
      startItem,
      totalHeight: totalItems * rowHeight,
      workingRows,
    }
  }, [graph.rowHeight, graphRows.length, hasWorkingRow, scrollState.height, scrollState.top])

  function handleCommitScroll(event: Event): void {
    const element = event.currentTarget as HTMLDivElement
    setScrollState({
      height: element.clientHeight,
      top: element.scrollTop,
    })

    if (commitQuery.trim())
      return

    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < graph.rowHeight * 8
    if (!nearBottom || !snapshot.commits.length)
      return

    if (lastLoadRequest.current === snapshot.commits.length)
      return

    lastLoadRequest.current = snapshot.commits.length
    setLoadingMore(true)
    vscode.postMessage({ type: 'loadMore' })
  }

  function startResize(clientX: number): void {
    const rect = layoutRef.current?.getBoundingClientRect()
    if (!rect)
      return

    const minGraphWidth = 420
    const minDetailsWidth = 280
    const splitterWidth = 6
    const available = rect.width - splitterWidth
    const maxDetailsWidth = Math.max(minDetailsWidth, available - minGraphWidth)
    const minWidth = Math.min(minDetailsWidth, maxDetailsWidth)

    const update = (nextClientX: number) => {
      const rawWidth = rect.right - nextClientX
      setDetailsWidth(Math.min(maxDetailsWidth, Math.max(minWidth, rawWidth)))
    }
    const handleMove = (event: PointerEvent) => update(event.clientX)
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    update(clientX)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }

  return (
    <div className="grid h-screen min-h-[360px] bg-[color-mix(in_srgb,var(--bg)_94%,#17141f)]">
      <main
        ref={layoutRef}
        className="grid min-h-0"
        style={{ gridTemplateColumns: `minmax(360px, 1fr) 6px minmax(280px, ${detailsWidth}px)` }}
      >
        <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
          <div className="grid min-h-[38px] grid-cols-[minmax(130px,220px)_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_76%,#17141f)] px-2 py-1.5">
            <RepositorySelect repositories={snapshot.repositories} selectedRoot={snapshot.selectedRepositoryRoot} />
            <div className="relative min-w-0">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12px] text-[var(--muted)]" />
              <input
                className="h-[26px] w-full min-w-0 rounded border border-transparent bg-[var(--input)] pr-2 pl-7 text-[12px] text-[var(--fg)] outline-none focus:border-[color-mix(in_srgb,var(--blue)_58%,transparent)]"
                placeholder="Search commits, authors, files, hashes..."
                value={commitQuery}
                onInput={event => setCommitQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape')
                    setCommitQuery('')
                }}
              />
            </div>
            {loadingMore && (
              <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]">
                <Icon name="refresh" className="animate-spin text-[12px]" />
                Loading
              </span>
            )}
            <button
              className="inline-flex h-[26px] min-w-[26px] cursor-pointer items-center justify-center rounded border border-transparent bg-transparent px-1.5 text-[13px] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
              title="Refresh"
              onClick={() => vscode.postMessage({ type: 'refresh' })}
            >
              <Icon name="refresh" />
            </button>
          </div>
          <div className="grid min-h-[34px] grid-cols-[210px_var(--graph-col-width)_minmax(300px,1fr)_180px_92px_150px_96px] items-center border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_72%,#17141f)] text-[11px] font-bold text-[var(--muted)] uppercase max-[980px]:grid-cols-[150px_116px_minmax(220px,1fr)_120px_62px_96px] max-[980px]:[&>*:last-child]:hidden">
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Branch / Tag</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Graph</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Commit Message</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Author</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Files</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Date</span>
            <span className="min-w-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_64%,transparent)] px-2.5 text-ellipsis whitespace-nowrap">Hash</span>
          </div>
          <div ref={scrollRef} className="relative min-h-0 overflow-auto" onScroll={handleCommitScroll}>
            {graphRows.length || hasWorkingRow
              ? (
                  <div className="relative min-w-full" style={{ height: `${virtual.totalHeight}px` }}>
                    {hasWorkingRow && virtual.startItem <= 0 && virtual.endItem > 0 && (
                      <WorkingRow
                        changeCount={changed.length}
                        graph={graph}
                        style={{ transform: 'translateY(0px)' }}
                      />
                    )}
                    {graphRows.slice(virtual.commitStart, virtual.commitEnd).map((row, offset) => {
                      const index = virtual.commitStart + offset
                      return (
                        <CommitRow
                          key={row.commit.hash}
                          graph={graph}
                          index={index}
                          row={row}
                          selected={selectedCommit?.hash === row.commit.hash}
                          style={{ transform: `translateY(${(virtual.workingRows + index) * graph.rowHeight}px)` }}
                          onHover={onHover}
                          onHoverEnd={onHoverEnd}
                          onSelect={setSelectedHash}
                        />
                      )
                    })}
                    {graphRows.length > 0 && (
                      <GraphOverlay
                        graph={graph}
                        hasWorkingRow={hasWorkingRow}
                        rows={graphRows}
                        totalHeight={virtual.totalHeight}
                        visibleEnd={virtual.commitEnd}
                        visibleStart={virtual.commitStart}
                      />
                    )}
                  </div>
                )
              : <div className="grid h-full place-items-center text-center text-[var(--muted)]">{commitQuery.trim() ? 'No commits match your search.' : 'No commits yet.'}</div>}
          </div>
        </section>

        <div
          className="relative cursor-col-resize border-x border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--panel)_78%,#17141f)] hover:bg-[color-mix(in_srgb,var(--blue)_28%,var(--panel))]"
          role="separator"
          aria-orientation="vertical"
          title="Resize details"
          onPointerDown={(event) => {
            event.preventDefault()
            startResize(event.clientX)
          }}
        />

        <CommitDetailsPane commit={selectedCommit} />
      </main>
    </div>
  )
}

interface WorkingRowProps {
  changeCount: number
  graph: GraphLayout
  style?: Record<string, string | number>
}

function WorkingRow({ changeCount, graph, style }: WorkingRowProps) {
  return (
    <article className="absolute top-0 right-0 left-0 z-[1] grid h-[var(--graph-row-height)] min-h-[var(--graph-row-height)] grid-cols-[210px_var(--graph-col-width)_minmax(300px,1fr)_180px_92px_150px_96px] items-center border-b border-[color-mix(in_srgb,var(--border)_32%,transparent)] bg-[color-mix(in_srgb,var(--bg)_97%,#12161d)] hover:bg-[var(--hover)] max-[980px]:grid-cols-[150px_116px_minmax(220px,1fr)_120px_62px_96px] max-[980px]:[&>*:last-child]:hidden" style={style}>
      <div className="relative flex min-w-0 items-center gap-[5px] overflow-visible py-0 pr-0 pl-3" />
      <div className="relative h-[var(--graph-row-height)] overflow-visible p-0">
        <div className="relative h-[var(--graph-row-height)] w-[var(--graph-col-width)] min-w-[var(--graph-col-width)]">
          <LogBackdrop className="lane-0 working" left={graph.start - graph.nodeOuter / 2} />
          <span
            className="absolute top-1/2 z-[2] h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-dotted border-[var(--blue)]"
            style={{ left: `${graph.start}px` }}
          />
        </div>
      </div>
      <div className="min-w-0 overflow-hidden px-2.5 font-extrabold text-ellipsis whitespace-nowrap italic">Working Changes</div>
      <div className="min-w-0 overflow-hidden px-2.5 text-ellipsis whitespace-nowrap text-[var(--muted)]" />
      <div className="min-w-0 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]">{changeCount}</div>
      <div className="min-w-0 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]" />
      <div className="min-w-0 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]" />
    </article>
  )
}

interface CommitRowProps {
  row: GraphRow
  index: number
  graph: GraphLayout
  selected: boolean
  style?: Record<string, string | number>
  onHover: (state: HoverState) => void
  onHoverEnd: () => void
  onSelect: (hash: string) => void
}

function CommitRow({ row, index, graph, selected, style, onHover, onHoverEnd, onSelect }: CommitRowProps) {
  const commit = row.commit
  const badge = row.branchBadge
  const fileCount = commit.filesChanged
  const laneClass = `lane-${row.lane % 3}`
  const lane = laneToken(laneClass)

  return (
    <article
      className={cn(
        'group absolute top-0 right-0 left-0 z-[1] grid h-[var(--graph-row-height)] min-h-[var(--graph-row-height)] cursor-pointer grid-cols-[210px_var(--graph-col-width)_minmax(300px,1fr)_180px_92px_150px_96px] items-center border-b border-[color-mix(in_srgb,var(--border)_32%,transparent)] bg-[color-mix(in_srgb,var(--bg)_97%,#12161d)] outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] max-[980px]:grid-cols-[150px_116px_minmax(220px,1fr)_120px_62px_96px] max-[980px]:[&>*:last-child]:hidden',
        index % 2 === 1 && !selected && 'bg-[color-mix(in_srgb,var(--bg)_94%,#12161d)]',
        selected && 'bg-[color-mix(in_srgb,var(--selected)_68%,var(--bg))]',
      )}
      data-commit={commit.hash}
      role="button"
      style={style}
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(commit.hash)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(commit.hash)
        }
      }}
      onMouseEnter={event => onHover({ commit, x: event.clientX, y: event.clientY })}
      onMouseLeave={onHoverEnd}
      onMouseMove={event => onHover({ commit, x: event.clientX, y: event.clientY })}
    >
      <div className="relative flex min-w-0 items-center gap-[5px] overflow-visible py-0 pr-0 pl-3">
        {badge && (
          <>
            <span
              className={cn(
                'relative z-[1] inline-block min-h-[19px] max-w-36 flex-[0_1_auto] truncate rounded-xs px-1.5 align-middle text-[11px] leading-[19px] text-[#e7f6ff] transition-opacity',
                lane.pill,
                !badge.latest && 'opacity-0 group-hover:opacity-45 group-focus-visible:opacity-45',
              )}
              title={badge.latest ? badge.label : `${badge.label} (not latest)`}
            >
              {badge.label}
            </span>
            {badge.latest && <span className={cn('h-px min-w-0 flex-1 opacity-50', lane.connector)} />}
          </>
        )}
      </div>
      <div className="relative h-[var(--graph-row-height)] overflow-visible p-0">
        <LogBackdrop className={laneClass} left={graph.xForLane(row.lane) - graph.nodeOuter / 2} />
      </div>
      <div className="min-w-0 overflow-hidden px-2.5 text-ellipsis whitespace-nowrap" title={commit.subject}>{commit.subject || '(no subject)'}</div>
      <div className="min-w-0 overflow-hidden px-2.5 text-ellipsis whitespace-nowrap text-[var(--muted)]" title={commit.authorEmail}>{commit.author}</div>
      <div className="flex min-w-0 items-center gap-1 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)]">
        <Icon name="files" className="text-[11px]" />
        <span className="[font-family:var(--vscode-editor-font-family)]">{fileCount}</span>
      </div>
      <div className="min-w-0 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]">{commit.relativeDate}</div>
      <div className="min-w-0 overflow-hidden px-2.5 text-xs text-ellipsis whitespace-nowrap text-[var(--muted)] [font-family:var(--vscode-editor-font-family)]">{commit.shortHash}</div>
    </article>
  )
}

function LogBackdrop({ className, left }: { className: string, left: number }) {
  return <span className={`log-backdrop ${className}`} style={{ left: `${Math.max(0, Math.round(left))}px` }} />
}

interface GraphOverlayProps {
  rows: GraphRow[]
  hasWorkingRow: boolean
  graph: GraphLayout
  totalHeight: number
  visibleEnd: number
  visibleStart: number
}

function GraphOverlay({ rows, hasWorkingRow, graph, totalHeight, visibleEnd, visibleStart }: GraphOverlayProps) {
  const rowHeight = graph.rowHeight
  const offsetY = hasWorkingRow ? rowHeight : 0
  const height = totalHeight
  const paths: Array<{ className: string, d: string }> = []
  const nodes: Array<{ row: GraphRow, x: number, y: number, className: string }> = []

  rows.forEach((row, index) => {
    if (index < visibleStart || index >= visibleEnd)
      return

    const y = offsetY + index * rowHeight + rowHeight / 2
    const laneClass = `lane-${row.lane % 3}`
    const forkTargets = new Set(row.connectors
      .filter(connector => connector.kind === 'fork' && connector.newLane)
      .map(connector => connector.to))
    const badge = row.branchBadge

    if (badge?.latest) {
      const x = graph.xForLane(row.lane)
      paths.push({
        className: `graph-line branch-link ${laneClass}`,
        d: `M 0 ${y} L ${x} ${y}`,
      })
    }

    row.after.forEach((value, lane) => {
      if (!value || forkTargets.has(lane))
        return

      const x = graph.xForLane(lane)
      const nextRow = rows[index + 1]
      const nextJoin = nextRow?.connectors.find(connector => connector.kind === 'join-node' && connector.from === lane)
      const nextY = offsetY + (index + 1) * rowHeight + rowHeight / 2
      const endY = nextJoin
        ? joinNodeStartY(graph.xForLane(nextJoin.from), graph.xForLane(nextJoin.to), nextY)
        : Math.min(height, y + rowHeight)

      if (endY > y) {
        paths.push({
          className: `graph-line lane-${lane % 3}`,
          d: `M ${x} ${y} L ${x} ${endY}`,
        })
      }
    })

    row.connectors.forEach((connector) => {
      const from = graph.xForLane(connector.from)
      const to = graph.xForLane(connector.to)
      const d = connector.kind === 'fork'
        ? forkPath(from, to, y, rowHeight)
        : joinNodePath(from, to, y)
      paths.push({
        className: `graph-line curve lane-${connector.colorLane % 3}`,
        d,
      })
    })

    nodes.push({
      row,
      x: graph.xForLane(row.lane),
      y,
      className: laneClass,
    })
  })

  return (
    <svg className="graph-overlay pointer-events-none absolute top-0 left-[210px] z-[3] w-[var(--graph-col-width)] overflow-visible" height={height} viewBox={`0 0 ${graph.width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {paths.map((path, index) => <path key={`${path.d}-${index}`} className={path.className} d={path.d} />)}
      {nodes.map(node => <GraphNode key={node.row.commit.hash} className={node.className} graph={graph} row={node.row} x={node.x} y={node.y} />)}
    </svg>
  )
}

interface GraphNodeProps {
  row: GraphRow
  x: number
  y: number
  className: string
  graph: GraphLayout
}

function GraphNode({ row, x, y, className, graph }: GraphNodeProps) {
  const commit = row.commit
  return (
    <foreignObject x={x - graph.nodeOuter / 2} y={y - graph.nodeOuter / 2} width={graph.nodeOuter} height={graph.nodeOuter}>
      <div className={`graph-node-badge ${className}`}>
        {commit.avatarUrl
          ? <img className="block h-full w-full object-cover" src={commit.avatarUrl} alt="" />
          : initials(commit.author)}
      </div>
    </foreignObject>
  )
}

function CommitDetailsPane({ commit }: { commit: DetailsCommit | undefined }) {
  const [fileQuery, setFileQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    setFileQuery('')
    setSelectedPath('')
    setExpandedFolders(new Set(listDirectoryPaths(commit?.files ?? [])))
  }, [commit?.hash])

  if (!commit) {
    return (
      <aside className="grid min-h-0 min-w-0 place-items-center overflow-hidden bg-[color-mix(in_srgb,var(--bg)_92%,#15131d)] text-center text-[var(--muted)]">
        Select a commit to inspect details.
      </aside>
    )
  }

  const selectedCommit = commit
  const prNumber = pullRequestNumber(selectedCommit)
  const absoluteDate = formatCommitDate(selectedCommit.authorDate)
  const refLabel = selectedCommit.decorations.find(item => item !== 'HEAD') || currentBranch()
  const normalizedQuery = fileQuery.trim().toLowerCase()
  const visibleFiles = normalizedQuery
    ? selectedCommit.files.filter(file => fileMatchesSearch(file, fileQuery))
    : selectedCommit.files
  const fileTree = buildFileTree(visibleFiles)
  const parentHash = selectedCommit.parents[0] || ''

  function openFile(file: DetailsCommitFile): void {
    setSelectedPath(file.path)
    vscode.postMessage({
      type: 'openCommitFile',
      hash: selectedCommit.hash,
      parentHash,
      path: file.path,
    })
  }

  function toggleFolder(path: string): void {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(path))
        next.delete(path)
      else
        next.add(path)
      return next
    })
  }

  function copyHash(): void {
    vscode.postMessage({
      type: 'copyText',
      text: selectedCommit.hash,
    })
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--bg)_92%,#15131d)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-3 py-2.5">
        <section className="grid shrink-0 grid-cols-[34px_minmax(0,1fr)] gap-2.5">
          <div className="h-[34px] w-[34px] overflow-hidden rounded border border-[var(--border)] bg-[var(--panel)]">
            {commit.avatarUrl
              ? <img className="block h-full w-full object-cover" src={commit.avatarUrl} alt="" />
              : <div className="grid h-full w-full place-items-center text-xs font-extrabold text-[var(--muted)]">{initials(commit.author)}</div>}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-[var(--success)]">{commit.author}</div>
            <div className="truncate text-[12px] text-[var(--muted)]">{commit.authorEmail || 'No email'}</div>
            <div className="mt-0.5 text-[12px] text-[var(--fg)]">
              {commit.relativeDate}
              {absoluteDate ? ` (${absoluteDate})` : ''}
            </div>
          </div>
        </section>

        <section className="mt-2.5 shrink-0 border-t border-[color-mix(in_srgb,var(--border)_45%,transparent)] pt-2.5">
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <button
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 py-0 text-[var(--muted)] outline-none hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:bg-[var(--hover)] focus-visible:text-[var(--fg)]"
              title="Copy commit hash"
              onClick={copyHash}
            >
              <Icon name="copy" className="text-[11px]" />
              <span className="[font-family:var(--vscode-editor-font-family)]">{commit.shortHash}</span>
            </button>
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate font-semibold text-[var(--blue)]">
              <Icon name="branch" className="text-[12px]" />
              <span className="min-w-0 truncate">{refLabel}</span>
            </span>
            <span className="ml-auto shrink-0 text-[var(--success)]">
              +
              {commit.additions}
            </span>
            <span className="shrink-0 text-[var(--blue)]">
              ~
              {commit.filesChanged}
            </span>
            <span className="shrink-0 text-[#d86f7b]">
              -
              {commit.deletions}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[var(--muted)]">
              <Icon name="files" className="text-[12px]" />
              <span className="[font-family:var(--vscode-editor-font-family)]">{commit.files.length}</span>
            </span>
            {prNumber && (
              <span className="inline-flex min-w-0 shrink items-center gap-1 truncate font-semibold text-[var(--success)]">
                <Icon name="branch" className="text-[12px]" />
                <span className="truncate">
                  PR #
                  {prNumber}
                </span>
              </span>
            )}
          </div>
          <div className="mt-2 text-[14px] font-semibold leading-snug text-[var(--fg)] [overflow-wrap:anywhere]">{commit.subject || '(no subject)'}</div>
        </section>

        <section className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-[color-mix(in_srgb,var(--border)_38%,transparent)] bg-[color-mix(in_srgb,var(--panel)_24%,transparent)]">
          <div className="flex min-h-[30px] shrink-0 items-center justify-between gap-2 px-2.5 text-[11px] font-bold text-[var(--muted)] uppercase">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="files" className="text-[12px]" />
              <span>Files Changed</span>
              <span className="rounded bg-[color-mix(in_srgb,var(--muted)_22%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--fg)]">{commit.files.length}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] text-[var(--muted)]">
              <Icon name="checklist" />
              <span>Review</span>
            </span>
          </div>
          <div className="shrink-0 border-t border-[color-mix(in_srgb,var(--border)_35%,transparent)] px-2 py-1.5">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12px] text-[var(--muted)]" />
              <input
                className="h-[26px] w-full min-w-0 rounded border border-transparent bg-[var(--input)] pr-2 pl-7 text-[12px] text-[var(--fg)] outline-none focus:border-[color-mix(in_srgb,var(--blue)_58%,transparent)]"
                placeholder="Search files..."
                value={fileQuery}
                onInput={event => setFileQuery(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pb-1">
            {fileTree.length
              ? fileTree.map(node => (
                  <CommitFileTreeRow
                    key={node.path}
                    expandedFolders={expandedFolders}
                    forceExpanded={Boolean(normalizedQuery)}
                    node={node}
                    onOpen={openFile}
                    onToggle={toggleFolder}
                    selectedPath={selectedPath}
                  />
                ))
              : <div className="px-3 py-2 text-[12px] text-[var(--muted)]">No matching file changes.</div>}
          </div>
        </section>
      </div>
    </aside>
  )
}

function CommitFileTreeRow({
  node,
  expandedFolders,
  forceExpanded,
  onOpen,
  onToggle,
  selectedPath,
  level = 0,
}: {
  node: CommitFileTreeNode
  expandedFolders: Set<string>
  forceExpanded: boolean
  onOpen: (file: DetailsCommitFile) => void
  onToggle: (path: string) => void
  selectedPath: string
  level?: number
}) {
  if (node.kind === 'directory') {
    const expanded = forceExpanded || expandedFolders.has(node.path)

    return (
      <>
        <button
          className="flex min-h-[25px] w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 py-0 text-left text-[12px] font-semibold text-[var(--fg)] outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
          style={{ paddingLeft: `${8 + level * 14}px` }}
          title={expanded ? 'Collapse folder' : 'Expand folder'}
          onClick={() => onToggle(node.path)}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className="w-3 text-[11px] text-[var(--muted)]" />
          <Icon name={expanded ? 'folderOpen' : 'folder'} className="text-[14px] text-[var(--muted)]" />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
        {expanded && node.children.map(child => (
          <CommitFileTreeRow
            key={child.path}
            expandedFolders={expandedFolders}
            forceExpanded={forceExpanded}
            level={level + 1}
            node={child}
            onOpen={onOpen}
            onToggle={onToggle}
            selectedPath={selectedPath}
          />
        ))}
      </>
    )
  }

  if (!node.file)
    return null

  return (
    <CommitFileReviewRow
      file={node.file}
      level={level}
      onOpen={onOpen}
      selected={selectedPath === node.file.path}
    />
  )
}

function CommitFileReviewRow({
  file,
  level,
  onOpen,
  selected,
}: {
  file: DetailsCommitFile
  level: number
  onOpen: (file: DetailsCommitFile) => void
  selected: boolean
}) {
  const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
  const name = file.path.includes('/') ? file.path.slice(file.path.lastIndexOf('/') + 1) : file.path
  const status = statusLabel(file.status)

  return (
    <button
      className={cn(
        'grid min-h-[27px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-0 bg-transparent px-2 py-0 text-left text-[12px] text-[var(--fg)] outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]',
        selected && 'bg-[color-mix(in_srgb,var(--selected)_58%,transparent)]',
      )}
      style={{ paddingLeft: `${22 + level * 14}px` }}
      title={`Open ${file.path} in diff editor`}
      onClick={() => onOpen(file)}
    >
      <span className="flex min-w-0 items-center overflow-hidden">
        <Icon name={fileIconName(file.path)} className={cn('mr-2 text-[13px]', fileIconTone(file.path))} />
        <span className="min-w-0 truncate font-semibold">{name}</span>
        {folder && <span className="ml-1 min-w-0 truncate text-[var(--muted)]">{folder}</span>}
      </span>
      <span className="text-[11px] text-[var(--success)] [font-family:var(--vscode-editor-font-family)]">
        +
        {file.additions}
      </span>
      <span className="text-[11px] text-[#d86f7b] [font-family:var(--vscode-editor-font-family)]">
        -
        {file.deletions}
      </span>
      <span className={cn('text-[11px] font-semibold [font-family:var(--vscode-editor-font-family)]', status.className)}>{status.text}</span>
    </button>
  )
}

function buildFileTree(files: DetailsCommitFile[]): CommitFileTreeNode[] {
  interface DirectoryDraft {
    kind: 'directory'
    name: string
    path: string
    children: CommitFileTreeNode[]
    childMap: Map<string, DirectoryDraft | CommitFileTreeNode>
  }

  const root: DirectoryDraft = {
    kind: 'directory',
    name: '',
    path: '',
    children: [],
    childMap: new Map(),
  }

  files.forEach((file) => {
    const segments = file.path.split('/').filter(Boolean)
    let current = root
    let currentPath = ''

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isFile = index === segments.length - 1

      if (isFile) {
        current.childMap.set(segment, {
          kind: 'file',
          name: segment,
          path: file.path,
          children: [],
          file,
        })
        return
      }

      const existing = current.childMap.get(segment)
      if (existing?.kind === 'directory' && 'childMap' in existing) {
        current = existing
        return
      }

      const directory: DirectoryDraft = {
        kind: 'directory',
        name: segment,
        path: currentPath,
        children: [],
        childMap: new Map(),
      }
      current.childMap.set(segment, directory)
      current = directory
    })
  })

  function materialize(directory: DirectoryDraft): CommitFileTreeNode[] {
    return sortFileTreeNodes([...directory.childMap.values()].map((node) => {
      if (node.kind === 'directory' && 'childMap' in node) {
        return {
          kind: 'directory',
          name: node.name,
          path: node.path,
          children: materialize(node),
        }
      }

      return node
    }))
  }

  return materialize(root)
}

function sortFileTreeNodes(nodes: CommitFileTreeNode[]): CommitFileTreeNode[] {
  return nodes.sort((left, right) => {
    if (left.kind !== right.kind)
      return left.kind === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

function listDirectoryPaths(files: DetailsCommitFile[]): string[] {
  const directories = new Set<string>()
  files.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean)
    for (let index = 1; index < parts.length; index += 1)
      directories.add(parts.slice(0, index).join('/'))
  })
  return [...directories]
}

function commitMatchesSearch(commit: DetailsCommit, query: string): boolean {
  const tokens = searchTokens(query)
  if (!tokens.length)
    return true

  return tokens.every(token => commitMatchesToken(commit, token))
}

function commitMatchesToken(commit: DetailsCommit, token: string): boolean {
  const scoped = scopedToken(token)
  if (scoped) {
    const [scope, value] = scoped
    if (!value)
      return true

    if (['author', 'a'].includes(scope))
      return includesSearch(`${commit.author} ${commit.authorEmail}`, value)
    if (['file', 'path', 'f'].includes(scope))
      return commit.files.some(file => includesSearch(file.path, value))
    if (['hash', 'sha', 'h'].includes(scope))
      return includesSearch(`${commit.hash} ${commit.shortHash}`, value)
    if (['branch', 'tag', 'ref', 'b'].includes(scope))
      return includesSearch(commit.decorations.join(' '), value)
    if (['message', 'msg', 'subject', 's'].includes(scope))
      return includesSearch(commit.subject, value)
    if (['date', 'time', 'd'].includes(scope))
      return includesSearch(`${commit.relativeDate} ${commit.authorDate}`, value)
  }

  return includesSearch(commitSearchText(commit), token)
}

function commitSearchText(commit: DetailsCommit): string {
  return [
    commit.hash,
    commit.shortHash,
    commit.subject,
    commit.author,
    commit.authorEmail,
    commit.relativeDate,
    commit.authorDate,
    commit.decorations.join(' '),
    commit.files.map(file => `${file.path} ${file.status} +${file.additions} -${file.deletions}`).join(' '),
  ].join(' ')
}

function fileMatchesSearch(file: DetailsCommitFile, query: string): boolean {
  const tokens = searchTokens(query)
  if (!tokens.length)
    return true

  return tokens.every(token => fileMatchesToken(file, token))
}

function fileMatchesToken(file: DetailsCommitFile, token: string): boolean {
  const scoped = scopedToken(token)
  if (scoped) {
    const [scope, value] = scoped
    if (!value)
      return true

    if (['status', 'st'].includes(scope))
      return includesSearch(file.status, value)
    if (['ext', 'extension'].includes(scope))
      return includesSearch(fileExtension(file.path), value)
    if (['path', 'file', 'f'].includes(scope))
      return includesSearch(file.path, value)
  }

  return includesSearch(`${file.path} ${file.status} +${file.additions} -${file.deletions} ${fileExtension(file.path)}`, token)
}

function searchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function scopedToken(token: string): [string, string] | undefined {
  const index = token.indexOf(':')
  if (index <= 0)
    return undefined
  return [token.slice(0, index), token.slice(index + 1)]
}

function includesSearch(value: string, query: string): boolean {
  return value.toLowerCase().includes(query)
}

function fileExtension(filePath: string): string {
  const name = filePath.split('/').pop() || filePath
  const extension = name.includes('.') ? name.split('.').pop() || '' : ''
  return (extension || 'txt').toLowerCase()
}

function fileIconTone(filePath: string): string {
  const extension = fileExtension(filePath)
  if (['ts', 'tsx'].includes(extension))
    return 'text-[var(--blue)]'
  if (['js', 'jsx'].includes(extension))
    return 'text-[var(--orange)]'
  if (['vue', 'css', 'scss', 'less'].includes(extension))
    return 'text-[var(--success)]'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension))
    return 'text-[var(--violet)]'
  return 'text-[var(--muted)]'
}

function fileIconName(filePath: string): keyof typeof solarIcons {
  const extension = fileExtension(filePath)
  if (['ts', 'tsx', 'js', 'jsx', 'vue', 'css', 'scss', 'less', 'html'].includes(extension))
    return 'code'
  if (['md', 'mdx', 'txt'].includes(extension))
    return 'document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension))
    return 'image'
  if (['zip', 'tar', 'gz', 'tgz'].includes(extension))
    return 'archive'
  return 'file'
}

function statusLabel(status: string): { text: string, className: string } {
  const code = status[0] ?? 'M'
  if (code === 'A')
    return { text: 'A', className: 'text-[var(--success)]' }
  if (code === 'D')
    return { text: 'D', className: 'text-[#d86f7b]' }
  if (code === 'R')
    return { text: 'R', className: 'text-[var(--orange)]' }
  if (code === 'C')
    return { text: 'C', className: 'text-[var(--blue)]' }
  return { text: 'M', className: 'text-[var(--blue)]' }
}

function HoverCard({ hover }: { hover: HoverState | undefined }) {
  if (!hover)
    return <div className="hidden" />

  const margin = 14
  const width = 560
  const height = 170
  const left = Math.max(margin, Math.min(hover.x + margin, window.innerWidth - width - margin))
  const top = Math.max(margin, Math.min(hover.y + margin, window.innerHeight - height - margin))
  const commit = hover.commit
  const prNumber = pullRequestNumber(commit)
  const branchLabel = commit.decorations.find(item => item !== 'HEAD') || currentBranch()
  const absoluteDate = formatCommitDate(commit.authorDate)

  return (
    <div
      className="pointer-events-none fixed z-20 w-[min(560px,calc(100vw-24px))] rounded border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--panel-strong)_88%,#17141f)] p-2 text-[12px] leading-[1.25] shadow-[0_12px_26px_rgb(0_0_0_/_28%)]"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
        <div className="h-[34px] w-[34px] overflow-hidden rounded border border-[var(--border)] bg-[var(--panel)]">
          {commit.avatarUrl
            ? <img className="block h-full w-full object-cover" src={commit.avatarUrl} alt="" />
            : <div className="grid h-full w-full place-items-center text-xs font-extrabold text-[var(--muted)]">{initials(commit.author)}</div>}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-semibold">
            <span className="truncate text-[var(--success)]">{commit.author}</span>
            <Icon name="history" className="text-[12px] text-[var(--muted)]" />
            <span className="text-[var(--fg)]">{commit.relativeDate}</span>
            {absoluteDate && <span className="font-normal italic text-[var(--fg)]">{`(${absoluteDate})`}</span>}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-[var(--fg)]">
            <span className="font-mono">{commit.shortHash}</span>
            {prNumber && (
              <span>
                via
                {' '}
                <span className="font-semibold text-[var(--success)]">
                  PR #
                  {prNumber}
                </span>
              </span>
            )}
            <span>
              <span className="text-[var(--success)]">
                +
                {commit.additions}
              </span>
              {' '}
              <span className="text-[var(--blue)]">
                ~
                {commit.filesChanged}
              </span>
              {' '}
              <span className="text-[#d86f7b]">
                -
                {commit.deletions}
              </span>
            </span>
            <span>
              (
              {plural(commit.filesChanged, 'file')}
              {' '}
              changed)
            </span>
            <span className="text-[var(--success)]">{plural(commit.additions, 'addition')}</span>
            <span className="text-[#d86f7b]">{plural(commit.deletions, 'deletion')}</span>
          </div>
        </div>
      </div>
      <div className="mt-2.5 min-w-0 text-[13px] font-semibold text-[var(--fg)] [overflow-wrap:anywhere]">
        {commit.subject || '(no subject)'}
      </div>
      <div className="mt-2 border-t border-[color-mix(in_srgb,var(--border)_72%,transparent)] pt-2">
        <div className="flex min-w-0 items-start gap-1.5 text-[12px]">
          <Icon name="branch" className="mt-0.5 text-[var(--violet)]" />
          <div className="min-w-0">
            <div className="truncate font-extrabold text-[var(--success)]">{branchLabel}</div>
            <div className="text-[var(--fg)]">
              {prNumber ? `#${prNumber} merged ${commit.relativeDate}` : `committed ${commit.relativeDate}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function pullRequestNumber(commit: DetailsCommit): string {
  const value = [commit.subject, ...commit.decorations].join(' ')
  return value.match(/#(\d+)/)?.[1] ?? ''
}

function plural(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}

function formatCommitDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  const day = Number(part('day'))

  return `${part('month')} ${day}${ordinalSuffix(day)}, ${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod')}`
}

function ordinalSuffix(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13)
    return 'th'
  if (value % 10 === 1)
    return 'st'
  if (value % 10 === 2)
    return 'nd'
  if (value % 10 === 3)
    return 'rd'
  return 'th'
}

function latestBranchLabel(commit: DetailsCommit, index: number): string {
  const labels = commit.decorations
    .filter(item => item !== 'HEAD')
    .slice(0, 2)
  const current = currentBranch()
  return labels.find(item => item === current || item.includes(`/${current}`))
    || labels[0]
    || (index === 0 ? current : '')
}

let branchName = ''

function currentBranch() {
  return branchName
}

function buildGraphRows(commits: DetailsCommit[]): GraphRow[] {
  const active: Array<string | undefined> = []
  const branchLabels: Array<string | undefined> = []
  const rows: GraphRow[] = []

  commits.forEach((commit, index) => {
    let lane = active.indexOf(commit.hash)
    if (lane === -1) {
      lane = firstFreeLane(active)
      active[lane] = commit.hash
    }

    const before = active.slice()
    const after = active.slice()
    const latestLabel = latestBranchLabel(commit, index)
    const inheritedLabel = branchLabels[lane]
    const branchBadge = latestLabel
      ? { label: latestLabel, latest: true }
      : inheritedLabel
        ? { label: inheritedLabel, latest: false }
        : undefined
    const parents = commit.parents || []
    const primary = parents[0]
    const connectors: GraphConnector[] = []

    if (latestLabel)
      branchLabels[lane] = latestLabel
    const duplicateLanes = active
      .map((value, index) => ({ value, index }))
      .filter(item => item.value === commit.hash && item.index !== lane)
      .map(item => item.index)

    duplicateLanes.forEach((duplicateLane) => {
      after[duplicateLane] = undefined
      connectors.push({ from: duplicateLane, to: lane, colorLane: duplicateLane, kind: 'join-node' })
    })

    if (primary)
      after[lane] = primary
    else
      after[lane] = undefined

    parents.slice(1).forEach((parent) => {
      let target = after.indexOf(parent)
      const existingTarget = target !== -1
      if (target === -1) {
        target = firstFreeLane(after)
        after[target] = parent
      }
      connectors.push({ from: lane, to: target, colorLane: target, kind: 'fork', newLane: !existingTarget })
    })

    trimLanes(after)
    rows.push({
      commit,
      lane,
      branchBadge,
      before,
      after: after.slice(),
      connectors,
      columns: Math.max(before.length, after.length, lane + 1, 3),
    })

    active.length = 0
    after.forEach((value, index) => {
      active[index] = value
    })
    branchLabels.length = active.length
  })

  return rows
}

function firstFreeLane(lanes: Array<string | undefined>) {
  const index = lanes.findIndex(value => !value)
  return index === -1 ? lanes.length : index
}

function trimLanes(lanes: Array<string | undefined>) {
  while (lanes.length && !lanes[lanes.length - 1])
    lanes.pop()
}

function graphLayout(rows: GraphRow[]): GraphLayout {
  const rowHeight = 34
  const width = 184
  const start = 78
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.columns), 3)
  const spacing = maxColumns > 4
    ? Math.max(16, Math.floor((width - start - 16) / Math.max(1, maxColumns - 1)))
    : 28

  return {
    rowHeight,
    width,
    start,
    spacing,
    nodeOuter: 26,
    xForLane: lane => start + lane * spacing,
  }
}

function forkPath(from: number, to: number, y: number, rowHeight: number) {
  if (from === to)
    return `M ${from} ${y} L ${to} ${y + rowHeight}`

  const direction = to > from ? 1 : -1
  const distance = Math.abs(to - from)
  const radius = Math.min(14, Math.max(8, distance / 3))
  const bendY = y + Math.min(16, rowHeight * 0.42)
  const endY = y + rowHeight
  const startTurnX = from + direction * radius
  const endTurnX = to - direction * radius

  return [
    `M ${from} ${y}`,
    `C ${from} ${bendY}, ${startTurnX} ${bendY}, ${startTurnX} ${bendY}`,
    `L ${endTurnX} ${bendY}`,
    `C ${to} ${bendY}, ${to} ${endY - radius}, ${to} ${endY}`,
  ].join(' ')
}

function joinNodePath(from: number, to: number, y: number) {
  if (from === to)
    return `M ${from} ${y} L ${to} ${y}`

  const direction = to > from ? 1 : -1
  const radius = joinNodeRadius(from, to)
  const startY = joinNodeStartY(from, to, y)
  const firstX = from + direction * radius * 0.42
  const secondX = to - direction * radius * 0.34

  return [
    `M ${from} ${startY}`,
    `C ${from} ${startY + radius * 0.82}, ${firstX} ${y}, ${from + direction * radius * 0.72} ${y}`,
    `C ${secondX} ${y}, ${to} ${y}, ${to} ${y}`,
  ].join(' ')
}

function joinNodeStartY(from: number, to: number, y: number) {
  return y - joinNodeRadius(from, to)
}

function joinNodeRadius(from: number, to: number) {
  return Math.min(22, Math.max(14, Math.abs(to - from) * 0.44))
}

function initials(name: string) {
  const words = String(name || '').trim().split(/[\s._-]+/).filter(Boolean)
  if (!words.length)
    return '?'
  if (words.length === 1)
    return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const root = document.getElementById('app')

function AppShell() {
  const [snapshot, setSnapshot] = useState<DetailsSnapshot>()

  useEffect(() => {
    function handleMessage(event: MessageEvent<SnapshotMessage>) {
      if (event.data.type === 'snapshot') {
        setSnapshot(event.data.snapshot)
        if (event.data.snapshot.state === 'ready')
          branchName = event.data.snapshot.branch.current
      }
    }

    window.addEventListener('message', handleMessage)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (!snapshot)
    return <div className="grid h-screen place-items-center text-center text-[var(--muted)]">Loading Git details...</div>

  return <DetailsAppWithSnapshot snapshot={snapshot} />
}

function DetailsAppWithSnapshot({ snapshot }: { snapshot: DetailsSnapshot }) {
  const [hover, setHover] = useState<HoverState>()

  if (snapshot.state === 'empty')
    return <EmptyDetailsView snapshot={snapshot} />

  branchName = snapshot.branch.current
  return (
    <>
      <ReadyView snapshot={snapshot} onHover={setHover} onHoverEnd={() => setHover(undefined)} />
      <HoverCard hover={hover} />
    </>
  )
}

function EmptyDetailsView({ snapshot }: { snapshot: EmptySnapshot }) {
  return (
    <div className="grid h-screen place-items-center bg-[var(--bg)] px-4 text-center text-[var(--muted)]">
      <div className="grid max-w-[360px] gap-3">
        <RepositorySelect className="w-full" repositories={snapshot.repositories} selectedRoot={snapshot.selectedRepositoryRoot} />
        <div>{snapshot.reason || 'No Git repository loaded.'}</div>
      </div>
    </div>
  )
}

if (root)
  render(<AppShell />, root)
