export function displayModelRoute(modelKey: string): string {
  const codexNamespace = 'openai-codex/'
  if (modelKey.startsWith(codexNamespace)) {
    return `Codex/${modelKey.slice(codexNamespace.length)}`
  }
  const bridgeNamespace = 'bridge-antigravity/'
  if (modelKey.startsWith(`${bridgeNamespace}google-antigravity/`)) {
    return modelKey.slice(bridgeNamespace.length)
  }
  return modelKey
}
