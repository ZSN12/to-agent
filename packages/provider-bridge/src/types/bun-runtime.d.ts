// provider-bridge is bundled for Node (the TaskWeaver Host), where the `Bun` global does not
// exist. These declarations cover only the Bun APIs this package calls, and type the global as
// possibly undefined so every call site has to handle running outside Bun.

interface BunImagePipeline {
  metadata(): Promise<{ width?: number; height?: number; format?: string }>;
  resize(width: number, height: number): BunImagePipeline;
  jpeg(options: { quality: number }): BunImagePipeline;
  bytes(): Promise<Uint8Array>;
}

interface BunServeOptions {
  hostname: string;
  port: number;
  reusePort?: boolean;
  fetch(request: Request): Response | Promise<Response>;
}

interface BunServerHandle {
  readonly port: number;
  stop(closeActiveConnections?: boolean): void;
}

interface BunRuntime {
  Image: new (data: Uint8Array) => BunImagePipeline;
  serve(options: BunServeOptions): BunServerHandle;
}

declare var Bun: BunRuntime | undefined;
