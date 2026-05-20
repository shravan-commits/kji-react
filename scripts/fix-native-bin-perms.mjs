/**
 * Ensures native helper binaries are executable on Unix.
 * Needed when node_modules was copied from Windows (no +x) or extracted without execute bits.
 */
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform === 'win32') {
  process.exit(0)
}

const nodeModules = join(process.cwd(), 'node_modules')

function chmodExecutable(filePath) {
  if (!existsSync(filePath)) {
    return
  }
  try {
    chmodSync(filePath, 0o755)
  } catch {
    // Ignore; npm rebuild may be required if the file is on a noexec mount.
  }
}

function chmodEsbuildPackages() {
  chmodExecutable(join(nodeModules, 'esbuild', 'bin', 'esbuild'))
  const esbuildScope = join(nodeModules, '@esbuild')
  if (!existsSync(esbuildScope)) {
    return
  }
  for (const pkg of readdirSync(esbuildScope)) {
    chmodExecutable(join(esbuildScope, pkg, 'bin', 'esbuild'))
  }
}

function chmodRollupPackages() {
  const rollupScope = join(nodeModules, '@rollup')
  if (!existsSync(rollupScope)) {
    return
  }
  for (const pkg of readdirSync(rollupScope)) {
    const pkgDir = join(rollupScope, pkg)
    let entries
    try {
      entries = readdirSync(pkgDir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.endsWith('.node') || name === 'esbuild') {
        chmodExecutable(join(pkgDir, name))
      }
    }
  }
}

chmodEsbuildPackages()
chmodRollupPackages()
