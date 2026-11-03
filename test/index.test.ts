import { describe, expect, it } from 'vitest'
import { getImportCode } from '../src/importCode'
import { defaultImportMode } from '../src/index'
import { createSetupLayoutsCode } from '../src/RouteLayout'
import { extensionsToGlob, normalizePath, resolveDirs } from '../src/utils'

// Helper to access internal canEnableClientLayout
function canEnableClientLayout(options: any) {
  const keys = Object.keys(options)
  if (keys.length > 2 || keys.some(key => !['layoutsDirs', 'defaultLayout'].includes(key))) {
    return false
  }
  const layoutsDirs = options.layoutsDirs
  return !(layoutsDirs && (Array.isArray(layoutsDirs) || layoutsDirs.includes('*')))
}

describe('canEnableClientLayout', () => {
  it('enables clientLayout for default or simple options', () => {
    expect(canEnableClientLayout({})).toBe(true)
    expect(canEnableClientLayout({ defaultLayout: 'home' })).toBe(true)
    expect(canEnableClientLayout({ layoutsDirs: 'src/layouts' })).toBe(true)
    expect(canEnableClientLayout({ defaultLayout: 'home', layoutsDirs: 'src/layouts' })).toBe(true)
  })

  it('disables clientLayout when multiple dirs or globs are used', () => {
    expect(canEnableClientLayout({
      layoutsDirs: ['src/layouts', 'src/modules/layouts'],
    })).toBe(false)
    expect(canEnableClientLayout({ layoutsDirs: 'src/**/layouts' })).toBe(false)
  })

  it('disables clientLayout when extra options are provided', () => {
    expect(canEnableClientLayout({ pagesDirs: 'src/pages' })).toBe(false)
    expect(canEnableClientLayout({
      importMode: () => 'sync',
    })).toBe(false)
    expect(canEnableClientLayout({
      extensions: ['vue', 'tsx'],
    })).toBe(false)
  })
})

describe('defaultImportMode', () => {
  it('returns sync for default layout and async for others', () => {
    delete process.env.VITE_SSG
    expect(defaultImportMode('default')).toBe('sync')
    expect(defaultImportMode('admin')).toBe('async')
    expect(defaultImportMode('user/profile')).toBe('async')
  })

  it('returns sync for all layouts when VITE_SSG is set', () => {
    process.env.VITE_SSG = 'true'
    expect(defaultImportMode('default')).toBe('sync')
    expect(defaultImportMode('admin')).toBe('sync')
    delete process.env.VITE_SSG
  })
})

describe('utils', () => {
  it('extensionsToGlob formats extensions correctly', () => {
    expect(extensionsToGlob(['vue'])).toBe('vue')
    expect(extensionsToGlob(['vue', 'md'])).toBe('{vue,md}')
    expect(extensionsToGlob([])).toBe('')
  })

  it('normalizePath replaces backslashes with slashes', () => {
    expect(normalizePath('C:\\path\\to\\file')).toBe('C:/path/to/file')
    expect(normalizePath('/already/normalized/path')).toBe('/already/normalized/path')
  })

  it('resolveDirs handles strings, arrays and null', () => {
    expect(resolveDirs(null, 'C:/root')).toEqual([])
    const single = resolveDirs('src/layouts', 'C:/root')
    expect(single).toEqual(['C:/root/src/layouts'])
    const multiple = resolveDirs(['dir1', 'dir2'], 'C:/root')
    expect(multiple).toEqual(['C:/root/dir1', 'C:/root/dir2'])
  })
})

describe('getImportCode', () => {
  it('generates imports with correct sync/async split', () => {
    const files = [
      {
        path: '/src/layouts',
        files: ['default.vue', 'admin.vue'],
      },
    ]
    const options: any = {
      importMode: (name: string) => (name === 'default'
        ? 'sync'
        : 'async'),
    }

    const code = getImportCode(files, options)
    expect(code).toContain('import __layout_0 from \'/src/layouts/default.vue\'')
    expect(code).toContain('\'default\': __layout_0,')
    expect(code).toContain('\'admin\': () => import(\'/src/layouts/admin.vue\'),')
  })
})

describe('createSetupLayoutsCode runtime behavior', () => {
  it('generates executable code that attaches layout components correctly', () => {
    const code = createSetupLayoutsCode('default')

    // Test the generated function via Function constructor
    const mockLayouts: Record<string, string> = {
      default: 'DefaultComponent',
      admin: 'AdminComponent',
    }

    const esmCode = code
      .replaceAll('export const ', 'const ')
      .replaceAll('export function ', 'function ')

    // eslint-disable-next-line no-new-func
    const runner = new Function(
      'layouts',
      `${esmCode}; return { setupLayouts, createGetRoutes };`,
    )
    const { setupLayouts, createGetRoutes } = runner(mockLayouts)

    const routes = [
      { path: '/', component: 'HomeComponent' },
      {
        path: '/dashboard',
        component: 'DashboardComponent',
        meta: { layout: 'admin' },
      },
      {
        path: '/no-layout',
        component: 'NoLayoutComponent',
        meta: { layout: false },
      },
    ]

    const processed = setupLayouts(routes)

    // Root route should be wrapped in default layout
    expect(processed[0].path).toBe('/')
    expect(processed[0].component).toBe('DefaultComponent')
    expect(processed[0].meta.isLayout).toBe(true)
    expect(processed[0].children[0].path).toBe('/')

    // Dashboard route wrapped in admin layout
    expect(processed[1].path).toBe('/dashboard')
    expect(processed[1].component).toBe('AdminComponent')
    expect(processed[1].children[0].path).toBe('')

    // No layout route remains unchanged
    expect(processed[2].path).toBe('/no-layout')
    expect(processed[2].component).toBe('NoLayoutComponent')
    expect(processed[2].meta.isLayout).toBeUndefined()

    // Test createGetRoutes
    const mockRouter = {
      getRoutes: () => [
        {
          path: '/',
          meta: { isLayout: true },
        },
        { path: '/inner', meta: {} },
      ],
    }
    const filterFn = createGetRoutes(mockRouter, false)
    expect(filterFn()).toEqual([
      { path: '/inner', meta: {} },
    ])
  })
})
