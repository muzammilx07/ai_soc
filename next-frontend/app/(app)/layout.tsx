"use client";

import { Bell, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  StatusBadge,
} from "@/components/ui";
import { useSocStore } from "@/lib/soc-store";

type NotificationItem = {
  id: string;
  kind: "alert" | "incident";
  title: string;
  severity: string;
  status: string;
  createdAt: string;
  href: string;
};

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeInstanceId = searchParams.get("instance_id") || "";
  const { data } = useSession();
  const [openProfile, setOpenProfile] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const alerts = useSocStore((state) => state.alerts);
  const incidents = useSocStore((state) => state.incidents);
  const selectedInstanceId = useSocStore((state) => state.selectedInstanceId);
  const initialize = useSocStore((state) => state.initialize);
  const hasInstanceSelected = useSocStore((state) => state.hasInstanceSelected);
  const setInstanceFromRoute = useSocStore(
    (state) => state.setInstanceFromRoute,
  );
  const refreshScopedData = useSocStore((state) => state.refreshScopedData);
  const connectWebSocket = useSocStore((state) => state.connectWebSocket);
  const disconnectWebSocket = useSocStore((state) => state.disconnectWebSocket);

  useEffect(() => {
    let active = true;
    let syncTimer: ReturnType<typeof window.setInterval> | undefined;
    const boot = async () => {
      await initialize();
      if (!active) {
        return;
      }

      if (routeInstanceId) {
        try {
          await setInstanceFromRoute(routeInstanceId);
        } catch {
          router.replace("/instances");
          return;
        }
      }

      if (!hasInstanceSelected()) {
        router.replace("/instances");
        return;
      }

      connectWebSocket();
      try {
        await refreshScopedData();
      } catch {
        // Keep UI alive even if a background sync attempt fails.
      }
      syncTimer = window.setInterval(() => {
        void refreshScopedData();
      }, 5000);
    };
    void boot();
    return () => {
      active = false;
      if (syncTimer) {
        window.clearInterval(syncTimer);
      }
      disconnectWebSocket();
    };
  }, [
    connectWebSocket,
    disconnectWebSocket,
    hasInstanceSelected,
    initialize,
    refreshScopedData,
    routeInstanceId,
    router,
    setInstanceFromRoute,
  ]);

  const alertsCount = useMemo(
    () =>
      alerts.filter((item) => String(item.status).toLowerCase() === "open")
        .length,
    [alerts],
  );
  const incidentsCount = useMemo(
    () =>
      incidents.filter((item) => String(item.status).toLowerCase() === "open")
        .length,
    [incidents],
  );

  const notificationItems = useMemo<NotificationItem[]>(() => {
    const alertItems: NotificationItem[] = alerts.slice(0, 10).map((item) => ({
      id: `alert-${item.id}`,
      kind: "alert",
      title: item.attack_type || "Unknown attack",
      severity: item.severity,
      status: item.status,
      createdAt: item.created_at,
      href: `/alerts?instance_id=${encodeURIComponent(routeInstanceId || selectedInstanceId)}#alert-${item.id}`,
    }));

    const incidentItems: NotificationItem[] = incidents
      .slice(0, 10)
      .map((item) => ({
        id: `incident-${item.id}`,
        kind: "incident",
        title: item.title,
        severity: item.severity,
        status: item.status,
        createdAt: item.created_at,
        href: `/incidents?instance_id=${encodeURIComponent(routeInstanceId || selectedInstanceId)}#incident-${item.id}`,
      }));

    return [...alertItems, ...incidentItems]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 12);
  }, [alerts, incidents, routeInstanceId, selectedInstanceId]);

  const notificationSeenStorageKey = useMemo(
    () =>
      `soc.notifications.seenAt.${routeInstanceId || selectedInstanceId || "global"}`,
    [routeInstanceId, selectedInstanceId],
  );
  const [notificationSeenAt, setNotificationSeenAt] = useState<number>(0);

  useEffect(() => {
    const raw = window.localStorage.getItem(notificationSeenStorageKey);
    const parsed = Number(raw || "0");
    setNotificationSeenAt(Number.isFinite(parsed) ? parsed : 0);
  }, [notificationSeenStorageKey]);

  useEffect(() => {
    if (!openNotifications) {
      return;
    }
    const seenNow = Date.now();
    setNotificationSeenAt(seenNow);
    window.localStorage.setItem(notificationSeenStorageKey, String(seenNow));
  }, [openNotifications, notificationSeenStorageKey]);

  const unreadCount = useMemo(() => {
    return notificationItems.filter((item) => {
      const created = new Date(item.createdAt).getTime();
      return Number.isFinite(created) && created > notificationSeenAt;
    }).length;
  }, [notificationItems, notificationSeenAt]);

  const totalOpen = useMemo(
    () => alertsCount + incidentsCount,
    [alertsCount, incidentsCount],
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="min-h-screen flex-1">
        <div className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-6">
          <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3">
            <div>
              <strong className="text-sm font-semibold tracking-wide text-foreground lg:text-base">
                AI SOC Command Center
              </strong>
              <p className="text-xs text-muted-foreground">
                Unified Monitoring, Detection, and Automated Response
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/instances"
                className={
                  pathname.startsWith("/instances")
                    ? "rounded-md border border-border bg-primary/10 px-2 py-1 text-sm font-medium text-foreground"
                    : "rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                }
              >
                Instances
              </Link>
              <Link
                href="/"
                className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Home
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                className="relative"
                onClick={() => setOpenNotifications(true)}
              >
                <Bell size={15} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Button>
              <button
                type="button"
                onClick={() => setOpenProfile(true)}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 transition-colors hover:bg-muted"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {data?.user?.name?.[0] ?? "U"}
                </span>
                <span className="hidden pr-1 text-xs text-muted-foreground sm:block">
                  Profile
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-2xl p-4 lg:p-6">
          {children}
        </div>
      </main>

      <Dialog open={openProfile} onOpenChange={setOpenProfile}>
        <DialogContent className="max-w-sm">
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>Active SOC user context</DialogDescription>
          <p className="mt-3 text-sm text-foreground">
            {data?.user?.name ?? "Analyst"}
          </p>
          <p className="text-sm text-muted-foreground">
            {data?.user?.email ?? "guest@local"}
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Role:</span> SOC Analyst
            </p>
            <p>
              <span className="text-muted-foreground">Project:</span> AI SOC
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenProfile(false)}
            >
              Close
            </Button>
            <Button size="sm">
              <UserRound size={14} className="mr-1" />
              Dummy Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openNotifications} onOpenChange={setOpenNotifications}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            Open alerts and incidents with direct navigation
          </DialogDescription>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/45 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Open Alerts
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {alertsCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/45 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Open Incidents
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {incidentsCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/45 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Open
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {totalOpen}
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-105 space-y-2 overflow-y-auto pr-1">
            {notificationItems.length ? (
              notificationItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpenNotifications(false)}
                  className="block rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.kind === "incident" ? "Incident" : "Alert"}:{" "}
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {item.id} |{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge label={item.severity} />
                      <StatusBadge label={item.status} />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications available.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
