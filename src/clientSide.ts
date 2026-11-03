import { posix } from 'node:path'
import { createSetupLayoutsCode } from './RouteLayout'

function normalizePath(path: string) {
  return posix.normalize(`${path.startsWith('/')
    ? ''
    : '/'}${path}`)
}

interface VirtualModuleCodeOptions {
  layoutDir: string
  defaultLayout: string
  importMode: 'sync' | 'async'
}

async function createVirtualGlob(
  target: string,
  isSync: boolean,
) {
  return `import.meta.glob("${target}/**/*.vue", { eager: ${isSync} })`
}

export async function createVirtualModuleCode(
  options: VirtualModuleCodeOptions,
) {
  const { layoutDir, defaultLayout, importMode } = options
  const normalizedTarget = normalizePath(layoutDir)
  const isSync = importMode === 'sync'

  const layoutInitCode = `  const layouts = {}
  const modules = ${await createVirtualGlob(normalizedTarget, isSync)}

  Object.entries(modules).forEach(([name, module]) => {
    const key = name.replace("${normalizedTarget}/", '').replace(/\\.vue$/, '')
    layouts[key] = ${isSync ? 'module.default' : 'module'}
  })
`

  return createSetupLayoutsCode(defaultLayout, layoutInitCode)
}
