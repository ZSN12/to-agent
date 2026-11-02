import { defineConfig } from 'tsdown'
import { hostPackageConfig } from '../../tsdown.config.ts'

export default defineConfig(({ env }) => hostPackageConfig(env))
