// Edge Functions are called cross-origin from the browser app, so they must
// answer the CORS preflight and stamp CORS headers on every response. Without
// this the browser blocks the request ("Failed to send a request to the Edge
// Function") before the handler's own auth check ever matters.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Wraps a handler: short-circuits the OPTIONS preflight and adds the CORS
 *  headers to whatever the handler returns. */
export function withCors(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    const res = await handler(req);
    for (const [key, value] of Object.entries(corsHeaders)) res.headers.set(key, value);
    return res;
  };
}
