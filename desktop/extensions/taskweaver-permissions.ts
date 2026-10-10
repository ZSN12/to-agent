const PERMISSION_CONTROLLER = Symbol.for('taskweaver.permission-controller')

export default function registerTaskWeaverPermissions(api: { on: (event: string, handler: (event: any) => Promise<unknown>) => void }) {
  api.on('tool_call', async (event) => {
    const controller = (globalThis as any)[PERMISSION_CONTROLLER]
    if (!controller) return { block: true, reason: 'TaskWeaver 权限服务未就绪，操作已阻止' }
    return controller.authorize(event)
  })
}
