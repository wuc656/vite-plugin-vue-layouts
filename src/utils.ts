import { resolve } from 'node:path'
import Debug from 'debug'
import fg from 'fast-glob'

export function extensionsToGlob(extensions: string[]) {
  return extensions.length > 1 ? `{${extensions.join(',')}}` : extensions[0] || ''
}

export function normalizePath(str: string): string {
  return str.replaceAll('\\', '/')
}

export const debug = Debug('vite-plugin-layouts')

export function pathToName(filepath: string) {
  return filepath.replaceAll(/[_.\-\\/]/g, '_').replaceAll(/[[:\]()]/g, '$')
}

export function resolveDirs(dirs: string | string[] | null, root: string) {
  if (dirs === null)
    return []
  
  const dirsArray = Array.isArray(dirs) ? dirs : [dirs]
  const dirsResolved: string[] = []

  for (const dir of dirsArray) {
    if (dir.includes('**')) {
      fg.sync(dir, { onlyDirectories: true }).forEach(match => {
        dirsResolved.push(normalizePath(resolve(root, match)))
      })
    }
    else {
      dirsResolved.push(normalizePath(resolve(root, dir)))
    }
  }

  return dirsResolved
}
