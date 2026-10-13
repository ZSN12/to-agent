export function createShellDevUiEntryUrl(shellApiBase) {
  return new URL('/__taskweaver/dev-ui', shellApiBase)
}
