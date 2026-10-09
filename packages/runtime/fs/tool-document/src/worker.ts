import { parentPort } from 'node:worker_threads'
import { parseDocumentBytes } from './parse.ts'
import type { WorkerRequest, WorkerResponse } from './protocol.ts'

if (!parentPort) throw new Error('tool-document worker must run inside worker_threads')

parentPort.on('message', async (request: WorkerRequest) => {
  const response: WorkerResponse = { id: request.id }
  try {
    response.result = await parseDocumentBytes(request.bytes, request.options)
  } catch (error: unknown) {
    response.error = {
      message: error instanceof Error ? error.message : String(error),
      ...typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? { code: error.code }
        : {},
    }
  }
  parentPort!.postMessage(response)
})
