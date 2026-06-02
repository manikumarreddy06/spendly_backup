import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ENABLED } from "@/lib/config";
import type { SplitGroup } from "@/context/AppContext";

let supabase: ReturnType<typeof createClient> | null = null;
const activeChannels = new Map<string, RealtimeChannel>();

type SplitGroupsRow = {
  id: string;
  data: SplitGroup;
  updated_at: string;
};

function getClient() {
  if (!SUPABASE_ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return supabase;
}

export async function upsertGroup(group: SplitGroup): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await (client as any).from("split_groups").upsert({
      id: group.id,
      data: group,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[supabase] upsertGroup failed:", e);
  }
}

export async function fetchGroup(groupId: string): Promise<SplitGroup | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await (client as any)
      .from("split_groups")
      .select("data")
      .eq("id", groupId)
      .single();
    if (error || !data) return null;
    return data.data as SplitGroup;
  } catch (e) {
    console.warn("[supabase] fetchGroup failed:", e);
    return null;
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await (client as any).from("split_groups").delete().eq("id", groupId);
  } catch (e) {
    console.warn("[supabase] deleteGroup failed:", e);
  }
}

export function subscribeToGroup(
  groupId: string,
  onUpdate: (group: SplitGroup) => void
): () => void {
  let isUnsubscribed = false;
  let channel: RealtimeChannel | null = null;
  let reconnectTimeout: any = null;
  let reconnectDelay = 2000; // start with 2s

  const startSubscription = () => {
    if (isUnsubscribed) return;
    const client = getClient();
    if (!client) return;

    const existing = activeChannels.get(groupId);
    if (existing) {
      existing.unsubscribe();
      activeChannels.delete(groupId);
    }

    try {
      channel = client.channel(`group-${groupId}`);

      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "split_groups",
            filter: `id=eq.${groupId}`,
          },
          (payload) => {
            const newData = (payload.new as any)?.data as SplitGroup | undefined;
            if (newData) {
              onUpdate(newData);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            reconnectDelay = 2000; // reset delay on success
            console.log(`[supabase] Subscribed to group-${groupId}`);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[supabase] Realtime channel status "${status}" for group-${groupId}:`, err);
            if (!isUnsubscribed) {
              channel?.unsubscribe();
              activeChannels.delete(groupId);

              clearTimeout(reconnectTimeout);
              reconnectTimeout = setTimeout(() => {
                console.log(`[supabase] Reconnecting group-${groupId}...`);
                reconnectDelay = Math.min(reconnectDelay * 2, 30000); // cap at 30s
                startSubscription();
              }, reconnectDelay);
            }
          }
        });

      activeChannels.set(groupId, channel);
    } catch (e) {
      console.warn("[supabase] subscribeToGroup subscription setup failed:", e);
    }
  };

  startSubscription();

  return () => {
    isUnsubscribed = true;
    clearTimeout(reconnectTimeout);
    if (channel) {
      channel.unsubscribe();
      activeChannels.delete(groupId);
    }
  };
}

export function unsubscribeAll(): void {
  activeChannels.forEach((ch) => ch.unsubscribe());
  activeChannels.clear();
}
