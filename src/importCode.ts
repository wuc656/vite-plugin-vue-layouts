import type { FileContainer, ResolvedOptions } from './types'
import { join, parse } from 'node:path'

export function getImportCode(files: FileContainer[], options: ResolvedOptions) {
  const imports: string[] = []
  const head: string[] = []
  let id = 0

  for (const { path: dirPath, files: fileList } of files) {
    const prefix = dirPath.startsWith('/') ? dirPath : `/${dirPath}`
    for (const file of fileList) {
      const filePath = `${prefix}/${file}`
      const parsed = parse(file)
      const name = join(parsed.dir, parsed.name).replaceAll('\\', '/')
      
      if (options.importMode(name) === 'sync') {
        const variable = `__layout_${id++}`
        head.push(`import ${variable} from '${filePath}'`)
        imports.push(`'${name}': ${variable},`)
      }
      else {
        imports.push(`'${name}': () => import('${filePath}'),`)
      }
    }
  }

  const importsCode = `
${head.join('\n')}
export const layouts = {
${imports.join('\n')}
}`
  return importsCode
}
