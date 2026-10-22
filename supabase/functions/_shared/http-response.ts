/** Parse successful API responses that may intentionally omit a body. */
export async function readOptionalJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return null;

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('invalid_json_response');
  }
}
