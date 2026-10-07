#!/usr/bin/env node
import assert from 'node:assert/strict'
import { parseGithubRemote } from '../electron/backend/github-pull-requests.mjs'

assert.deepEqual(parseGithubRemote('git@github.com:acme/demo.git'), { owner: 'acme', repo: 'demo' })
assert.deepEqual(parseGithubRemote('https://github.com/acme/demo'), { owner: 'acme', repo: 'demo' })
assert.deepEqual(parseGithubRemote('https://github.com/acme/demo.git/'), { owner: 'acme', repo: 'demo' })
assert.equal(parseGithubRemote('git@gitlab.com:acme/demo.git'), null)

console.log('test-github-pull-requests: ok')
