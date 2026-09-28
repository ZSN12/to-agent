# Integration Tests

This directory contains integration tests for TaskWeaver's core functionalities.

## Test Structure

```
tests/
├── helpers/
│   └── mock-services.mjs          # Mock services for testing
├── multi-session-parallel.test.mjs # Multi-session concurrency tests
├── dsh-reconnect.test.mjs          # DSH reconnection tests
└── permission-flow.test.mjs        # Permission approval flow tests
```

## Running Tests

Run all integration tests:
```bash
npm run test:integration
```

Run specific test suites:
```bash
npm run test:integration:multi-session   # Multi-session parallel execution
npm run test:integration:reconnect       # DSH reconnection
npm run test:integration:permissions     # Permission flow
```

Run individual test files:
```bash
node --test tests/multi-session-parallel.test.mjs
node --test tests/dsh-reconnect.test.mjs
node --test tests/permission-flow.test.mjs
```

## Test Coverage

### Multi-Session Parallel Execution
Tests concurrent DSH session handling:
- Tool call isolation between sessions
- Concurrent file mutation handling
- Message history separation
- Independent state transitions
- Event emission isolation

### DSH Reconnection
Tests disconnect/reconnect behavior:
- Disconnection detection
- Operation rejection during disconnect
- State restoration after reconnection
- Session ID preservation
- Tool call history maintenance

### Permission Flow
Tests permission request and approval:
- Pending prompt creation
- Approval/denial resolution
- Concurrent permission requests
- Auto-approve mode
- Error handling for invalid prompts

## Test Framework

These tests use Node.js built-in test runner (`node:test`), which requires Node.js 18+.

## Mock Services

The `helpers/mock-services.mjs` module provides:
- `MockDshSession` - Simulates DSH session lifecycle
- `MockPermissionService` - Simulates permission approval flow
- `MockOrchestrationService` - Simulates DAG task execution
- `createMockWorkspace` - Creates test workspace
- `waitFor` - Utility for async condition waiting
