export interface ContextConflictChunk {
  type: 'context'
  content: string
}

export interface ChoiceConflictChunk {
  type: 'conflict'
  id: number
  oursLabel: string
  theirsLabel: string
  baseLabel?: string
  ours: string
  theirs: string
  base?: string
}

export type ConflictChunk = ContextConflictChunk | ChoiceConflictChunk

export function parseConflictMarkers(content: string): ConflictChunk[] {
  const lines = splitPreserveNewline(content)
  const chunks: ConflictChunk[] = []
  let context = ''
  let index = 0

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (!line.startsWith('<<<<<<<')) {
      context += line
      continue
    }

    if (context) {
      chunks.push({ type: 'context', content: context })
      context = ''
    }

    const oursLabel = readMarkerLabel(line, '<<<<<<<') || 'Current change'
    const oursLines: string[] = []
    const baseLines: string[] = []
    const theirsLines: string[] = []
    let baseLabel: string | undefined
    let mode: 'ours' | 'base' | 'theirs' = 'ours'
    let closed = false

    for (i += 1; i < lines.length; i += 1) {
      const marker = lines[i]

      if (marker.startsWith('|||||||')) {
        baseLabel = readMarkerLabel(marker, '|||||||') || 'Common ancestor'
        mode = 'base'
        continue
      }

      if (marker.startsWith('=======')) {
        mode = 'theirs'
        continue
      }

      if (marker.startsWith('>>>>>>>')) {
        chunks.push({
          type: 'conflict',
          id: index,
          oursLabel,
          theirsLabel: readMarkerLabel(marker, '>>>>>>>') || 'Incoming change',
          baseLabel,
          ours: oursLines.join(''),
          theirs: theirsLines.join(''),
          base: baseLines.length ? baseLines.join('') : undefined,
        })
        index += 1
        closed = true
        break
      }

      if (mode === 'ours')
        oursLines.push(marker)
      else if (mode === 'base')
        baseLines.push(marker)
      else
        theirsLines.push(marker)
    }

    if (!closed) {
      context += line
      context += oursLines.join('')
      if (baseLabel)
        context += `||||||| ${baseLabel}\n${baseLines.join('')}`
      context += '=======\n'
      context += theirsLines.join('')
    }
  }

  if (context)
    chunks.push({ type: 'context', content: context })

  return chunks
}

function splitPreserveNewline(content: string): string[] {
  if (!content)
    return []

  const lines = content.match(/.*(?:\r\n|\n|\r|$)/g) ?? []
  return lines.filter(line => line.length > 0)
}

function readMarkerLabel(line: string, marker: string): string {
  return line.slice(marker.length).trim()
}
