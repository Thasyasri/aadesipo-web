import { Card } from "@/components/Card";

export function UnconfiguredBanner() {
  return (
    <Card className="border border-semantic-warn/40 bg-semantic-warn/10">
      <p className="text-body font-semibold text-semantic-warn">Supabase isn't configured yet</p>
      <p className="mt-1 text-caption text-text-secondary">
        Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{" "}
        <code>.env.local</code> to enable auth, rooms, and realtime play. See the README.
      </p>
    </Card>
  );
}
