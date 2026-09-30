// Shared JSON transport. Provider authorization errors keep their HTTP status so
// the UI can distinguish an expired Dashboard session from a GitHub reconnect.
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function requestJSON(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: options.signal || AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") throw error;
    throw new ApiError("Could not reach the server. Check your connection and try again.");
  }
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response. Please try again.", response.status);
  }
  if (!response.ok) throw new ApiError(
    typeof data?.error === "string" ? data.error : "Request failed. Please try again.",
    response.status,
  );
  return data;
}
