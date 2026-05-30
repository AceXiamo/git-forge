import type { ConflictChunk } from './conflicts'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseConflictMarkers } from './conflicts'

const FIELD = '\u001F'
const RECORD = '\u001E'
const MAX_BUFFER = 24 * 1024 * 1024

export interface GitSnapshot {
  state: 'ready'
  root: string
  repoName: string
  branch: BranchStatus
  operation: GitOperation
  changes: GitChange[]
  conflicts: GitChange[]
  commits: GitCommit[]
  branches: GitBranch[]
  stashes: GitStash[]
  counts: GitCounts
  generatedAt: string
}

export interface EmptySnapshot {
  state: 'empty'
  reason: string
}

export type WorkbenchSnapshot = GitSnapshot | EmptySnapshot

export interface BranchStatus {
  current: string
  upstream?: string
  ahead: number
  behind: number
  detached: boolean
}

export interface GitCounts {
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
}

export interface GitChange {
  path: string
  originalPath?: string
  index: string
  worktree: string
  kind: 'added' | 'copied' | 'conflict' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  staged: boolean
  conflicted: boolean
  summary: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  parents: string[]
  decorations: string[]
  author: string
  authorEmail: string
  relativeDate: string
  authorDate: string
  subject: string
  filesChanged: number
  additions: number
  deletions: number
  files: GitCommitFileStat[]
}

export interface GitCommitFileStat {
  path: string
  additions: number
  deletions: number
  status: string
}

export interface GitCommitFile {
  path: string
  originalPath?: string
  status: string
}

export interface GitBranch {
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

export interface GitStash {
  name: string
  relativeDate: string
  message: string
}

export interface GitCommitInfo {
  hash: string
  shortHash: string
  author: string
  relativeDate: string
  subject: string
}

export interface GitOperation {
  kind: 'none' | 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  label: string
  ours?: GitCommitInfo
  theirs?: GitCommitInfo
  note?: string
}

export interface ConflictDetail {
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

export class GitService {
  private constructor(readonly root: string) {}

  static async fromWorkspace(workspacePath: string): Promise<GitService | undefined> {
    try {
      const root = (await runGit(['rev-parse', '--show-toplevel'], workspacePath)).trim()
      return new GitService(root)
    }
    catch {
      return undefined
    }
  }

  async snapshot(maxCommits: number): Promise<GitSnapshot> {
    const [statusRaw, commits, branches, stashes, operation] = await Promise.all([
      this.run(['status', '--porcelain=v1', '-b']),
      this.commits(maxCommits),
      this.branches(),
      this.stashes(),
      this.operation(),
    ])
    const status = parseStatus(statusRaw)

    return {
      state: 'ready',
      root: this.root,
      repoName: path.basename(this.root),
      branch: status.branch,
      operation,
      changes: status.changes,
      conflicts: status.conflicts,
      commits,
      branches,
      stashes,
      counts: status.counts,
      generatedAt: new Date().toISOString(),
    }
  }

  async status(): Promise<Pick<GitSnapshot, 'branch' | 'changes' | 'conflicts' | 'counts'>> {
    return parseStatus(await this.run(['status', '--porcelain=v1', '-b']))
  }

  async currentOperation(): Promise<GitOperation> {
    return this.operation()
  }

  async conflictDetail(filePath: string): Promise<ConflictDetail> {
    const absolutePath = this.resolvePath(filePath)
    const [status, base, ours, theirs, currentBuffer, operation] = await Promise.all([
      this.status(),
      this.showStage(filePath, 1),
      this.showStage(filePath, 2),
      this.showStage(filePath, 3),
      fs.readFile(absolutePath).catch(() => Buffer.alloc(0)),
      this.operation(),
    ])
    const change = status.changes.find(change => change.path === filePath)
    const binary = isBinaryBuffer(currentBuffer)
    const current = binary ? '' : currentBuffer.toString('utf8')
    const chunks = binary ? [] : parseConflictMarkers(current)
    const resolved = !change?.conflicted

    return {
      filePath,
      status: change?.summary ?? 'Resolved',
      base,
      ours,
      theirs,
      current,
      chunks,
      operation,
      binary,
      canResolveInline: !binary && chunks.some(chunk => chunk.type === 'conflict'),
      resolved,
    }
  }

  async saveResolution(filePath: string, content: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath)
    await fs.writeFile(absolutePath, content, 'utf8')
    await this.run(['add', '--', filePath])
  }

  async acceptConflictSide(filePath: string, side: 'ours' | 'theirs'): Promise<void> {
    this.resolvePath(filePath)
    const stage = side === 'ours' ? 2 : 3
    const content = await this.showStage(filePath, stage)
    if (content) {
      await this.saveResolution(filePath, content)
      return
    }

    await this.run(['checkout', side === 'ours' ? '--ours' : '--theirs', '--', filePath])
    await this.run(['add', '--', filePath])
  }

  async commit(message: string): Promise<void> {
    const normalized = message.trim()
    if (!normalized)
      throw new Error('Write a commit message first.')
    await this.run(['commit', '-m', normalized])
  }

  async fetch(): Promise<void> {
    await this.run(['fetch', '--all', '--prune'])
  }

  async pull(): Promise<void> {
    await this.run(['pull', '--ff-only'])
  }

  async syncMerge(): Promise<void> {
    await this.fetch()
    const status = await this.status()
    if (!status.branch.upstream)
      throw new Error(`Current branch ${status.branch.current} has no upstream branch.`)

    await this.run(['merge', '--no-edit', status.branch.upstream])
  }

  async push(): Promise<void> {
    await this.run(['push'])
  }

  async abortOperation(): Promise<void> {
    const operation = await this.operation()
    if (operation.kind === 'merge') {
      await this.run(['merge', '--abort'])
      return
    }
    if (operation.kind === 'rebase') {
      await this.run(['rebase', '--abort'])
      return
    }
    if (operation.kind === 'cherry-pick') {
      await this.run(['cherry-pick', '--abort'])
      return
    }
    if (operation.kind === 'revert') {
      await this.run(['revert', '--abort'])
      return
    }

    throw new Error('No merge, rebase, cherry-pick, or revert operation is in progress.')
  }

  async stage(filePath: string): Promise<void> {
    this.resolvePath(filePath)
    await this.run(['add', '--', filePath])
  }

  async stageAll(): Promise<void> {
    await this.run(['add', '-A'])
  }

  async unstage(filePath: string): Promise<void> {
    this.resolvePath(filePath)
    try {
      await this.run(['restore', '--staged', '--', filePath])
    }
    catch {
      await this.run(['reset', 'HEAD', '--', filePath])
    }
  }

  async unstageAll(): Promise<void> {
    try {
      await this.run(['restore', '--staged', ':/'])
    }
    catch {
      await this.run(['reset', 'HEAD', '--'])
    }
  }

  async commitFiles(hash: string): Promise<GitCommitFile[]> {
    const raw = await this.run(['show', '--name-status', '--format=', '--find-renames', hash]).catch(() => '')
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [status = 'M', first = '', second] = line.split(/\t/)
        return {
          path: second || first,
          originalPath: second ? first : undefined,
          status,
        }
      })
      .filter(file => file.path)
  }

  async run(args: string[]): Promise<string> {
    return runGit(args, this.root)
  }

  private async commits(maxCommits: number): Promise<GitCommit[]> {
    const format = `${RECORD}%H${FIELD}%h${FIELD}%P${FIELD}%D${FIELD}%an${FIELD}%ae${FIELD}%ar${FIELD}%aI${FIELD}%s`
    const raw = await this.run([
      'log',
      '--all',
      '--date-order',
      `--max-count=${maxCommits}`,
      `--pretty=format:${format}`,
      '--raw',
      '--numstat',
    ]).catch(() => '')

    return raw
      .split(RECORD)
      .filter(Boolean)
      .map((block) => {
        const [header = '', ...statLines] = block.trimStart().split(/\r?\n/)
        const [hash = '', shortHash = '', parents = '', decorations = '', author = '', authorEmail = '', relativeDate = '', authorDate = '', subject = ''] = header.split(FIELD)
        const stats = parseNumstat(statLines)
        return {
          hash,
          shortHash,
          parents: parents ? parents.split(' ') : [],
          decorations: parseDecorations(decorations),
          author,
          authorEmail,
          relativeDate,
          authorDate,
          subject,
          ...stats,
        }
      })
  }

  private async branches(): Promise<GitBranch[]> {
    const raw = await this.run([
      'for-each-ref',
      '--sort=-committerdate',
      `--format=%(refname:short)${FIELD}%(refname)${FIELD}%(objectname:short)${FIELD}%(committerdate:relative)${FIELD}%(upstream:short)${FIELD}%(HEAD)`,
      'refs/heads',
      'refs/remotes',
    ]).catch(() => '')

    const branches = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name = '', ref = '', shortHash = '', relativeDate = '', upstream = '', head = ''] = line.split(FIELD)
        return {
          name,
          ref,
          shortHash,
          relativeDate,
          upstream: upstream || undefined,
          current: head === '*',
          remote: ref.startsWith('refs/remotes/'),
        }
      })
      .filter(branch => branch.name && !branch.name.endsWith('/HEAD'))
      .slice(0, 90)

    return Promise.all(branches.map(async branch => ({
      ...branch,
      ...(branch.upstream ? await this.aheadBehind(branch.name, branch.upstream) : {}),
    })))
  }

  private async stashes(): Promise<GitStash[]> {
    const raw = await this.run(['stash', 'list', `--format=%gd${FIELD}%cr${FIELD}%s`]).catch(() => '')
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name = '', relativeDate = '', message = ''] = line.split(FIELD)
        return { name, relativeDate, message }
      })
  }

  private async operation(): Promise<GitOperation> {
    const gitDir = await this.gitDir().catch(() => undefined)
    if (!gitDir)
      return { kind: 'none', label: 'Clean operation state' }

    const mergeHead = await readOptional(path.join(gitDir, 'MERGE_HEAD'))
    if (mergeHead) {
      return {
        kind: 'merge',
        label: 'Merge in progress',
        ours: await this.commitInfo('HEAD'),
        theirs: await this.commitInfo(mergeHead.trim()),
      }
    }

    const cherryPickHead = await readOptional(path.join(gitDir, 'CHERRY_PICK_HEAD'))
    if (cherryPickHead) {
      return {
        kind: 'cherry-pick',
        label: 'Cherry-pick in progress',
        ours: await this.commitInfo('HEAD'),
        theirs: await this.commitInfo(cherryPickHead.trim()),
      }
    }

    const revertHead = await readOptional(path.join(gitDir, 'REVERT_HEAD'))
    if (revertHead) {
      return {
        kind: 'revert',
        label: 'Revert in progress',
        ours: await this.commitInfo('HEAD'),
        theirs: await this.commitInfo(revertHead.trim()),
      }
    }

    if (await exists(path.join(gitDir, 'rebase-merge')) || await exists(path.join(gitDir, 'rebase-apply'))) {
      const rebaseHead = await this.commitInfo('REBASE_HEAD').catch(() => undefined)
      return {
        kind: 'rebase',
        label: 'Rebase in progress',
        ours: await this.commitInfo('HEAD').catch(() => undefined),
        theirs: rebaseHead,
        note: 'During rebase, Git can label ours/theirs from the temporary rebase state. Inspect both sides before applying a bulk choice.',
      }
    }

    return { kind: 'none', label: 'Clean operation state' }
  }

  private async commitInfo(ref: string): Promise<GitCommitInfo> {
    const format = `%H${FIELD}%h${FIELD}%an${FIELD}%ar${FIELD}%s`
    const raw = await this.run(['log', '-1', `--pretty=format:${format}`, ref])
    const [hash = '', shortHash = '', author = '', relativeDate = '', subject = ''] = raw.split(FIELD)
    return { hash, shortHash, author, relativeDate, subject }
  }

  private async aheadBehind(left: string, right: string): Promise<Pick<GitBranch, 'ahead' | 'behind'>> {
    const raw = await this.run(['rev-list', '--left-right', '--count', `${left}...${right}`]).catch(() => '')
    const [ahead, behind] = raw.trim().split(/\s+/).map(value => Number.parseInt(value, 10))
    return {
      ahead: Number.isFinite(ahead) ? ahead : 0,
      behind: Number.isFinite(behind) ? behind : 0,
    }
  }

  private async showStage(filePath: string, stage: 1 | 2 | 3): Promise<string> {
    return this.run(['show', `:${stage}:${filePath}`]).catch(() => '')
  }

  private async gitDir(): Promise<string> {
    const raw = (await this.run(['rev-parse', '--git-dir'])).trim()
    return path.isAbsolute(raw) ? raw : path.join(this.root, raw)
  }

  private resolvePath(filePath: string): string {
    const absolutePath = path.resolve(this.root, filePath)
    const allowed = absolutePath === this.root || absolutePath.startsWith(`${this.root}${path.sep}`)
    if (!allowed)
      throw new Error(`Path escapes repository root: ${filePath}`)
    return absolutePath
  }
}

function parseStatus(raw: string): Pick<GitSnapshot, 'branch' | 'changes' | 'conflicts' | 'counts'> {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const branch = parseBranchLine(lines.shift() ?? '## HEAD')
  const changes = lines.map(parseChange)
  const conflicts = changes.filter(change => change.conflicted)

  return {
    branch,
    changes,
    conflicts,
    counts: {
      staged: changes.filter(change => change.staged && !change.conflicted).length,
      unstaged: changes.filter(change => change.worktree !== ' ' && change.kind !== 'untracked' && !change.conflicted).length,
      untracked: changes.filter(change => change.kind === 'untracked').length,
      conflicted: conflicts.length,
    },
  }
}

export const __testing = {
  parseStatus,
}

function parseBranchLine(line: string): BranchStatus {
  const value = line.replace(/^## /, '')
  const ahead = Number.parseInt(value.match(/ahead (\d+)/)?.[1] ?? '0', 10)
  const behind = Number.parseInt(value.match(/behind (\d+)/)?.[1] ?? '0', 10)
  const withoutTracking = value.replace(/\s+\[.+\]$/, '')
  const [current = 'HEAD', upstream] = withoutTracking.split('...')

  return {
    current,
    upstream,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
    detached: current.startsWith('HEAD'),
  }
}

function parseChange(line: string): GitChange {
  const index = line[0] ?? ' '
  const worktree = line[1] ?? ' '
  const status = `${index}${worktree}`
  let filePath = line.slice(3)
  let originalPath: string | undefined

  if ((index === 'R' || index === 'C') && filePath.includes(' -> ')) {
    const [from = '', to = filePath] = filePath.split(' -> ')
    originalPath = from
    filePath = to
  }

  const conflicted = isConflictStatus(status)
  const kind = toChangeKind(index, worktree, conflicted)

  return {
    path: filePath,
    originalPath,
    index,
    worktree,
    kind,
    staged: index !== ' ' && index !== '?' && !conflicted,
    conflicted,
    summary: describeStatus(index, worktree, conflicted),
  }
}

function toChangeKind(index: string, worktree: string, conflicted: boolean): GitChange['kind'] {
  if (conflicted)
    return 'conflict'
  if (index === '?' && worktree === '?')
    return 'untracked'
  if (index === 'R' || worktree === 'R')
    return 'renamed'
  if (index === 'C' || worktree === 'C')
    return 'copied'
  if (index === 'A' || worktree === 'A')
    return 'added'
  if (index === 'D' || worktree === 'D')
    return 'deleted'
  return 'modified'
}

function describeStatus(index: string, worktree: string, conflicted: boolean): string {
  if (conflicted)
    return 'Conflict'
  if (index === '?' && worktree === '?')
    return 'Untracked'
  const staged = describeStatusCode(index)
  const unstaged = describeStatusCode(worktree)
  if (staged && unstaged)
    return `${staged} staged, ${unstaged.toLowerCase()} unstaged`
  return staged ? `${staged} staged` : unstaged || 'Modified'
}

function describeStatusCode(code: string): string {
  if (code === 'M')
    return 'Modified'
  if (code === 'A')
    return 'Added'
  if (code === 'D')
    return 'Deleted'
  if (code === 'R')
    return 'Renamed'
  if (code === 'C')
    return 'Copied'
  return ''
}

function isConflictStatus(status: string): boolean {
  return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(status)
}

function parseDecorations(value: string): string[] {
  return value
    .split(', ')
    .map(item => item
      .replace(/^HEAD -> /, '')
      .replace(/^tag: /, '')
      .replace(/^refs\/heads\//, '')
      .replace(/^refs\/remotes\//, '')
      .trim())
    .filter(Boolean)
    .slice(0, 5)
}

function parseNumstat(lines: string[]): Pick<GitCommit, 'filesChanged' | 'additions' | 'deletions' | 'files'> {
  const statusByPath = parseRawStatuses(lines)

  return lines.reduce((stats, line) => {
    if (line.startsWith(':'))
      return stats

    const [additions = '', deletions = '', ...pathParts] = line.split('\t')
    const filePath = pathParts.join('\t')
    if (!filePath)
      return stats

    const parsedAdditions = parseStatNumber(additions)
    const parsedDeletions = parseStatNumber(deletions)
    stats.filesChanged += 1
    stats.additions += parsedAdditions
    stats.deletions += parsedDeletions
    stats.files.push({
      path: filePath,
      additions: parsedAdditions,
      deletions: parsedDeletions,
      status: statusByPath.get(filePath) ?? 'M',
    })
    return stats
  }, {
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    files: [] as GitCommitFileStat[],
  })
}

function parseRawStatuses(lines: string[]): Map<string, string> {
  const statuses = new Map<string, string>()

  lines.forEach((line) => {
    if (!line.startsWith(':'))
      return

    const [metadata = '', ...pathParts] = line.split('\t')
    const status = metadata.trim().split(/\s+/).at(-1) || 'M'
    const filePath = pathParts.at(-1) || ''
    if (filePath)
      statuses.set(filePath, status)
  })

  return statuses
}

function parseStatNumber(value: string): number {
  if (value === '-')
    return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function isBinaryBuffer(buffer: Buffer): boolean {
  if (!buffer.length)
    return false

  return buffer.includes(0)
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    }, (error, stdout, stderr) => {
      if (error) {
        const message = typeof stderr === 'string' && stderr.trim()
          ? stderr.trim()
          : error.message
        reject(new Error(message))
        return
      }
      resolve(stdout)
    })
  })
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8')
  }
  catch {
    return undefined
  }
}
