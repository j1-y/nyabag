import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/profile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SemanticMemoryPanel } from "@/components/profile/SemanticMemoryPanel";
import { TelegramCapturePanel } from "@/components/profile/TelegramCapturePanel";
import { getTelegramConnection } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profile, telegramResult] = await Promise.all([
    getUserProfile(supabase, user),
    getTelegramConnection(),
  ]);

  const telegramState = telegramResult.success
    ? telegramResult.data
    : { configured: false, connection: null };

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <header className="profile-heading">
          <span>Account</span>
          <h1>Profile</h1>
          <p>Manage the details shown around your workspace.</p>
        </header>

        <ProfileForm profile={profile} />
        <SemanticMemoryPanel />
        <TelegramCapturePanel initial={telegramState} />
      </div>
    </main>
  );
}
