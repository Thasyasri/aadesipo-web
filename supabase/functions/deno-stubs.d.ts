declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: { get(key: string): string | undefined };
}

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(url: string, key: string, options?: unknown): any;
}

declare module "npm:web-push@3" {
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
    ): Promise<unknown>;
  };
  export default webpush;
}
