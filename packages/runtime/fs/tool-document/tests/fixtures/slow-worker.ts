import { parentPort } from 'node:worker_threads'
import type { WorkerRequest, WorkerResponse } from '../../src/protocol.ts'

if (!parentPort) throw new Error('slow document worker fixture must run in worker_threads')

parentPort.on('message', (request: WorkerRequest) => {
  setTimeout(() => {
    const response: WorkerResponse = {
      id: request.id,
      result: { content: [{ type: 'text', text: 'late result' }], truncated: false, tokensEstimate: 1 },
    }
    parentPort!.postMessage(response)
  }, 250)
})
