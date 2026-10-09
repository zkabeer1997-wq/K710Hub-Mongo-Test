/** True only when every host in a MongoDB connection string is this machine (never for mongodb+srv). */
export function isLocalMongoUri(value) {
  const text = String(value || '');
  if (/^mongodb\+srv:/i.test(text)) return false;
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(text);
  if (!m) return false;
  return m[1].split(',').every((hostPort) => {
    const host = hostPort.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  });
}
