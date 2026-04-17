import type { UserRole } from "../auth/User";
import type { IEventRecord } from "../home/HomeRepository";

export function canManageEvent(
  event: IEventRecord,
  actorUserId: string,
  actorRole: UserRole,
): boolean {
  return actorRole === "admin" || event.organizerId === actorUserId;
}

export function canViewEvent(
  event: IEventRecord,
  actorUserId: string,
  actorRole: UserRole,
): boolean {
  if (event.status !== "draft") {
    return true;
  }

  return canManageEvent(event, actorUserId, actorRole);
}
