import { describe, expect, it } from 'vitest'
import { parseConflictMarkers, resolveConflictChunks } from '../src/conflicts'
import { __testing as gitTesting } from '../src/git'

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
