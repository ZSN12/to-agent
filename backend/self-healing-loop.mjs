/**
 * Run bounded verify → repair cycles and always verify once after the final
 * repair. A repair callback can return false to stop further work.
 */
export async function runBoundedSelfHealing({ maxAttempts, verify, repair }) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts must be a positive safe integer')
  }
  if (typeof verify !== 'function' || typeof repair !== 'function') {
    throw new TypeError('verify and repair must be functions')
  }

  let attempts = 0
  let verification
  while (true) {
    verification = await verify({ attempts })
    if (!verification?.executed || verification.passed || attempts >= maxAttempts) break
    attempts += 1
    if (await repair(verification, attempts) === false) break
  }
  return { verification, attempts }
}
