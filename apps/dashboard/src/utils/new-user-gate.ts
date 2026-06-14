export const NEW_USER_CUTOFF = "2026-04-20T00:00:00.000Z";

export function isBlockedNewUser(createdAt: string | null | undefined) {
  if (process.env.MIDDAY_ALLOW_NEW_USERS === "true") return false;
  if (!createdAt) return false;
  return new Date(createdAt) >= new Date(NEW_USER_CUTOFF);
}
