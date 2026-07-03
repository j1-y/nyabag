import { redirect } from "next/navigation";
import { CapturesPageClient } from "@/components/captures/CapturesPageClient";
import { getCaptures } from "@/lib/captures/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const captures = await getCaptures(supabase, user.id);

  return <CapturesPageClient captures={captures} />;
}
