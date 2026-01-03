import { promises as fsPromises, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mapCommentRegex = /^[ \t]*\/\/# sourceMappingURL=([^\r\n]+)/gm
const supportedExtRegex =
  /\.(?:d\.ts|ts|tsx|jsx|mjs|cjs|js)$/i

export default function removeMissingSourceMapPlugin() {
  return {
    name: 'remove-missing-source-map',
    enforce: 'pre',
    async load(id) {
      const trimmedId = id.split('?')[0].split('#')[0]
      const filePath = trimmedId.startsWith('file://')
        ? fileURLToPath(trimmedId)
        : trimmedId
      const normalized = filePath.replace(/\\/g, '/')
      if (!normalized.includes('/node_modules/')) return null
      if (!supportedExtRegex.test(filePath)) return null
      const code = await fsPromises.readFile(filePath, 'utf-8').catch(() => null)
      if (!code) return null
      let modifiedCode = code
      let changed = false
      for (const match of code.matchAll(mapCommentRegex)) {
        const target = match[1].trim()
        if (!target || target.startsWith('data:')) continue
        const mapPath = path.resolve(path.dirname(filePath), target)
        if (existsSync(mapPath)) continue
        modifiedCode = modifiedCode.replace(match[0], '')
        changed = true
      }
      if (!changed) return null
      this.addWatchFile?.(filePath)
      return modifiedCode
    },
  }
}
