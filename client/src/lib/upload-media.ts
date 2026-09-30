/**
 * Raw-body media/document upload used by the Media Studio and the
 * proposal form. Metadata travels in headers (the server reads
 * X-File-Name / X-Media-Title); the body is the file itself.
 */

export const DOCUMENT_ACCEPT = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain,.pdf,.doc,.docx,.odt,.txt';

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'agorax_csrf') return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Documents whose text the server can read (see readDocumentText). */
export const READABLE_DOCUMENT = /\.(docx|odt|pdf|txt)$/i;

async function sendFile<T>(file: File, url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  // Ensure CSRF cookie exists before sending.
  if (!readCsrfCookie()) {
    await fetch('/api/csrf', { credentials: 'include' }).catch(() => {});
  }
  const csrf = readCsrfCookie();
  const headers: Record<string, string> = {
    'Content-Type': file.type || 'application/octet-stream',
    'X-File-Name': encodeURIComponent(file.name),
    ...extraHeaders,
  };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: file,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const json = await res.json();
      msg = json.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return await res.json();
}

export async function uploadProposalFile<T = unknown>(
  file: File,
  uploadUrl: string,
  title: string,
): Promise<T> {
  return sendFile<T>(file, uploadUrl, { 'X-Media-Title': encodeURIComponent(title) });
}

/**
 * The text of a document, read on the server, for the proposal form to put
 * into the proposal. Throws with the server's reason when it cannot.
 */
export async function readDocumentText(file: File): Promise<string> {
  const { text } = await sendFile<{ text: string }>(file, '/api/proposals/document-text');
  return text;
}
