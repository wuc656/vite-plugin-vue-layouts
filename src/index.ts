import type { ModuleNode, Plugin, ResolvedConfig } from 'vite'
import type {
  clientSideOptions,
  FileContainer,
  ResolvedOptions,
  UserOptions,
} from './types'
import { resolve } from 'node:path'
import process from 'node:process'
import { createVirtualModuleCode } from './clientSide'
import { getFilesFromPath } from './files'
import { getImportCode } from './importCode'
import getClientCode from './RouteLayout'

import { debug, normalizePath, resolveDirs } from './utils'

const MODULE_IDS = ['layouts-generated', 'virtual:generated-layouts']
const MODULE_ID_VIRTUAL = '/@vite-plugin-vue-layouts/generated-layouts'

export function defaultImportMode(name: string) {
  if (process.env.VITE_SSG)
    return 'sync'

  return name === 'default' ? 'sync' : 'async'
}

function resolveOptions(userOptions: UserOptions): ResolvedOptions {
  return Object.assign(
    {
      defaultLayout: 'default',
      layoutsDirs: 'src/layouts',
      pagesDirs: 'src/pages',
      extensions: ['vue'],
      exclude: [],
      importMode: defaultImportMode,
    },
    userOptions,
  )
}

export default function Layout(userOptions: UserOptions = {}): Plugin {
  // If the customization level is not high, enable clientLayout to support better performance
  if (canEnableClientLayout(userOptions)) {
    return ClientSideLayout({
      defaultLayout: userOptions.defaultLayout,
      layoutDir: userOptions.layoutsDirs as string,
    })
  }

  let config: ResolvedConfig

  const options: ResolvedOptions = resolveOptions(userOptions)

  let layoutDirs: string[]
  let pagesDirs: string[]

  // const pagesDirs = resolveDirs(options.pagesDirs, config.root)

  return {
    name: 'vite-plugin-vue-layouts2',
    enforce: 'pre',
    configResolved(_config) {
      config = _config
      layoutDirs = resolveDirs(options.layoutsDirs, config.root)
      pagesDirs = resolveDirs(options.pagesDirs, config.root)
    },
    configureServer({ moduleGraph, watcher, ws }) {
      watcher.add(options.layoutsDirs)

      const reloadModule = (module: ModuleNode | undefined, path = '*') => {
        if (module) {
          moduleGraph.invalidateModule(module)
          if (ws) {
            ws.send({
              path,
              type: 'full-reload',
            })
          }
        }
      }

      const normalizedLayoutDirs = layoutDirs.map(d => normalizePath(d))
      const normalizedPagesDirs = pagesDirs.map(d => normalizePath(d))

      const updateVirtualModule = (path: string) => {
        const normalizedPath = normalizePath(path)

        if (normalizedPagesDirs.length === 0
          || normalizedLayoutDirs.some(dir => normalizedPath.startsWith(dir))
          || normalizedPagesDirs.some(dir => normalizedPath.startsWith(dir))) {
          debug('reload', normalizedPath)
          const module = moduleGraph.getModuleById(MODULE_ID_VIRTUAL)
          reloadModule(module)
        }
      }

      watcher.on('add', updateVirtualModule)
      watcher.on('unlink', updateVirtualModule)
      watcher.on('change', updateVirtualModule)
    },
    resolveId(id) {
      return MODULE_IDS.includes(id) || MODULE_IDS.some(i => id.startsWith(i))
        ? MODULE_ID_VIRTUAL
        : null
    },
    async load(id) {
      if (id === MODULE_ID_VIRTUAL) {
        const container: FileContainer[] = []

        for (const dir of layoutDirs) {
          const layoutsDirPath = dir.slice(0, 1) === '/'
            ? normalizePath(dir)
            : normalizePath(resolve(config.root, dir))

          debug('Loading Layout Dir: %O', layoutsDirPath)

          const _f = await getFilesFromPath(layoutsDirPath, options)
          container.push({ path: layoutsDirPath, files: _f })
        }

        const importCode = getImportCode(container, options)

        const clientCode = getClientCode(importCode, options)

        debug('Client code: %O', clientCode)
        return clientCode
      }
    },
  }
}

export function ClientSideLayout(options?: clientSideOptions): Plugin {
  const {
    layoutDir = 'src/layouts',
    defaultLayout = 'default',
    importMode = process.env.VITE_SSG ? 'sync' : 'async',
  } = options || {}
  return {
    name: 'vite-plugin-vue-layouts2',
    resolveId(id) {
      const MODULE_ID = MODULE_IDS.find(MODULE_ID => id === MODULE_ID)
      if (MODULE_ID) {
        return `\0${MODULE_ID}`
      }
    },
    load(id) {
      if (
        MODULE_IDS.some(MODULE_ID => id === `\0${MODULE_ID}`)
      ) {
        return createVirtualModuleCode({
          layoutDir,
          importMode,
          defaultLayout,
        })
      }
    },
  }
}

function canEnableClientLayout(options: UserOptions) {
  const keys = Object.keys(options)

  // Non isomorphic options: more than 2 keys or keys other than 'layoutsDirs', 'defaultLayout'
  if (keys.length > 2 || keys.some(key => !['layoutsDirs', 'defaultLayout'].includes(key))) {
    return false
  }
  
  // Arrays and glob patterns cannot be isomorphic
  const layoutsDirs = options.layoutsDirs
  return !(layoutsDirs && (Array.isArray(layoutsDirs) || layoutsDirs.includes('*')))
}

export * from './types'
