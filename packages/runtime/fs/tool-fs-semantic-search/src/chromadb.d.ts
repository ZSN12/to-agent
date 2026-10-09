declare module 'chromadb' {
  export const ChromaClient: new (options: { path: string }) => any
}
