import fs from 'node:fs'

let source = fs.readFileSync('desktop/ipc/channels.mjs', 'utf8')

// We want to match: `["name", "bridgePath", "methodType", (invoke) => ... ]`
// and replace it with `["name", "bridgePath", "methodType"]`

// Because some span multiple lines or have various shapes, let's use a regex that matches `", (invoke) => ... ],`
// Actually, they all look like `", (invoke) => ...],\n` or `... ],\n`.

// Let's replace `, (invoke) => .*?\]` with `]` but we must be careful with nested brackets or parentheses.
// Wait, all entries are on a single line!
source = source.split('\n').map(line => {
  if (line.includes('(invoke) =>')) {
    // find the last string or what?
    // They are like: `["backend:ready", "backendReady", "import('./app-api').TaskweaverBackendApi['backendReady']", (invoke) => () => invoke('backend:ready')],`
    // We can just replace `, (invoke) =>.*\]` with `]`
    return line.replace(/,\s*\(invoke\)\s*=>.*\](,?)$/, ']$1')
  }
  return line
}).join('\n')

fs.writeFileSync('desktop/ipc/channels.mjs', source)
