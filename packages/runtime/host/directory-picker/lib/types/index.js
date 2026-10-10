/** Host-owned native directory selection for the Electron desktop. */
import { Service } from '@taskweaver/cordis';
/** Native directory picker service, bound to the Host's user-visible desktop. */
export class DirectoryPicker extends Service {
    constructor(ctx) {
        super(ctx, 'directoryPicker');
    }
}
export default DirectoryPicker;
//# sourceMappingURL=index.js.map