#!/usr/bin/env node

import { Context } from '@z/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@z/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@z/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
