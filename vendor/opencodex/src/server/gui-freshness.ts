/** No GUI bundle in TaskWeaver desktop builds — freshness checks are inert. */

export function inspectGuiBundleFreshness(_opts: { bundlePath: string | null; sourcePath?: string }) {
  return { stale: false as const, bundlePath: null, sourcePath: null }
}

export function staleGuiBundleLines(_inspection: ReturnType<typeof inspectGuiBundleFreshness>): string[] {
  return []
}
