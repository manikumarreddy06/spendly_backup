import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Escapes a cell value for CSV formatting.
 * Properly wraps values with commas, quotes, or line breaks in double quotes
 * and escapes existing double quotes as double double quotes.
 */
export function escapeCSVCell(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // If it is an Excel formula string wrapper like ="value", return as-is to preserve text formatting
  if (str.startsWith('="') && str.endsWith('"')) {
    return str;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface ExportFileOptions {
  content: string;
  filename: string;
  mimeType: string;
  dialogTitle?: string;
}

/**
 * Exports data as a file. Downloads automatically on Web and triggers
 * the native sharing sheet (file attachment) on iOS/Android.
 * Prepend UTF-8 BOM (\uFEFF) for Excel CSV compatibility if it's a CSV file.
 */
export async function exportFile({
  content,
  filename,
  mimeType,
  dialogTitle = "Export Data",
}: ExportFileOptions): Promise<void> {
  // Prepend Byte Order Mark (BOM) to CSV files so Microsoft Excel opens it in UTF-8
  const finalContent = mimeType === "text/csv" ? `\uFEFF${content}` : content;

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([finalContent], { type: `${mimeType};charset=utf-8;` });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      throw new Error(`Web download failed: ${e.message}`);
    }
  } else {
    // Mobile platforms
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      throw new Error("Sharing is not available on this device");
    }

    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    try {
      // Write the content to cache directory
      await FileSystem.writeAsStringAsync(fileUri, finalContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Open native OS share sheet with file attached
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle,
        UTI: mimeType === "text/csv" ? "public.comma-separated-values-text" : "public.json",
      });
    } catch (e: any) {
      throw new Error(`File export failed: ${e.message}`);
    }
  }
}
