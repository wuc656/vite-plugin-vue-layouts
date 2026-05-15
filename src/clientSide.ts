import { posix } from 'node:path'

function normalizePath(path: string) {
  return posix.normalize(`${path.startsWith('/') ? '' : '/'}${path}`)
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

  return `
  export const createGetRoutes = (router, withLayout = false) => {
      const routes = router.getRoutes()
      return withLayout ? routes : () => routes.filter(route => !route.meta.isLayout)
  }
  
  export const setupLayouts = routes => {
      const layouts = {}
      const modules = ${await createVirtualGlob(normalizedTarget, isSync)}
    
      Object.entries(modules).forEach(([name, module]) => {
          const key = name.replace("${normalizedTarget}/", '').replace(/\.vue$/, '')
          layouts[key] = ${isSync ? 'module.default' : 'module'}
      })
      
    function deepSetupLayout(routes, top = true) {
      return routes.map(route => {
        if (route.children?.length > 0) {
          route.children = deepSetupLayout(route.children, false)
        }

        if (top) {
          // unplugin-vue-router adds a top-level route to the routing group, which we should skip.
          const skipLayout = !route.component && route.children?.find(r => (r.path === '' || r.path === '/') && r.meta?.isLayout)  

          if (skipLayout || route.meta?.layout === false) {
            return route
          }

          return { 
            path: route.path,
            component: layouts[route.meta?.layout || '${defaultLayout}'],
            children: route.path === '/' ? [route] : [{...route, path: ''}],
            meta: { isLayout: true }
          }
        }
  
        if (route.meta?.layout) {
          return { 
            path: route.path,
            component: layouts[route.meta.layout],
            children: [{...route, path: ''}],
            meta: { isLayout: true }
          }
        }
  
        return route
      })
    }
  
      return deepSetupLayout(routes)
  }`
}
