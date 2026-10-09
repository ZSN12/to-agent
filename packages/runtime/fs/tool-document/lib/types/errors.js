export class DocumentReadError extends Error {
    code;
    constructor(message, code = 'DOCUMENT_READ_ERROR', options) {
        super(message, options);
        this.name = 'DocumentReadError';
        this.code = code;
    }
}
//# sourceMappingURL=errors.js.map