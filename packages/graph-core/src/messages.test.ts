import { describe, it, expectTypeOf } from 'vitest';
import type { ServerMessage } from './messages.js';
import type { ExecutionStatus, PathStatus } from './types.js';

describe('ServerMessage types', () => {
  it('execution_status_changed message compiles with correct shape', () => {
    const msg: ServerMessage = {
      type: 'execution_status_changed',
      nodeId: 'n1',
      executionStatus: 'completed' as ExecutionStatus,
    };
    expectTypeOf(msg).toMatchTypeOf<ServerMessage>();
  });

  it('path_status_changed message compiles with correct shape', () => {
    const msg: ServerMessage = {
      type: 'path_status_changed',
      nodeId: 'n1',
      pathStatus: 'archived' as PathStatus,
    };
    expectTypeOf(msg).toMatchTypeOf<ServerMessage>();
  });

  it('node_auto_collapsed message compiles with correct shape', () => {
    const msg: ServerMessage = {
      type: 'node_auto_collapsed',
      nodeId: 'n1',
    };
    expectTypeOf(msg).toMatchTypeOf<ServerMessage>();
  });

  it('execution_status_changed carries nodeId and executionStatus', () => {
    const msg = {
      type: 'execution_status_changed' as const,
      nodeId: 'abc',
      executionStatus: 'in_progress' as ExecutionStatus,
    } satisfies ServerMessage;
    // type-check: if this line compiles, the type is correct
    const _nodeId: string = msg.nodeId;
    const _status: ExecutionStatus = msg.executionStatus;
    void _nodeId;
    void _status;
  });

  it('path_status_changed carries nodeId and pathStatus', () => {
    const msg = {
      type: 'path_status_changed' as const,
      nodeId: 'abc',
      pathStatus: 'active' as PathStatus,
    } satisfies ServerMessage;
    const _nodeId: string = msg.nodeId;
    const _status: PathStatus = msg.pathStatus;
    void _nodeId;
    void _status;
  });

  it('node_auto_collapsed carries only nodeId', () => {
    const msg = {
      type: 'node_auto_collapsed' as const,
      nodeId: 'abc',
    } satisfies ServerMessage;
    const _nodeId: string = msg.nodeId;
    void _nodeId;
  });
});
