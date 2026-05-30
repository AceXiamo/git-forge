import altArrowDownIcon from '@iconify/icons-solar/alt-arrow-down-line-duotone'
import altArrowRightIcon from '@iconify/icons-solar/alt-arrow-right-line-duotone'
import disketteIcon from '@iconify/icons-solar/diskette-line-duotone'
import documentIcon from '@iconify/icons-solar/document-text-line-duotone'
import folderIcon from '@iconify/icons-solar/folder-line-duotone'
import folderOpenIcon from '@iconify/icons-solar/folder-open-line-duotone'
import refreshIcon from '@iconify/icons-solar/refresh-circle-line-duotone'
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
type ConflictChoice = 'both' | 'none' | 'ours' | 'theirs'

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
  operation: GitOperation
  conflicts: ConflictFile[]
  selectedPath?: string
  detail?: ConflictDetail
}

interface EmptySnapshot {
  state: 'empty'
  reason: string
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

const vscode = acquireVsCodeApi()

const solarIcons = {
  chevronDown: altArrowDownIcon,
  chevronRight: altArrowRightIcon,
  danger: dangerIcon,
  file: documentIcon,
  folder: folderIcon,
  folderOpen: folderOpenIcon,
  refresh: refreshIcon,
  save: disketteIcon,
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

function App() {
  const [snapshot, setSnapshot] = useState<ConflictSnapshot>({ state: 'empty', reason: 'Loading conflicts...' })

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
      <main className="grid h-screen place-items-center bg-[var(--bg)] text-[var(--muted)]">
        <div className="text-center">
          <div className="mb-2 text-[15px] font-semibold text-[var(--fg)]">Git Forge Conflicts</div>
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
    <main className="grid h-screen grid-cols-[280px_minmax(0,1fr)] bg-[var(--bg)] text-[var(--fg)]">
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_88%,#17141f)]">
        <header className="border-b border-[var(--border)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="danger" className="text-[15px] text-[var(--danger)]" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{snapshot.repoName}</span>
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

      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_74%,#17141f)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{snapshot.detail?.filePath ?? 'Select a conflict'}</span>
            <button className="danger-button" onClick={() => vscode.postMessage({ type: 'abortOperation' })}>Abort</button>
          </div>
          {snapshot.operation.note && (
            <div className="mt-1 text-[11px] text-[var(--muted)]">{snapshot.operation.note}</div>
          )}
        </header>
        <ConflictDetailView detail={snapshot.detail} />
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

function ConflictDetailView({ detail }: { detail?: ConflictDetail }) {
  const [result, setResult] = useState('')
  const [choices, setChoices] = useState<Record<number, ConflictChoice>>({})

  useEffect(() => {
    setResult(detail?.current ?? '')
    setChoices({})
  }, [detail?.filePath, detail?.current])

  if (!detail) {
    return <div className="grid place-items-center text-[var(--muted)]">Select a conflicted file.</div>
  }

  if (!detail.canResolveInline) {
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

  const conflictChunks = detail.chunks.filter((chunk): chunk is ChoiceConflictChunk => chunk.type === 'conflict')

  const applyChoice = (chunk: ChoiceConflictChunk, choice: ConflictChoice) => {
    const nextChoices = {
      ...choices,
      [chunk.id]: choice,
    }
    setChoices(nextChoices)
    setResult(resolveChunks(detail.chunks, nextChoices))
  }

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[12px]">
        <span className="mr-auto text-[var(--muted)]">
          {`${conflictChunks.length} conflict blocks`}
        </span>
        <button className="soft-button" onClick={() => setResult(detail.ours)}>Use all ours</button>
        <button className="soft-button" onClick={() => setResult(detail.theirs)}>Use all theirs</button>
        <button className="primary-button" onClick={() => vscode.postMessage({ type: 'saveResolution', path: detail.filePath, content: result })}>
          <Icon name="save" />
          Save resolution
        </button>
      </div>

      <SyncedMergeEditor
        chunks={detail.chunks}
        result={result}
        onAccept={applyChoice}
        onResultChange={setResult}
      />
    </div>
  )
}

function SyncedMergeEditor({
  chunks,
  onAccept,
  onResultChange,
  result,
}: {
  chunks: ConflictChunk[]
  result: string
  onAccept: (chunk: ChoiceConflictChunk, choice: ConflictChoice) => void
  onResultChange: (value: string) => void
}) {
  const oursRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLTextAreaElement>(null)
  const theirsRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)

  function syncScroll(source: HTMLElement): void {
    if (syncingRef.current)
      return

    const maxScroll = source.scrollHeight - source.clientHeight
    const ratio = maxScroll > 0 ? source.scrollTop / maxScroll : 0
    syncingRef.current = true
    ;[oursRef.current, resultRef.current, theirsRef.current].forEach((target) => {
      if (!target || target === source)
        return

      const targetMaxScroll = target.scrollHeight - target.clientHeight
      target.scrollTop = targetMaxScroll > 0 ? targetMaxScroll * ratio : 0
    })
    requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }

  return (
    <div className="grid min-h-0 grid-cols-3 gap-px overflow-hidden bg-[var(--border)]">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--bg)]">
        <div className="border-b border-[var(--border)] px-3 py-2 text-[12px] font-semibold">Ours</div>
        <div
          ref={oursRef}
          className="merge-scroll min-h-0 overflow-auto"
          onScroll={event => syncScroll(event.currentTarget)}
        >
          <ChunkPane chunks={chunks} side="ours" onAccept={onAccept} />
        </div>
      </section>

      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--bg)]">
        <div className="border-b border-[var(--border)] px-3 py-2 text-[12px] font-semibold">Result</div>
        <textarea
          ref={resultRef}
          className="merge-scroll min-h-0 resize-none bg-[color-mix(in_srgb,var(--bg)_96%,#17141f)] p-3 [font-family:var(--vscode-editor-font-family)] text-[12px] leading-5 text-[var(--fg)] outline-none"
          spellcheck={false}
          value={result}
          onInput={event => onResultChange(event.currentTarget.value)}
          onScroll={event => syncScroll(event.currentTarget)}
        />
      </section>

      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--bg)]">
        <div className="border-b border-[var(--border)] px-3 py-2 text-[12px] font-semibold">Theirs</div>
        <div
          ref={theirsRef}
          className="merge-scroll min-h-0 overflow-auto"
          onScroll={event => syncScroll(event.currentTarget)}
        >
          <ChunkPane chunks={chunks} side="theirs" onAccept={onAccept} />
        </div>
      </section>
    </div>
  )
}

function ChunkPane({
  chunks,
  onAccept,
  side,
}: {
  chunks: ConflictChunk[]
  side: 'ours' | 'theirs'
  onAccept: (chunk: ChoiceConflictChunk, choice: ConflictChoice) => void
}) {
  return (
    <div className="min-w-max p-3 [font-family:var(--vscode-editor-font-family)] text-[12px] leading-5">
      {chunks.map((chunk, index) => {
        if (chunk.type === 'context') {
          return (
            <pre key={`context-${index}`} className="merge-code-block text-[color-mix(in_srgb,var(--fg)_72%,transparent)]">
              {chunk.content || '\n'}
            </pre>
          )
        }

        const value = side === 'ours' ? chunk.ours : chunk.theirs
        return (
          <section key={chunk.id} className={cn('merge-conflict-block', side === 'ours' ? 'from-left' : 'from-right')}>
            <div className={cn('merge-gutter-actions', side === 'ours' ? 'right-edge' : 'left-edge')}>
              {side === 'ours'
                ? (
                    <>
                      <button type="button" title="Ignore this block" onClick={() => onAccept(chunk, 'none')}>×</button>
                      <button type="button" title="Apply ours to result" onClick={() => onAccept(chunk, 'ours')}>»</button>
                    </>
                  )
                : (
                    <>
                      <button type="button" title="Apply theirs to result" onClick={() => onAccept(chunk, 'theirs')}>«</button>
                      <button type="button" title="Ignore this block" onClick={() => onAccept(chunk, 'none')}>×</button>
                    </>
                  )}
            </div>
            <pre className="merge-code-block text-[var(--fg)]">{value || '\n'}</pre>
          </section>
        )
      })}
    </div>
  )
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

function resolveChunks(chunks: ConflictChunk[], choices: Record<number, ConflictChoice>): string {
  return chunks.map((chunk) => {
    if (chunk.type === 'context')
      return chunk.content
    if (choices[chunk.id] === 'ours')
      return chunk.ours
    if (choices[chunk.id] === 'theirs')
      return chunk.theirs
    if (choices[chunk.id] === 'both')
      return `${chunk.ours}${chunk.theirs}`
    if (choices[chunk.id] === 'none')
      return ''
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

render(<App />, document.querySelector('#app')!)
