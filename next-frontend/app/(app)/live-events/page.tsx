"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Card, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { getWsBase, type LiveEvent, type SocSocketPayload } from "@/lib/api";

function getSeverityCount(events: LiveEvent[], severity: string): number {
  return events.filter((event) => String(event.severity || "").toLowerCase() === severity).length;
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [totalEventsCount, setTotalEventsCount] = useState(0);
  const [maxLimitEnabled, setMaxLimitEnabled] = useState(true);
  const [maxEvents, setMaxEvents] = useState(300);
  const [queueBackend, setQueueBackend] = useState<string>("websocket");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCapped, setIsCapped] = useState(false);
  const [socketPausedByLimit, setSocketPausedByLimit] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [reconnectTick, setReconnectTick] = useState(0);

  const isCappedRef = useRef(false);
  const maxLimitEnabledRef = useRef(maxLimitEnabled);
  const maxEventsRef = useRef(maxEvents);
  const totalEventsCountRef = useRef(totalEventsCount);
  const socketPausedByLimitRef = useRef(socketPausedByLimit);

  useEffect(() => {
    maxLimitEnabledRef.current = maxLimitEnabled;
  }, [maxLimitEnabled]);

  useEffect(() => {
    maxEventsRef.current = maxEvents;
  }, [maxEvents]);

  useEffect(() => {
    isCappedRef.current = isCapped;
  }, [isCapped]);

  useEffect(() => {
    totalEventsCountRef.current = totalEventsCount;
  }, [totalEventsCount]);

  useEffect(() => {
    socketPausedByLimitRef.current = socketPausedByLimit;
  }, [socketPausedByLimit]);

  useEffect(() => {
    const syncSettings = () => {
      const savedLimitEnabled =
        window.localStorage.getItem("soc.live.max.enabled") ?? window.localStorage.getItem("soc.live.rate.enabled");
      const savedLimitCount =
        window.localStorage.getItem("soc.live.max.count") ?? window.localStorage.getItem("soc.live.rate.limitPerMin");

      const enabled = savedLimitEnabled !== "false";
      setMaxLimitEnabled(enabled);

      let normalized = maxEventsRef.current;
      if (savedLimitCount) {
        const parsed = Number(savedLimitCount);
        if (Number.isFinite(parsed) && parsed > 0) {
          normalized = Math.max(20, Math.min(5000, Math.floor(parsed)));
          setMaxEvents(normalized);
        }
      }

      if (socketPausedByLimitRef.current && (!enabled || normalized > totalEventsCountRef.current)) {
        setSocketPausedByLimit(false);
        socketPausedByLimitRef.current = false;
        setIsCapped(false);
        isCappedRef.current = false;
        setReconnectTick((value) => value + 1);
      }
    };

    syncSettings();
    window.addEventListener("soc-live-settings-updated", syncSettings);
    return () => {
      window.removeEventListener("soc-live-settings-updated", syncSettings);
    };
  }, []);

  const connectSocket = (activeRef: { active: boolean }) => {
    const socket = new WebSocket(`${getWsBase()}/soc/ws/live`);

    socket.onopen = () => {
      if (!activeRef.active) {
        return;
      }
      setSocketStatus("open");
      setError("");
      setIsLoading(false);
    };

    socket.onmessage = (event) => {
      if (!activeRef.active) {
        return;
      }

      try {
        if (maxLimitEnabledRef.current && isCappedRef.current) {
          return;
        }

        const payload = JSON.parse(event.data) as SocSocketPayload;
        const incoming = payload.events || [];
        const incomingTotal = payload.total_count ?? payload.count ?? incoming.length;

        if (maxLimitEnabledRef.current && incomingTotal >= maxEventsRef.current) {
          setEvents(incoming.slice(0, maxEventsRef.current));
          setTotalEventsCount(maxEventsRef.current);
          setIsCapped(true);
          isCappedRef.current = true;
          setSocketPausedByLimit(true);
          socketPausedByLimitRef.current = true;
          socket.close();
          return;
        }

        setEvents(incoming);
        setTotalEventsCount(incomingTotal);
        setIsCapped(false);
        isCappedRef.current = false;

        if (payload.queue_backend) {
          setQueueBackend(payload.queue_backend);
        }
      } catch {
        setError("Failed to parse live stream payload");
      }
    };

    socket.onerror = () => {
      if (!activeRef.active) {
        return;
      }
      setSocketStatus("closed");
      setError("Live stream connection error");
      setIsLoading(false);
    };

    socket.onclose = () => {
      if (!activeRef.active) {
        return;
      }
      setSocketStatus("closed");
    };

    return socket;
  };

  useEffect(() => {
    if (socketPausedByLimit) {
      return;
    }

    const state = { active: true };
    isCappedRef.current = false;
    setIsCapped(false);
    const socket = connectSocket(state);

    return () => {
      state.active = false;
      socket.close();
    };
  }, [reconnectTick, socketPausedByLimit]);

  const critical = useMemo(() => getSeverityCount(events, "critical"), [events]);
  const high = useMemo(() => getSeverityCount(events, "high"), [events]);
  const medium = useMemo(() => getSeverityCount(events, "medium"), [events]);

  return (
    <div className="space-y-4">
      <Card title="Live Event Stream">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Events</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalEventsCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{critical}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{high}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Medium</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{medium}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label={socketStatus} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setSocketStatus("connecting");
              setError("");
              setSocketPausedByLimit(false);
              socketPausedByLimitRef.current = false;
              setReconnectTick((value) => value + 1);
            }}
          >
            Reconnect
          </Button>
          <p className="text-sm text-muted-foreground">Queue backend: {queueBackend}</p>
          <p className="text-sm text-muted-foreground">Window size: {events.length}</p>
          <p className="text-sm text-muted-foreground">Max Limit: {maxLimitEnabled ? `ON (${maxEvents})` : "OFF"}</p>
          <p className="text-sm text-muted-foreground">Capped: {isCapped ? "YES" : "NO"}</p>
          <p className="text-sm text-muted-foreground">Stream paused: {socketPausedByLimit ? "YES" : "NO"}</p>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading live events...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Card>

      <Card title="Recent Events (up to 500)">
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Source IP</TableHead>
                <TableHead>Destination IP</TableHead>
                <TableHead>Attack Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length ? (
                events.slice(0, 100).map((event, index) => (
                  <TableRow key={`${event.timestamp || "ts"}-${index}`}>
                    <TableCell>{String(event.timestamp || "-")}</TableCell>
                    <TableCell>{String(event.source_ip || "-")}</TableCell>
                    <TableCell>{String(event.destination_ip || "-")}</TableCell>
                    <TableCell>{String(event.attack_type || "Unknown")}</TableCell>
                    <TableCell>
                      <StatusBadge label={String(event.severity || "unknown")} />
                    </TableCell>
                    <TableCell>{typeof event.confidence === "number" ? event.confidence.toFixed(2) : "-"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No live events found yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
