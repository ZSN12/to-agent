/**
 * Boot the Web profile with the macOS desktop-control overlay layered on. This
 * is a repository demo wrapper, not a product CLI feature.
 */
import { spawn } from 'node:child_process'

const args = [
  '--import',
  'tsx',
  'apps/cli/src/bin.ts',
  'web',
  '--patch',
  'examples/web-desktop/cordis.yml',
]

console.log('Desktop Web: http://127.0.0.1:3082')
const child = spawn(process.execPath, args, { stdio: 'inherit' })
child.on('exit', (code, signal) => { process.exit(signal === null ? code ?? 1 : 1) })
