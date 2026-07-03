import nextDynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { getNotes, getSections } from "@/lib/canvas-data";
import { timeAsync } from "@/lib/perf";

const CanvasBoard = nextDynamic(() =>
  import("@/components/canvas/CanvasBoard").then((mod) => mod.CanvasBoard)
);

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  return timeAsync("initial /canvas data loading", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [notes, sections] = await Promise.all([getNotes(), getSections()]);

    return <CanvasBoard initialNotes={notes} initialSections={sections} userEmail={user?.email ?? ""} />;
  });
}
