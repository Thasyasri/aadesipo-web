import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { NewGameSetup } from "./NewGameSetup";
import { ResumeGamesList } from "./ResumeGamesList";
import { isSupabaseConfigured } from "@/services/supabase";

export function HomeScreen() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}
      <ResumeGamesList />
      <NewGameSetup />
    </div>
  );
}
