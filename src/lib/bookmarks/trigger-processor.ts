import "server-only";

type TriggerResult = {
  success: boolean;
  error?: string;
  reason?: string;
};

export async function triggerBookmarkProcessor(): Promise<TriggerResult> {
  return {
    success: true,
    reason: "oracle-worker-polls-supabase",
  };
}
