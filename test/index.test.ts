import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseConflictMarkers, resolveConflictChunks } from '../src/conflicts'
import { __testing as gitTesting } from '../src/git'
import {
  buildRepositoryList,
  discoverFilesystemRepositoryCandidates,
  selectRepositoryRoot,
} from '../src/repositoryModel'

const execFileAsync = promisify(execFile)

describe('conflict parser', () => {
  it('splits conflict markers into context and choices', () => {
    const chunks = parseConflictMarkers([
      'before\n',
      '<<<<<<< HEAD\n',
      'ours\n',
      '=======\n',
      'theirs\n',
      '>>>>>>> feature\n',
      'after\n',
    ].join(''))

    expect(chunks).toHaveLength(3)
    expect(chunks[1]).toMatchObject({
      type: 'conflict',
      oursLabel: 'HEAD',
      theirsLabel: 'feature',
      ours: 'ours\n',
      theirs: 'theirs\n',
    })
  })

  it('keeps diff3 base sections when present', () => {
    const chunks = parseConflictMarkers([
      '<<<<<<< ours\n',
      'left\n',
      '||||||| base\n',
      'middle\n',
      '=======\n',
      'right\n',
      '>>>>>>> theirs\n',
    ].join(''))

    expect(chunks[0]).toMatchObject({
      type: 'conflict',
      baseLabel: 'base',
      base: 'middle\n',
    })
  })

  it('parses multiple conflict chunks', () => {
    const chunks = parseConflictMarkers([
      '<<<<<<< HEAD\n',
      'one\n',
      '=======\n',
      'two\n',
      '>>>>>>> feature\n',
      'middle\n',
      '<<<<<<< HEAD\n',
      'three\n',
      '=======\n',
      'four\n',
      '>>>>>>> feature\n',
    ].join(''))

    expect(chunks.filter(chunk => chunk.type === 'conflict')).toHaveLength(2)
  })

  it('keeps malformed conflict markers as context', () => {
    const chunks = parseConflictMarkers('before\n<<<<<<< HEAD\nours\n')
    expect(chunks.filter(chunk => chunk.type === 'context').map(chunk => chunk.content).join('')).toBe('before\n<<<<<<< HEAD\nours\n=======\n')
  })

  it('resolves chunks from selected sides', () => {
    const chunks = parseConflictMarkers([
      'before\n',
      '<<<<<<< HEAD\n',
      'ours\n',
      '=======\n',
      'theirs\n',
      '>>>>>>> feature\n',
      'after\n',
    ].join(''))

    expect(resolveConflictChunks(chunks, { 0: 'ours' })).toBe('before\nours\nafter\n')
    expect(resolveConflictChunks(chunks, { 0: 'theirs' })).toBe('before\ntheirs\nafter\n')
    expect(resolveConflictChunks(chunks, { 0: 'both' })).toBe('before\nours\ntheirs\nafter\n')
  })

  it('keeps a line break between both sides when ours has no trailing newline', () => {
    const chunks = parseConflictMarkers('<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n')
    const conflict = chunks.find(chunk => chunk.type === 'conflict')
    // Emulate an end-of-file conflict where the ours side has no trailing newline.
    if (conflict?.type === 'conflict')
      conflict.ours = 'ours'

    expect(resolveConflictChunks(chunks, { 0: 'both' })).toBe('ours\ntheirs\n')
  })
})

describe('git status parser', () => {
  it('marks all porcelain conflict statuses as conflicts', () => {
    const raw = [
      '## main...origin/main [ahead 1, behind 2]',
      'DD deleted-both.ts',
      'AU added-by-us.ts',
      'UD deleted-by-them.ts',
      'UA added-by-them.ts',
      'DU deleted-by-us.ts',
      'AA added-both.ts',
      'UU modified-both.ts',
    ].join('\n')

    const status = gitTesting.parseStatus(raw)
    expect(status.branch).toMatchObject({ current: 'main', upstream: 'origin/main', ahead: 1, behind: 2 })
    expect(status.conflicts.map(conflict => conflict.index + conflict.worktree)).toEqual([
      'DD',
      'AU',
      'UD',
      'UA',
      'DU',
      'AA',
      'UU',
    ])
    expect(status.counts.conflicted).toBe(7)
  })
})

describe('repository discovery and selection', () => {
  it('dedupes VS Code repositories and filters them to workspace folders', () => {
    const workspaceRoot = path.join(os.tmpdir(), 'git-forge-workspace')
    const frontendRoot = path.join(workspaceRoot, 'frontend')
    const backendRoot = path.join(workspaceRoot, 'backend')
    const outsideRoot = path.join(os.tmpdir(), 'outside-repo')

    const repositories = buildRepositoryList([
      { root: frontendRoot, source: 'vscode' },
      { root: frontendRoot, source: 'filesystem' },
      { root: outsideRoot, source: 'vscode' },
      { root: backendRoot, source: 'vscode' },
    ], [{ path: workspaceRoot }])

    expect(repositories.map(repository => repository.root)).toEqual([backendRoot, frontendRoot])
    expect(repositories.map(repository => repository.source)).toEqual(['vscode', 'vscode'])
  })

  it('finds direct child repositories when the workspace root is not a repository', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'git-forge-'))

    try {
      const frontendRoot = path.join(workspaceRoot, 'frontend')
      const backendRoot = path.join(workspaceRoot, 'backend')
      const docsRoot = path.join(workspaceRoot, 'docs')
      await Promise.all([
        fs.mkdir(frontendRoot),
        fs.mkdir(backendRoot),
        fs.mkdir(docsRoot),
      ])
      await Promise.all([
        execFileAsync('git', ['init'], { cwd: frontendRoot }),
        execFileAsync('git', ['init'], { cwd: backendRoot }),
      ])

      const candidates = await discoverFilesystemRepositoryCandidates([workspaceRoot])
      const repositories = buildRepositoryList(candidates, [{ path: workspaceRoot }])

      expect(repositories.map(repository => repository.root)).toEqual([backendRoot, frontendRoot])
    }
    finally {
      await fs.rm(workspaceRoot, { force: true, recursive: true })
    }
  })

  it('keeps a persisted repository selection ahead of the active file', () => {
    const workspaceRoot = path.join(os.tmpdir(), 'git-forge-workspace')
    const frontendRoot = path.join(workspaceRoot, 'frontend')
    const backendRoot = path.join(workspaceRoot, 'backend')
    const repositories = buildRepositoryList([
      { root: frontendRoot, source: 'vscode' },
      { root: backendRoot, source: 'vscode' },
    ], [{ path: workspaceRoot }])

    expect(selectRepositoryRoot(repositories, {
      activeFile: path.join(backendRoot, 'src', 'main.ts'),
      persistedRoot: frontendRoot,
    })).toBe(frontendRoot)
  })

  it('falls back to the active file repository only when there is no persisted selection', () => {
    const workspaceRoot = path.join(os.tmpdir(), 'git-forge-workspace')
    const frontendRoot = path.join(workspaceRoot, 'frontend')
    const backendRoot = path.join(workspaceRoot, 'backend')
    const repositories = buildRepositoryList([
      { root: frontendRoot, source: 'vscode' },
      { root: backendRoot, source: 'vscode' },
    ], [{ path: workspaceRoot }])

    expect(selectRepositoryRoot(repositories, {
      activeFile: path.join(frontendRoot, 'src', 'App.tsx'),
      persistedRoot: path.join(workspaceRoot, 'missing'),
    })).toBe(frontendRoot)
  })
})
