/** Keep sign-in destinations inside the app and preserve their query/hash. */
export function safeAuthReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/feed';
  try {
    const url = new URL(value, 'https://agorax.invalid');
    if (url.origin !== 'https://agorax.invalid' || url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return '/feed';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/feed';
  }
}
