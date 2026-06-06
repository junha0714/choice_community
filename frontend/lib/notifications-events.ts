export const NOTIFICATIONS_CHANGED_EVENT = "choice-notifications-changed";

export function notifyNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
