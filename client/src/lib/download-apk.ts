/**
 * Download the Android APK via the authenticated endpoint, saving it under
 * the server-provided (versioned) filename so users can tell builds apart.
 * Returns "ok" | "unavailable" | "failed" for the caller's toast.
 */
export async function downloadApk(): Promise<"ok" | "unavailable" | "failed"> {
  try {
    const res = await fetch("/api/android/download");
    if (res.status === 404) return "unavailable";
    if (!res.ok) return "failed";
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const disposition = res.headers.get("content-disposition") ?? "";
    a.download = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "agorax.apk";
    a.click();
    URL.revokeObjectURL(url);
    return "ok";
  } catch {
    return "failed";
  }
}
