import { register } from '@z/dsh-invariants/host.js'

register(
  import.meta,
  () => {
    // No runtime invariant: tool-cache is a stateless plugin that listens to
    // tool execution events. Cache state is ephemeral and tied to session lifecycle.
    // There is no authoritative event stream or mutable data structure to validate.
  },
)
