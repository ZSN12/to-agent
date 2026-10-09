import { parentPort } from 'node:worker_threads';
import { parseDocumentBytes } from "./parse.js";
if (!parentPort)
    throw new Error('tool-document worker must run inside worker_threads');
parentPort.on('message', async (request) => {
    const response = { id: request.id };
    try {
        response.result = await parseDocumentBytes(request.bytes, request.options);
    }
    catch (error) {
        response.error = {
            message: error instanceof Error ? error.message : String(error),
            ...typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
                ? { code: error.code }
                : {},
        };
    }
    parentPort.postMessage(response);
});
//# sourceMappingURL=worker.js.map