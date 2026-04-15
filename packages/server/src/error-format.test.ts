import { describe, it, expect } from 'vitest';
import { formatErrorMessage } from './error-format.js';

describe('formatErrorMessage', () => {
  it('extracts message, status, type, and request id from JSON API errors', () => {
    const error = new Error(
      'Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low."},"request_id":"req_abc"}',
    );

    const formatted = formatErrorMessage(error);

    expect(formatted).toContain('Your credit balance is too low.');
    expect(formatted).toContain('Status: 400');
    expect(formatted).toContain('Type: invalid_request_error');
    expect(formatted).toContain('Request ID: req_abc');
  });

  it('strips plain Error prefix for non-JSON messages', () => {
    const formatted = formatErrorMessage(new Error('Network connection lost'));
    expect(formatted).toBe('Network connection lost');
  });
});
