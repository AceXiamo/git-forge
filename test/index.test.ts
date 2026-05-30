import { describe, expect, it } from 'vitest'
import { parseConflictMarkers } from '../src/conflicts'

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
})
