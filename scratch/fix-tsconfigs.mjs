import fs from 'node:fs'

function fix(file) {
  let content = fs.readFileSync(file, 'utf8')
  // We need to be careful to only replace paths that don't already start with ./packages/runtime
  content = content.replace(/"\.\/packages\/(?!runtime\/)([^"]+)"/g, '"./packages/runtime/$1"')
  content = content.replace(/"packages\/(?!runtime\/)([^"]+)"/g, '"packages/runtime/$1"')
  // host-cli
  content = content.replace(/"host-cli\//g, '"packages/runtime/host-cli/')
  // apps/cli -> packages/runtime/host-cli ?
  content = content.replace(/"\.\/apps\/cli"/g, '"./packages/runtime/host-cli"')
  fs.writeFileSync(file, content)
}

fix('tsconfig.host.json')
fix('tsconfig.client.json')
fix('tsconfig.base.json')
