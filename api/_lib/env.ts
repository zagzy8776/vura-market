const required = ['DATABASE_URL'] as const;

let validated = false;

export function requireEnvironment() {
  if (validated) return;
  const missing = required.filter((key) => {
    const value = process.env[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  validated = true;
}

export function getEnvironment(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}


export function getOptionalEnvironment(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}
