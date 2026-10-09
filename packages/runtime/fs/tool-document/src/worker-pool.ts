import { Worker } from 'node:worker_threads'
import type { WorkerOptions } from 'node:worker_threads'
import type { DocumentOptions, DocumentReadResult, WorkerResponse } from './protocol.ts'
import { DocumentReadError } from './errors.ts'

const POOL_SIZE = 2
const WORKER_TIMEOUT_MS = 30_000
const WORKER_MEMORY_MB = 512

interface Job {
  id: number
  bytes: Uint8Array
  options: DocumentOptions
  signal?: AbortSignal
  resolve: (value: DocumentReadResult) => void
  reject: (error: Error) => void
  timeout?: NodeJS.Timeout
  abort?: () => void
}

interface Slot {
  worker: Worker | undefined
  job: Job | undefined
}

function abortError(): Error {
  return new Error('Document reading was cancelled.')
}

class DocumentWorkerPool {
  private readonly slots: Slot[] = Array.from({ length: POOL_SIZE }, () => ({ worker: undefined, job: undefined }))
  private readonly queue: Job[] = []
  private nextId = 1

  run(bytes: Uint8Array, options: DocumentOptions, signal?: AbortSignal): Promise<DocumentReadResult> {
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        bytes,
        options,
        ...(signal ? { signal } : {}),
        resolve,
        reject,
      }
      if (signal) {
        job.abort = () => {
          const queuedAt = this.queue.indexOf(job)
          if (queuedAt !== -1) {
            this.queue.splice(queuedAt, 1)
            reject(abortError())
            return
          }
          const slot = this.slots.find(item => item.job === job)
          if (slot) this.stop(slot, abortError())
        }
        signal.addEventListener('abort', job.abort, { once: true })
      }
      this.queue.push(job)
      this.pump()
    })
  }

  private createWorker(): Worker {
    const source = import.meta.url.endsWith('.ts') ? new URL('./worker.ts', import.meta.url) : new URL('./worker.js', import.meta.url)
    const options: WorkerOptions = {
      name: 'taskweaver-document-parser',
      resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB },
    }
    return new Worker(source, options)
  }

  private attachWorker(slot: Slot, worker: Worker): void {
    worker.on('message', (response: WorkerResponse) => {
      if (slot.worker !== worker) return
      const job = slot.job
      if (!job) return
      if (response.id !== job.id) {
        this.stop(slot, new Error('Document parser returned a mismatched request id.'))
        return
      }
      slot.job = undefined
      const error = response.error ? new DocumentReadError(response.error.message, response.error.code) : undefined
      this.settle(job, error, response.result)
      worker.unref()
      this.pump()
    })
    worker.on('error', (error) => {
      if (slot.worker === worker) this.stop(slot, new Error('Document parser worker failed: ' + error.message, { cause: error }))
    })
    worker.on('exit', (code) => {
      if (slot.worker !== worker) return
      slot.worker = undefined
      const job = slot.job
      slot.job = undefined
      if (job) this.settle(job, new Error('Document parser worker exited unexpectedly (' + code + ').'))
      this.pump()
    })
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job || this.queue.length === 0) continue
      const job = this.queue.shift()!
      if (job.signal?.aborted) {
        this.settle(job, abortError())
        continue
      }
      const worker = slot.worker ?? this.createWorker()
      slot.worker = worker
      if (!slot.job && worker.listenerCount('message') === 0) this.attachWorker(slot, worker)
      slot.job = job
      worker.ref()
      job.timeout = setTimeout(() => this.stop(slot, new Error('Document parsing exceeded the 30 second time limit. Retry with a smaller document.')), WORKER_TIMEOUT_MS)
      const transferable = Uint8Array.from(job.bytes)
      worker.postMessage({ id: job.id, bytes: transferable, options: job.options }, [transferable.buffer])
    }
  }

  private stop(slot: Slot, error: Error): void {
    const worker = slot.worker
    const job = slot.job
    slot.job = undefined
    slot.worker = undefined
    if (job) this.settle(job, error)
    if (worker) void worker.terminate().finally(() => this.pump())
    else this.pump()
  }

  private settle(job: Job, error?: Error, value?: DocumentReadResult): void {
    if (job.timeout) clearTimeout(job.timeout)
    if (job.abort && job.signal) job.signal.removeEventListener('abort', job.abort)
    if (error) job.reject(error)
    else if (value) job.resolve(value)
    else job.reject(new Error('Document parser returned no result.'))
  }
}

export const documentWorkerPool = new DocumentWorkerPool()
