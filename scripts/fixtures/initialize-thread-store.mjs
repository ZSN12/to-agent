import { createThreadStore } from '../../backend/thread-store.mjs'

const [userDataPath] = process.argv.slice(2)
if (!userDataPath) throw new Error('user data path is required')

const store = createThreadStore(userDataPath, null)
try {
  const state = await store.initialize()
  console.log(JSON.stringify({
    currentThreadId: state.currentThreadId,
    threadIds: state.threads.map((thread) => thread.id).sort(),
  }))
} finally {
  await store.close()
}
