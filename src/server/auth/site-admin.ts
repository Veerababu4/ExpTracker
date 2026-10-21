import "server-only";

/**
 * The site admin looks after the whole site (e.g. turns receipts off when the database gets full). Not a family
 * role: it's whoever is listed in the ADMIN_USERNAMES setting (comma-separated usernames).
 */
export function isSiteAdmin(username: string): boolean {
  const admins = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(username.toLowerCase());
}
