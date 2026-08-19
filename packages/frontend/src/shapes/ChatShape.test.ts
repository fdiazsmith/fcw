import { describe, it, expect } from 'vitest';
import { viewFromShape, type ChatShape } from './ChatShape';

const shape = (props: Partial<ChatShape['props']> = {}): ChatShape =>
  ({
    id: 'shape:c1',
    type: 'chat-node',
    x: 5,
    y: 6,
    props: {
      w: 360,
      h: 420,
      chatId: 'c1',
      title: 'T',
      messagesJson: '[]',
      streamingText: '',
      hasStream: false,
      error: '',
      collapsed: false,
      expandedH: 420,
      settingsJson: '{"engine":"api"}',
      pendingPermissionJson: '',
      capabilitiesJson: '',
      usageJson: '',
      contextChats: 0,
      ...props,
    },
  }) as ChatShape;

describe('viewFromShape usage', () => {
  it('defaults to no usage', () => {
    const v = viewFromShape(shape());
    expect(v.usage).toBeNull();
    expect(v.contextChats).toBe(0);
  });

  it('parses usageJson and contextChats', () => {
    const usage = {
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 100,
      costUSD: 0.042,
      turns: 2,
    };
    const v = viewFromShape(shape({ usageJson: JSON.stringify(usage), contextChats: 3 }));
    expect(v.usage).toEqual(usage);
    expect(v.contextChats).toBe(3);
  });
});
