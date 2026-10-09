# `@z/dsh-taskweaver`

`@z/dsh-taskweaver` supplies the TaskWeaver API Host startup glue over [`dsh-base`](../base/README.md). Its bundle patch configures the WebServer bind address and port, forwards explicit trusted authorities to the `/api` connection, and publishes the existing `z web:` readiness line after the Loader tree settles. The Electron Host supervisor uses that line only after the API route has mounted.

The `web-startup` provider ([`src/startup.ts`](src/startup.ts)) parses the API Host options from `dsh --profile web`:

- `--host <host>` selects the WebServer bind host. The default is `127.0.0.1`; `0.0.0.0` is rejected.
- `--port <port>` selects the WebServer port. The default is `3080`; `0` asks the operating system for a free port.
- `--trusted-host <authority...>` adds explicit authorities accepted by the `/api` trust fence and can be repeated.

The provider exposes those values as `webStartup`. The WebServer row binds only after that service exists. The API Host row forwards `trustedHosts` as `webRuntime` and waits for Loader completion before printing `z web: http://127.0.0.1:<port>`. A `--help` invocation prints the profile options without binding a server.

The bundle has no frontend dist resolver, static UI fallback, browser opener, UI prompt injection, or UI shell environment variables. Those concerns belong to the Electron application. The Host still composes the API gateway, `/api` connection, API remotes, and host services required by Electron.

The focused startup suite covers flag parsing, invalid bind options, lazy service ordering, and help. The API Host suite checks that the `/api` route answers before the readiness line is released.
