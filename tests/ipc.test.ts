import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpenedFile, parseSaveProjectRequest } from '../src/main/ipcInput'
import { createTrustedPaths } from '../src/main/trustedPaths'

describe('trusted paths', () => {
  const file = resolve('/work/O1000.nc')

  it('trusts only paths granted or on the recent list', () => {
    const recent = resolve('/work/O2000.nc')
    const trusted = createTrustedPaths((p) => p === recent)
    expect(trusted.has(file)).toBe(false)
    expect(trusted.has(recent)).toBe(true)
    trusted.grant(file)
    expect(trusted.has(file)).toBe(true)
  })

  it('compares normalized paths, so ".." cannot reach a granted folder', () => {
    const trusted = createTrustedPaths(() => false)
    trusted.grant(file)
    expect(trusted.has(resolve('/work/sub/../O1000.nc'))).toBe(true)
    expect(trusted.has(resolve('/work/O1000.nc/../../etc/passwd'))).toBe(false)
  })

  it('never trusts relative paths', () => {
    const trusted = createTrustedPaths(() => true)
    trusted.grant('O1000.nc')
    expect(trusted.has('O1000.nc')).toBe(false)
  })
})

describe('IPC input', () => {
  it('accepts a program and drops unknown fields', () => {
    const file = parseOpenedFile({ name: 'O1.nc', path: '/a/O1.nc', text: 'G0X0', extra: 1 })
    expect(file).toEqual({ name: 'O1.nc', path: '/a/O1.nc', text: 'G0X0' })
  })

  it('rejects malformed programs and project requests', () => {
    expect(parseOpenedFile(null)).toBeNull()
    expect(parseOpenedFile({ name: 'O1.nc', path: 42, text: '' })).toBeNull()
    expect(parseSaveProjectRequest({ project: 'x', projectPath: '', programPath: '' })).toBeNull()
    expect(parseSaveProjectRequest({ project: { machine: 'romi-gl300' }, projectPath: '', programPath: '/a/O1.nc' })).not.toBeNull()
  })
})
