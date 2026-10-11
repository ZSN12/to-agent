/** Share one in-flight async operation among concurrent callers. */
export function singleFlight<T>(
  flightRef: { current: Promise<T> | null },
  work: () => Promise<T>,
): Promise<T> {
  if (flightRef.current) return flightRef.current

  const flight = Promise.resolve().then(work).finally(() => {
    if (flightRef.current === flight) flightRef.current = null
  })
  flightRef.current = flight
  return flight
}
