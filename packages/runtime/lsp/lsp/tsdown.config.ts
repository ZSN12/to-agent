import { defineConfig } from 'tsdown'

export default defineConfig(({ env }) => {
  const client = env?.TASKWEAVER_BUILD_FACE === 'client'

  return {
    entry: client ? '' : ['lib/types/{index,invariant}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
})
