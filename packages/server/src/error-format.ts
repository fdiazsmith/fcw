interface ParsedApiErrorBody {
  type?: unknown;
  message?: unknown;
  error?: unknown;
  request_id?: unknown;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripErrorPrefix(value: string): string {
  return value.replace(/^error:\s*/i, '').trim();
}

function extractStatusCode(prefix: string): string | undefined {
  const match = prefix.match(/\b([1-5][0-9]{2})\b/);
  return match?.[1];
}

function parseApiError(raw: string): { prefix: string; body: ParsedApiErrorBody } | null {
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) return null;

  const prefix = raw.slice(0, jsonStart).trim();
  const bodyText = raw.slice(jsonStart).trim();
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== 'object') return null;
    return { prefix, body: parsed as ParsedApiErrorBody };
  } catch {
    return null;
  }
}

export function formatErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown error';

  const parsed = parseApiError(trimmed);
  if (!parsed) return stripErrorPrefix(trimmed);

  const bodyError = parsed.body.error;
  const bodyErrorObj =
    bodyError && typeof bodyError === 'object'
      ? (bodyError as Record<string, unknown>)
      : undefined;

  const mainMessage =
    asNonEmptyString(bodyErrorObj?.message) ??
    asNonEmptyString(parsed.body.message) ??
    stripErrorPrefix(trimmed);
  const statusCode = extractStatusCode(parsed.prefix);
  const errorType =
    asNonEmptyString(bodyErrorObj?.type) ?? asNonEmptyString(parsed.body.type);
  const requestId = asNonEmptyString(parsed.body.request_id);

  const lines = [mainMessage];
  if (statusCode) lines.push(`Status: ${statusCode}`);
  if (errorType) lines.push(`Type: ${errorType}`);
  if (requestId) lines.push(`Request ID: ${requestId}`);

  return lines.join('\n');
}
