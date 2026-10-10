/** Host-owned native directory selection for the Electron desktop. */

import { Context, Service } from '@taskweaver/cordis'

declare module '@taskweaver/cordis' {
  interface Context {
    directoryPicker: DirectoryPicker
  }
}

/** Native directory picker service, bound to the Host's user-visible desktop. */
export abstract class DirectoryPicker extends Service {
  constructor(ctx: Context) {
    super(ctx, 'directoryPicker')
  }

  /**
   * Open the operating system's directory chooser.
   * @param signal - caller/connection lifetime; abort terminates the chooser.
   * @returns the chosen absolute path, or null when the operator cancels.
   */
  abstract pick(signal: AbortSignal): Promise<string | null>
}

export default DirectoryPicker
