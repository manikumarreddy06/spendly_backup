import { NativeModules, Platform } from "react-native";

/**
 * TypeScript wrapper for the Android TransactionDetectionModule native module.
 * Provides clean, typed access to notification-based transaction detection.
 */

const TransactionDetectionModule =
  Platform.OS === "android" ? NativeModules.TransactionDetectionModule : null;

export interface NativeDetectedTransaction {
  id: string;
  amount: number;
  merchant: string;
  transactionType: "debit" | "credit";
  sourceApp: string;
  rawText: string;
  detectedAt: number; // Unix timestamp in ms
  status: "pending";
}

/**
 * Check if transaction detection is available on this platform.
 */
export function isDetectionAvailable(): boolean {
  return Platform.OS === "android" && TransactionDetectionModule != null;
}

/**
 * Check if the user has granted Notification Listener permission.
 */
export async function isNotificationAccessEnabled(): Promise<boolean> {
  if (!TransactionDetectionModule) return false;
  try {
    return await TransactionDetectionModule.isNotificationListenerEnabled();
  } catch {
    return false;
  }
}

/**
 * Open the Android system Notification Access settings page.
 */
export function openNotificationAccessSettings(): void {
  if (!TransactionDetectionModule) return;
  TransactionDetectionModule.openNotificationListenerSettings();
}

/**
 * Fetch pending transactions detected by the native notification listener.
 */
export async function fetchNativeDetectedTransactions(): Promise<NativeDetectedTransaction[]> {
  if (!TransactionDetectionModule) return [];
  try {
    const json = await TransactionDetectionModule.getPendingTransactions();
    return JSON.parse(json) as NativeDetectedTransaction[];
  } catch (e) {
    console.warn("[transactionDetection] Failed to fetch native transactions:", e);
    return [];
  }
}

/**
 * Clear processed transaction IDs from native storage.
 */
export async function clearNativeTransactions(ids: string[]): Promise<void> {
  if (!TransactionDetectionModule || ids.length === 0) return;
  try {
    await TransactionDetectionModule.clearProcessedTransactions(ids);
  } catch (e) {
    console.warn("[transactionDetection] Failed to clear native transactions:", e);
  }
}

/**
 * Enable or disable the native transaction detection service.
 */
export async function setDetectionEnabled(enabled: boolean): Promise<void> {
  if (!TransactionDetectionModule) return;
  try {
    await TransactionDetectionModule.setEnabled(enabled);
  } catch (e) {
    console.warn("[transactionDetection] Failed to set enabled:", e);
  }
}

/**
 * Check if detection is currently enabled.
 */
export async function isDetectionEnabled(): Promise<boolean> {
  if (!TransactionDetectionModule) return false;
  try {
    return await TransactionDetectionModule.isEnabled();
  } catch {
    return false;
  }
}
