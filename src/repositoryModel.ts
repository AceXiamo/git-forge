import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { GitService } from './git'

export type RepositorySource = 'filesystem' | 'vscode'

export interface RepositoryCandidate {
  root: string
  source: RepositorySource
}

export interface WorkspaceRoot {
  path: string
  name?: string
}

export interface RepositoryInfo {
  root: string
  name: string
  label: string
  description: string
  workspaceRoot: string
  workspaceIndex: number
  source: RepositorySource
}

export interface RepositorySelectionOptions {
  activeFile?: string
  persistedRoot?: string
}

const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.hg',
  '.svn',
  'build',
  'coverage',
  'dist',
  'lib-cov',
  'logs',
  'node_modules',
  'out',
  'target',
  'temp',
])

export function buildRepositoryList(candidates: RepositoryCandidate[], workspaceRoots: WorkspaceRoot[]): RepositoryInfo[] {
  const workspaces = workspaceRoots
    .map((workspaceRoot, index) => ({
      ...workspaceRoot,
      index,
      path: path.resolve(workspaceRoot.path),
    }))
    .filter(workspaceRoot => workspaceRoot.path)

  if (!workspaces.length)
    return []

  const repositoriesByRoot = new Map<string, RepositoryInfo>()

  for (const candidate of candidates) {
    const root = path.resolve(candidate.root)
    const workspaceRoot = containingWorkspace(root, workspaces)
    if (!workspaceRoot)
      continue

    const key = repositoryKey(root)
    const existing = repositoriesByRoot.get(key)
    if (existing) {
      if (existing.source !== 'vscode' && candidate.source === 'vscode')
        existing.source = 'vscode'
      continue
    }

    const relative = relativeDescription(workspaceRoot.path, root)
    repositoriesByRoot.set(key, {
      root,
      name: path.basename(root),
      label: path.basename(root),
      description: relative,
      workspaceRoot: workspaceRoot.path,
      workspaceIndex: workspaceRoot.index,
      source: candidate.source,
    })
  }

  const repositories = [...repositoriesByRoot.values()].sort((left, right) => {
    return left.workspaceIndex - right.workspaceIndex
      || compareRepositoryDescription(left.description, right.description)
      || left.root.localeCompare(right.root)
  })

  const nameCounts = repositories.reduce((counts, repository) => {
    const key = repository.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  return repositories.map((repository) => {
    if ((nameCounts.get(repository.name.toLowerCase()) ?? 0) <= 1)
      return repository

    const suffix = repository.description === '.'
      ? repository.workspaceRoot
      : repository.description
    return {
      ...repository,
      label: `${repository.name} (${suffix})`,
    }
  })
}

export function selectRepositoryRoot(repositories: RepositoryInfo[], options: RepositorySelectionOptions = {}): string | undefined {
  const persisted = options.persistedRoot
    ? repositories.find(repository => sameRepositoryRoot(repository.root, options.persistedRoot))
    : undefined
  if (persisted)
    return persisted.root

  const active = options.activeFile
    ? repositoryForFile(repositories, options.activeFile)
    : undefined
  if (active)
    return active.root

  return repositories[0]?.root
}

export function repositoryForFile(repositories: RepositoryInfo[], filePath: string): RepositoryInfo | undefined {
  const absoluteFilePath = path.resolve(filePath)
  return repositories
    .filter(repository => isSameOrDescendant(absoluteFilePath, repository.root))
    .sort((left, right) => right.root.length - left.root.length)[0]
}

export function sameRepositoryRoot(left: string, right: string | undefined): boolean {
  if (!right)
    return false
  return repositoryKey(left) === repositoryKey(right)
}

export function isSameOrDescendant(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath))
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

export async function discoverFilesystemRepositoryCandidates(workspacePaths: string[]): Promise<RepositoryCandidate[]> {
  const candidates: RepositoryCandidate[] = []

  for (const workspacePath of workspacePaths) {
    const workspaceRoot = path.resolve(workspacePath)
    if (await hasGitMetadata(workspaceRoot)) {
      const workspaceRepository = await GitService.fromWorkspace(workspaceRoot)
      if (workspaceRepository)
        candidates.push({ root: workspaceRoot, source: 'filesystem' })
    }
    else {
      const workspaceRepository = await GitService.fromWorkspace(workspaceRoot)
      if (workspaceRepository)
        candidates.push({ root: workspaceRepository.root, source: 'filesystem' })
    }

    const children = await fs.readdir(workspaceRoot, { withFileTypes: true }).catch(() => [])
    await Promise.all(children
      .filter(child => child.isDirectory() && !IGNORED_DIRECTORIES.has(child.name))
      .map(async (child) => {
        const childPath = path.join(workspaceRoot, child.name)
        if (!await hasGitMetadata(childPath))
          return

        const childRepository = await GitService.fromWorkspace(childPath)
        if (childRepository)
          candidates.push({ root: childPath, source: 'filesystem' })
      }))
  }

  return candidates
}

function containingWorkspace(root: string, workspaces: Array<WorkspaceRoot & { index: number }>): (WorkspaceRoot & { index: number }) | undefined {
  return workspaces
    .filter(workspaceRoot => isSameOrDescendant(root, workspaceRoot.path))
    .sort((left, right) => right.path.length - left.path.length)[0]
}

function relativeDescription(workspaceRoot: string, repositoryRoot: string): string {
  const relative = path.relative(workspaceRoot, repositoryRoot)
  return relative || '.'
}

function compareRepositoryDescription(left: string, right: string): number {
  if (left === right)
    return 0
  if (left === '.')
    return -1
  if (right === '.')
    return 1
  return left.localeCompare(right)
}

function repositoryKey(root: string): string {
  const resolved = path.resolve(root)
  return process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved
}

async function hasGitMetadata(directory: string): Promise<boolean> {
  try {
    await fs.lstat(path.join(directory, '.git'))
    return true
  }
  catch {
    return false
  }
}
