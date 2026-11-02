const TASKWEAVER_PROCESS_PATTERNS = [
  /\/Contents\/MacOS\/TaskWeaver(?:\s|$)/,
  /\/backend\/shell\/run\.mjs(?:\s|$)/,
]

/** Return PIDs for TaskWeaver shells or their Node backends in `ps -axo pid=,command=` output. */
export function findRunningTaskWeaverPids(processList, currentPid = process.pid) {
  const pids = []
  for (const line of String(processList ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (!match) continue
    const pid = Number(match[1])
    if (!Number.isSafeInteger(pid) || pid === currentPid) continue
    if (TASKWEAVER_PROCESS_PATTERNS.some((pattern) => pattern.test(match[2]))) pids.push(pid)
  }
  return pids
}
