import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SplitGroup, SplitExpense, LastDeletedItem } from "../AppContext";
import { SUPABASE_ENABLED } from "../../lib/config";
import {
  upsertGroup,
  fetchGroup,
  deleteGroup as deleteGroupRemote,
  subscribeToGroup,
  type SyncStatus,
} from "../../lib/supabase";
import {
  isSameMember,
  resolveMemberInGroup,
  isExpenseSettledFor,
} from "../../lib/split";

function genId(): string {
  let d = Date.now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
    d += performance.now();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function genAccessCode(): string {
  return `${genId()}${genId()}`.replace(/-/g, "");
}

export function parseGroupInviteCode(rawCode: string): { id: string; accessCode?: string } | null {
  const normalized = rawCode.trim();
  const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
  const uuidMatch = normalized.match(uuidRegex);
  if (!uuidMatch) return null;

  const afterUuid = normalized.slice(uuidMatch.index! + uuidMatch[0].length);
  const tokenMatch = afterUuid.match(/[:/#?\s-]*([0-9a-fA-F]{32,96})/);
  return {
    id: uuidMatch[0],
    accessCode: tokenMatch?.[1],
  };
}

export function useSplitState(
  setLastDeletedItem: (item: LastDeletedItem | null) => void,
  getBalances: (group: SplitGroup) => Record<string, number>,
  profileName: string | undefined
) {
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadSplitGroups = async () => {
      try {
        const stored = await AsyncStorage.getItem("split_groups");
        if (stored) {
          const parsedGroups: SplitGroup[] = JSON.parse(stored);
          let groupsModified = false;
          const groupsWithAccess = parsedGroups.map((group) => {
            if (group.accessCode) return group;
            groupsModified = true;
            return { ...group, accessCode: genAccessCode() };
          });
          setSplitGroups(groupsWithAccess);
          if (groupsModified) {
            await AsyncStorage.setItem("split_groups", JSON.stringify(groupsWithAccess));
          }
        }
      } catch (err) {
        console.warn("Failed to load split groups:", err);
      } finally {
        setLoaded(true);
      }
    };
    loadSplitGroups();
  }, []);

  const syncGroupToRemote = useCallback((group: SplitGroup) => {
    if (SUPABASE_ENABLED) {
      upsertGroup(group).catch(() => {});
    }
  }, []);

  const createSplitGroup = useCallback(async (name: string, members: string[]): Promise<SplitGroup> => {
    const newGroup: SplitGroup = {
      id: genId(),
      name,
      members,
      expenses: [],
      createdAt: new Date().toISOString(),
      accessCode: genAccessCode(),
    };

    setSplitGroups((prev) => {
      const updated = [newGroup, ...prev];
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });

    if (SUPABASE_ENABLED) {
      upsertGroup(newGroup).catch(() => {});
    }

    return newGroup;
  }, []);

  const deleteSplitGroup = useCallback(async (id: string) => {
    const group = splitGroups.find((g) => g.id === id);
    setSplitGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    if (SUPABASE_ENABLED) {
      deleteGroupRemote(id, group?.accessCode).catch(() => {});
    }
  }, [splitGroups]);

  const addSplitExpense = useCallback(async (groupId: string, data: Omit<SplitExpense, "id" | "settled">) => {
    // Validate shares sum to totalAmount
    if (data.splitMode === "custom" && data.customShares) {
      const sum = Object.values(data.customShares).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - data.totalAmount) > 1) {
        throw new Error(`Custom shares (${sum}) do not add up to total amount (${data.totalAmount})`);
      }
    }
    if (data.splitMode === "percentage" && data.customShares) {
      const sum = Object.values(data.customShares).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.5) {
        throw new Error(`Percentages must add up to 100. Got ${sum}`);
      }
    }
    if (data.splitMode === "shares" && data.customShares) {
      const sum = Object.values(data.customShares).reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        throw new Error("Total shares must be greater than zero");
      }
    }

    const newExp: SplitExpense = { ...data, id: genId(), settled: [] };
    setSplitGroups((prev) => {
      const updated = prev.map((g) =>
        g.id === groupId
          ? { ...g, expenses: [newExp, ...g.expenses] }
          : g
      );
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const deleteSplitExpense = useCallback(async (groupId: string, expenseId: string) => {
    const group = splitGroups.find((g) => g.id === groupId);
    if (group) {
      const item = group.expenses.find((e) => e.id === expenseId);
      if (item) {
        setLastDeletedItem({ type: "split", groupId, data: item });
      }
    }
    setSplitGroups((prev) => {
      const updated = prev.map((g) =>
        g.id === groupId
          ? { ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) }
          : g
      );
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [splitGroups, setLastDeletedItem, syncGroupToRemote]);

  const settleUp = useCallback(async (groupId: string, expenseId: string, member: string) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member.trim();
        const expenses = g.expenses.map((e) => {
          if (e.id !== expenseId) return e;
          const settled = e.settled.some((s) => isSameMember(s, canon, g.members))
            ? e.settled
            : [...e.settled, canon];
          return { ...e, settled };
        });
        return { ...g, expenses };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const settleAllDebtsBetween = useCallback(async (groupId: string, debtor: string, creditor: string, amount?: number) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const debtorCanon = resolveMemberInGroup(debtor, g.members) ?? debtor.trim();
        const creditorCanon = resolveMemberInGroup(creditor, g.members) ?? creditor.trim();

        const expenses = g.expenses.map((e) => {
          if (e.category === "settlement") return e;
          const payer = resolveMemberInGroup(e.paidBy, g.members) ?? e.paidBy;
          const involvesDebtor = e.splitAmong.some((m) => isSameMember(m, debtorCanon, g.members));
          const involvesCreditor = e.splitAmong.some((m) => isSameMember(m, creditorCanon, g.members));
          const shouldSettle =
            (isSameMember(payer, creditorCanon, g.members) && involvesDebtor) ||
            (isSameMember(payer, debtorCanon, g.members) && involvesCreditor);
          if (!shouldSettle) return e;
          const target = isSameMember(payer, creditorCanon, g.members) ? debtorCanon : creditorCanon;
          const settled = e.settled.some((s) => isSameMember(s, target, g.members))
            ? e.settled
            : [...e.settled, target];
          return { ...e, settled };
        });

        if (amount && amount > 0) {
          const settlementExp: SplitExpense = {
            id: genId(),
            description: `Settlement: ${debtorCanon} paid ${creditorCanon}`,
            totalAmount: amount,
            paidBy: debtorCanon,
            splitAmong: [creditorCanon],
            settled: [creditorCanon],
            date: new Date().toISOString(),
            splitMode: "equal",
            customShares: {},
            category: "settlement",
          };
          return { ...g, expenses: [settlementExp, ...expenses] };
        }

        return { ...g, expenses };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const addGroupMember = useCallback(async (groupId: string, member: string) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId || g.members.some((m) => isSameMember(m, member, g.members))) return g;
        return { ...g, members: [...g.members, member] };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const removeGroupMember = useCallback(async (groupId: string, member: string) => {
    let success = false;
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member;
        const balance = getBalances(g)[canon] ?? 0;
        if (Math.abs(balance) > 0.01) return g;
        success = true;
        return {
          ...g,
          members: g.members.filter((m) => !isSameMember(m, canon, g.members)),
        };
      });
      if (success) {
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        const syncedGroup = updated.find((g) => g.id === groupId);
        if (syncedGroup) syncGroupToRemote(syncedGroup);
      }
      return updated;
    });
    return success;
  }, [getBalances, syncGroupToRemote]);

  const refreshGroup = useCallback(async (groupId: string) => {
    if (!SUPABASE_ENABLED) return;
    const localGroup = splitGroups.find((g) => g.id === groupId);
    const remote = await fetchGroup(groupId, localGroup?.accessCode);
    if (remote) {
      const remoteWithAccess = remote.accessCode ? remote : { ...remote, accessCode: localGroup?.accessCode };
      setSplitGroups((prev) => {
        const updated = prev.map((g) => {
          if (g.id !== groupId) return g;
          const mergedExpensesMap = new Map<string, SplitExpense>();
          [...remoteWithAccess.expenses, ...g.expenses].forEach((e) => {
            const existing = mergedExpensesMap.get(e.id);
            if (existing) {
              const mergedSettled = [...new Set([...existing.settled, ...e.settled])];
              mergedExpensesMap.set(e.id, { ...existing, settled: mergedSettled });
            } else {
              mergedExpensesMap.set(e.id, e);
            }
          });
          const merged = Array.from(mergedExpensesMap.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          const combinedMembers = [...new Set([...remoteWithAccess.members, ...g.members])];
          return { ...g, ...remoteWithAccess, expenses: merged, members: combinedMembers };
        });
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        return updated;
      });
    }
  }, [splitGroups]);

  const joinGroupFromInvite = useCallback(async (inviteCode: string) => {
    const parsed = parseGroupInviteCode(inviteCode);
    if (!parsed) return null;

    const existing = splitGroups.find((g) => g.id === parsed.id);
    if (existing) return existing;

    if (SUPABASE_ENABLED) {
      const remote = await fetchGroup(parsed.id, parsed.accessCode);
      if (remote) {
        const remoteWithAccess = remote.accessCode ? remote : { ...remote, accessCode: parsed.accessCode };
        setSplitGroups((prev) => {
          if (prev.some((g) => g.id === parsed.id)) return prev;
          const updated = [remoteWithAccess, ...prev];
          AsyncStorage.setItem("split_groups", JSON.stringify(updated));
          return updated;
        });
        return remoteWithAccess;
      }
    }

    return null;
  }, [splitGroups]);

  // ── Real-time group subscriptions ────────────────────────────────────
  const unsubscribesRef = useRef<Map<string, () => void>>(new Map());
  const groupUpdateCallbacksRef = useRef<Map<string, (group: SplitGroup) => void>>(new Map());
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && SUPABASE_ENABLED) {
        setReconnectKey((k) => k + 1);
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!SUPABASE_ENABLED) return;

    const currentIds = new Set(splitGroups.map((g) => g.id));

    splitGroups.forEach((group) => {
      groupUpdateCallbacksRef.current.set(group.id, (remoteGroup: SplitGroup) => {
        setSplitGroups((prev) => {
          const updated = prev.map((g) => {
            if (g.id !== group.id) return g;
            const mergedExpensesMap = new Map<string, SplitExpense>();
            [...remoteGroup.expenses, ...g.expenses].forEach((e) => {
              const existing = mergedExpensesMap.get(e.id);
              if (existing) {
                const mergedSettled = [...new Set([...existing.settled, ...e.settled])];
                mergedExpensesMap.set(e.id, { ...e, ...existing, settled: mergedSettled });
              } else {
                mergedExpensesMap.set(e.id, e);
              }
            });
            const merged = Array.from(mergedExpensesMap.values()).sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const combinedMembers = [...new Set([...remoteGroup.members, ...g.members])];
            return {
              ...g,
              ...remoteGroup,
              accessCode: g.accessCode ?? remoteGroup.accessCode,
              expenses: merged,
              members: combinedMembers,
            };
          });
          AsyncStorage.setItem("split_groups", JSON.stringify(updated));
          return updated;
        });
      });
    });

    unsubscribesRef.current.forEach((unsub, id) => {
      if (!currentIds.has(id)) {
        try {
          unsub();
        } catch (e) {
          console.warn("[supabase] unsubscribe failed for group:", id, e);
        }
        unsubscribesRef.current.delete(id);
        groupUpdateCallbacksRef.current.delete(id);
      }
    });

    splitGroups.forEach((group) => {
      if (unsubscribesRef.current.has(group.id)) return;

      const unsub = subscribeToGroup(group.id, (remoteGroup: SplitGroup) => {
        const cb = groupUpdateCallbacksRef.current.get(group.id);
        if (cb) cb(remoteGroup);
      }, (status: SyncStatus) => {
        setSyncStatus((prev) => {
          if (prev[group.id] === status) return prev;
          return { ...prev, [group.id]: status };
        });
      });

      unsubscribesRef.current.set(group.id, unsub);
    });
  }, [splitGroups, reconnectKey]);

  useEffect(() => {
    return () => {
      if (SUPABASE_ENABLED) {
        unsubscribesRef.current.forEach((unsub) => {
          try {
            unsub();
          } catch (e) {
            console.warn("[supabase] unmount unsubscribe failed:", e);
          }
        });
        unsubscribesRef.current.clear();
      }
    };
  }, []);

  return {
    splitGroups,
    setSplitGroups,
    syncStatus,
    createSplitGroup,
    deleteSplitGroup,
    addSplitExpense,
    deleteSplitExpense,
    settleUp,
    settleAllDebtsBetween,
    addGroupMember,
    removeGroupMember,
    refreshGroup,
    joinGroupFromInvite,
    loaded,
  };
}
