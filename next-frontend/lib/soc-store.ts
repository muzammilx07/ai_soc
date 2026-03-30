"use client";

import { create } from "zustand";

import {
  apiDelete,
  apiGet,
  apiPost,
  getWsBase,
  type AlertItem,
  type InstanceCreatePayload,
  type InstanceItem,
  type IncidentItem,
  type LiveEvent,
  type ResponseLogItem,
} from "@/lib/api";

type SocketStatus = "connecting" | "open" | "closed";

type SocConnectionMessage = {
  type: "connection";
  status: string;
  channels: string[];
  path: string;
};

type SocUpdateMessage = {
  type: "soc_update";
  timestamp: string;
  instance_id?: string;
  event?: Record<string, unknown>;
  alert?: Record<string, unknown>;
  incident?: Record<string, unknown>;
  response?: Record<string, unknown>;
};

type SocRealtimeMessage = SocConnectionMessage | SocUpdateMessage;

type CreateInstanceInput = InstanceCreatePayload;

const MAX_EVENTS = 5000;
const MAX_RESPONSES = 1000;
const LIVE_BACKFILL_LIMIT = 500;
const LIMIT_REACHED_MESSAGE_PREFIX = "Live stream paused at max limit";

let socketRef: WebSocket | null = null;

function logReconnectTrace(step: string, details?: Record<string, unknown>): void {
  if (typeof window === "undefined") {
    return;
  }
  if (details) {
    console.log(`[SOC][reconnect] ${step}`, details);
    return;
  }
  console.log(`[SOC][reconnect] ${step}`);
}

function buildQuery(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return query ? `?${query}` : "";
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeMode(mode: string): string {
  const lower = String(mode || "").toLowerCase();
  if (lower === "realtime") {
    return "hybrid";
  }
  return lower || "hybrid";
}

function getLiveMaxLimitConfig(): { enabled: boolean; maxEvents: number } {
  if (typeof window === "undefined") {
    return { enabled: true, maxEvents: 300 };
  }

  const savedEnabled =
    window.localStorage.getItem("soc.live.max.enabled") ??
    window.localStorage.getItem("soc.live.rate.enabled");
  const savedCount =
    window.localStorage.getItem("soc.live.max.count") ??
    window.localStorage.getItem("soc.live.rate.limitPerMin");

  const enabled = savedEnabled !== "false";
  const parsed = Number(savedCount);
  const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 300;
  const maxEvents = Math.max(20, Math.min(5000, normalized));

  return { enabled, maxEvents };
}

function buildLimitReachedMessage(maxEvents: number): string {
  return `${LIMIT_REACHED_MESSAGE_PREFIX} (${maxEvents}). Increase Max Events limit and click Reconnect.`;
}

function isLimitReachedMessage(value: string): boolean {
  return value.startsWith(LIMIT_REACHED_MESSAGE_PREFIX);
}

function mergeSyncError(current: string, nextSyncError: string): string {
  const syncPrefix = "Scoped sync warning:";
  if (nextSyncError) {
    return nextSyncError;
  }
  if (current.startsWith(syncPrefix)) {
    return "";
  }
  return current;
}

function normalizeLiveEvent(event: Record<string, unknown>, timestamp: string): LiveEvent {
  const detection =
    typeof event.detection === "object" && event.detection !== null
      ? (event.detection as Record<string, unknown>)
      : null;
  const metadata =
    typeof event.metadata === "object" && event.metadata !== null
      ? (event.metadata as Record<string, unknown>)
      : null;

  const sourceIp = asString(event.source_ip || event.ip || metadata?.source_ip || metadata?.src_ip || "");
  const destinationIp = asString(
    event.destination_ip || metadata?.destination_ip || metadata?.dst_ip || ""
  );
  const attackType = asString(
    event.attack_type || event.event_type || detection?.attack_type || "unknown",
    "unknown"
  );
  const severity = asString(event.severity || detection?.severity || "unknown", "unknown");
  const confidence = asNumber(event.confidence ?? detection?.confidence);

  return {
    timestamp: asString(event.timestamp, timestamp),
    source_ip: sourceIp || undefined,
    destination_ip: destinationIp || undefined,
    attack_type: attackType,
    severity,
    confidence: confidence ?? undefined,
    ...event,
  };
}

function upsertAlert(alerts: AlertItem[], next: AlertItem): AlertItem[] {
  const existingIndex = alerts.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [next, ...alerts].slice(0, 1000);
  }

  const cloned = [...alerts];
  cloned[existingIndex] = { ...cloned[existingIndex], ...next };
  cloned.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return cloned.slice(0, 1000);
}

function upsertIncident(incidents: IncidentItem[], next: IncidentItem): IncidentItem[] {
  const existingIndex = incidents.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [next, ...incidents].slice(0, 1000);
  }

  const cloned = [...incidents];
  cloned[existingIndex] = { ...cloned[existingIndex], ...next };
  cloned.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return cloned.slice(0, 1000);
}

function normalizeAlert(
  messageAlert: Record<string, unknown> | undefined,
  messageEvent: Record<string, unknown> | undefined,
  timestamp: string
): AlertItem | null {
  if (!messageAlert || !messageEvent) {
    return null;
  }

  const idValue = asNumber(messageAlert.id);
  if (idValue === null) {
    return null;
  }

  const detection =
    typeof messageEvent.detection === "object" && messageEvent.detection !== null
      ? (messageEvent.detection as Record<string, unknown>)
      : null;
  const metadata =
    typeof messageEvent.metadata === "object" && messageEvent.metadata !== null
      ? (messageEvent.metadata as Record<string, unknown>)
      : null;

  return {
    id: idValue,
    status: asString(messageAlert.status, "open"),
    severity: asString(messageAlert.severity || detection?.severity || "medium", "medium"),
    attack_type: asString(
      detection?.attack_type || messageEvent.attack_type || messageEvent.event_type || "unknown",
      "unknown"
    ),
    source_ip: asString(messageEvent.ip || messageEvent.source_ip || metadata?.source_ip || "") || null,
    destination_ip:
      asString(messageEvent.destination_ip || metadata?.destination_ip || metadata?.dst_ip || "") || null,
    confidence: asNumber(detection?.confidence) ?? null,
    created_at: timestamp,
  };
}

function normalizeResponse(
  responsePayload: Record<string, unknown> | undefined,
  alertPayload: Record<string, unknown> | undefined,
  timestamp: string
): ResponseLogItem | null {
  if (!responsePayload) {
    return null;
  }

  const random = Math.floor(Math.random() * 100000);
  const id = asNumber(responsePayload.id) ?? Number(`${Date.now()}${random}`);
  const alertId = asString(alertPayload?.id, "-");

  return {
    id,
    action: asString(responsePayload.action, "unknown"),
    target: `alert:${alertId}`,
    status: asString(responsePayload.status, "unknown"),
    created_at: timestamp,
  };
}

function normalizeIncident(
  incidentPayload: Record<string, unknown> | undefined,
  eventPayload: Record<string, unknown> | undefined,
  timestamp: string,
): IncidentItem | null {
  if (!incidentPayload) {
    return null;
  }

  const idValue = asNumber(incidentPayload.id);
  if (idValue === null) {
    return null;
  }

  const attackType = asString(eventPayload?.attack_type || eventPayload?.event_type || "Unknown", "Unknown");
  const severity = asString(incidentPayload.severity || eventPayload?.severity || "high", "high");

  return {
    id: idValue,
    status: asString(incidentPayload.status, "open"),
    severity,
    title: asString(incidentPayload.title, `${String(severity).toUpperCase()} incident: ${attackType}`),
    description: asString(incidentPayload.description, ""),
    created_at: asString(incidentPayload.created_at, timestamp),
  };
}

type SocStoreState = {
  instances: InstanceItem[];
  currentInstance: InstanceItem | null;
  selectedInstanceId: string;
  selectedApiKey: string;
  selectedIngestionMode: string;
  events: LiveEvent[];
  alerts: AlertItem[];
  incidents: IncidentItem[];
  responses: ResponseLogItem[];
  totalEventsCount: number;
  livePausedByLimit: boolean;
  socketStatus: SocketStatus;
  queueBackend: string;
  initialized: boolean;
  loading: boolean;
  error: string;
  initialize: () => Promise<void>;
  refreshInstances: () => Promise<void>;
  refreshScopedData: () => Promise<void>;
  refreshLiveEvents: (limit?: number) => Promise<void>;
  enforceLiveLimitNow: () => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  reconnectWebSocket: () => void;
  setInstanceSelection: (instanceId: string, apiKey: string) => Promise<void>;
  setInstanceFromRoute: (instanceId: string) => Promise<void>;
  createInstance: (payload: CreateInstanceInput) => Promise<InstanceItem>;
  deleteInstance: (instanceId: string) => Promise<void>;
  hasInstanceSelected: () => boolean;
  applyRealtimeMessage: (message: SocRealtimeMessage) => void;
};

async function loadScopedData(instanceId: string): Promise<{
  alerts: AlertItem[] | null;
  incidents: IncidentItem[] | null;
  responses: ResponseLogItem[] | null;
  syncError: string;
}> {
  const query = buildQuery({ instance_id: instanceId });
  const [alertsResult, incidentsResult, responsesResult] = await Promise.allSettled([
    apiGet<AlertItem[]>(`/alerts${query}`),
    apiGet<IncidentItem[]>(`/incidents${query}`),
    apiGet<ResponseLogItem[]>(`/response/logs${query}`),
  ]);

  const errors: string[] = [];

  const alerts =
    alertsResult.status === "fulfilled"
      ? alertsResult.value
      : (errors.push(`alerts: ${alertsResult.reason instanceof Error ? alertsResult.reason.message : "request failed"}`), null);

  const incidents =
    incidentsResult.status === "fulfilled"
      ? incidentsResult.value
      : (errors.push(`incidents: ${incidentsResult.reason instanceof Error ? incidentsResult.reason.message : "request failed"}`), null);

  const responses =
    responsesResult.status === "fulfilled"
      ? responsesResult.value
      : (errors.push(`response logs: ${responsesResult.reason instanceof Error ? responsesResult.reason.message : "request failed"}`), null);

  return {
    alerts,
    incidents,
    responses,
    syncError: errors.length ? `Scoped sync warning: ${errors.join(" | ")}` : "",
  };
}

export const useSocStore = create<SocStoreState>((set, get) => ({
  instances: [],
  currentInstance: null,
  selectedInstanceId: "",
  selectedApiKey: "",
  selectedIngestionMode: "hybrid",
  events: [],
  alerts: [],
  incidents: [],
  responses: [],
  totalEventsCount: 0,
  livePausedByLimit: false,
  socketStatus: "closed",
  queueBackend: "websocket",
  initialized: false,
  loading: false,
  error: "",

  initialize: async () => {
    if (get().loading) {
      return;
    }

    set({ loading: true, error: "" });
    try {
      const instances = await apiGet<InstanceItem[]>("/instances");
      const savedInstanceId = window.localStorage.getItem("soc.instance.id") || "";
      const savedApiKey = window.localStorage.getItem("soc.instance.apiKey") || "";
      const matching = instances.find((item) => item.instance_id === savedInstanceId);

      if (!matching) {
        set({
          instances,
          currentInstance: null,
          selectedInstanceId: "",
          selectedApiKey: "",
          selectedIngestionMode: "hybrid",
          events: [],
          alerts: [],
          incidents: [],
          responses: [],
          totalEventsCount: 0,
          livePausedByLimit: false,
          initialized: true,
          loading: false,
        });
        return;
      }

      const scoped = await loadScopedData(matching.instance_id);
      const selectedApiKey = matching.api_key || savedApiKey;
      window.localStorage.setItem("soc.instance.id", matching.instance_id);
      window.localStorage.setItem("soc.instance.apiKey", selectedApiKey);
      set({
        instances,
        currentInstance: matching,
        selectedInstanceId: matching.instance_id,
        selectedApiKey,
        selectedIngestionMode: normalizeMode(matching.ingestion_mode),
        alerts: scoped.alerts || [],
        incidents: scoped.incidents || [],
        responses: scoped.responses || [],
        events: [],
        totalEventsCount: 0,
        livePausedByLimit: false,
        error: scoped.syncError,
        initialized: true,
        loading: false,
      });
      void get().refreshLiveEvents();
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load SOC data",
      });
    }
  },

  refreshInstances: async () => {
    const instances = await apiGet<InstanceItem[]>("/instances");
    const selected = get().selectedInstanceId;
    const matching = instances.find((item) => item.instance_id === selected) || null;
    set({
      instances,
      currentInstance: matching,
      selectedIngestionMode: matching ? normalizeMode(matching.ingestion_mode) : "hybrid",
    });
  },

  refreshScopedData: async () => {
    const instanceId = get().selectedInstanceId;
    if (!instanceId) {
      return;
    }

    const scoped = await loadScopedData(instanceId);
    set((state) => ({
      alerts: scoped.alerts ?? state.alerts,
      incidents: scoped.incidents ?? state.incidents,
      responses: scoped.responses ?? state.responses,
      error: mergeSyncError(state.error, scoped.syncError),
    }));
  },

  refreshLiveEvents: async (limit = LIVE_BACKFILL_LIMIT) => {
    const instanceId = get().selectedInstanceId;
    if (!instanceId) {
      logReconnectTrace("refreshLiveEvents skipped: no instance selected");
      return;
    }

    const currentState = get();
    const maxLimitConfig = getLiveMaxLimitConfig();
    const limitReached = maxLimitConfig.enabled && currentState.totalEventsCount >= maxLimitConfig.maxEvents;
    if (currentState.livePausedByLimit && limitReached) {
      const message = buildLimitReachedMessage(maxLimitConfig.maxEvents);
      set({ socketStatus: "closed", error: message });
      logReconnectTrace("refreshLiveEvents blocked: paused by max limit", {
        instanceId,
        totalEventsCount: currentState.totalEventsCount,
        maxEvents: maxLimitConfig.maxEvents,
      });
      return;
    }

    if (currentState.livePausedByLimit && !limitReached) {
      set({
        livePausedByLimit: false,
        error: isLimitReachedMessage(currentState.error) ? "" : currentState.error,
      });
    }

    const maxAllowed = maxLimitConfig.enabled ? maxLimitConfig.maxEvents : LIVE_BACKFILL_LIMIT;
    const safeLimit = Math.max(1, Math.min(LIVE_BACKFILL_LIMIT, maxAllowed, Math.floor(limit)));
    const query = buildQuery({ instance_id: instanceId, limit: String(safeLimit) });
    logReconnectTrace("refreshLiveEvents request", { instanceId, limit: safeLimit });

    try {
      const data = await apiGet<{ queue_backend?: string; count?: number; total_count?: number; events?: LiveEvent[] }>(
        `/logs/live${query}`,
      );

      const serverCount =
        typeof data.total_count === "number" ? data.total_count : typeof data.count === "number" ? data.count : 0;
      const cappedCount = maxLimitConfig.enabled ? Math.min(serverCount, maxLimitConfig.maxEvents) : serverCount;
      const cappedEvents = Array.isArray(data.events)
        ? data.events.slice(0, maxLimitConfig.enabled ? maxLimitConfig.maxEvents : LIVE_BACKFILL_LIMIT)
        : [];

      set({
        events: cappedEvents,
        totalEventsCount: cappedCount,
        livePausedByLimit: maxLimitConfig.enabled && cappedCount >= maxLimitConfig.maxEvents,
        queueBackend: typeof data.queue_backend === "string" ? data.queue_backend : get().queueBackend,
      });

      logReconnectTrace("refreshLiveEvents response", {
        instanceId,
        count: data.count,
        totalCount: data.total_count,
        queueBackend: data.queue_backend,
        bufferedEvents: cappedEvents.length,
        cappedCount,
      });
    } catch (error) {
      logReconnectTrace("refreshLiveEvents failed", {
        instanceId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
  },

  enforceLiveLimitNow: () => {
    const maxLimitConfig = getLiveMaxLimitConfig();
    const limitReachedMessage = buildLimitReachedMessage(maxLimitConfig.maxEvents);
    let shouldDisconnectForLimit = false;

    set((state) => {
      const nextEvents = maxLimitConfig.enabled
        ? state.events.slice(0, maxLimitConfig.maxEvents)
        : state.events.slice(0, MAX_EVENTS);
      const nextCountBase = Math.max(state.totalEventsCount, nextEvents.length);
      const nextTotalEventsCount = maxLimitConfig.enabled
        ? Math.min(nextCountBase, maxLimitConfig.maxEvents)
        : nextCountBase;
      const limitReached = maxLimitConfig.enabled && nextTotalEventsCount >= maxLimitConfig.maxEvents;

      if (limitReached) {
        shouldDisconnectForLimit = true;
      }

      return {
        events: nextEvents,
        totalEventsCount: nextTotalEventsCount,
        livePausedByLimit: limitReached,
        socketStatus: limitReached ? "closed" : state.socketStatus,
        error: limitReached
          ? limitReachedMessage
          : isLimitReachedMessage(state.error)
            ? ""
            : state.error,
      };
    });

    if (shouldDisconnectForLimit) {
      get().disconnectWebSocket();
      set({ error: limitReachedMessage, livePausedByLimit: true });
    }
  },

  connectWebSocket: () => {
    if (socketRef && (socketRef.readyState === WebSocket.CONNECTING || socketRef.readyState === WebSocket.OPEN)) {
      logReconnectTrace("connectWebSocket skipped: socket already active", {
        readyState: socketRef.readyState,
      });
      return;
    }

    const instanceId = get().selectedInstanceId;
    const apiKey = get().selectedApiKey;
    const maxLimitConfig = getLiveMaxLimitConfig();
    const totalEventsCount = get().totalEventsCount;
    if (!instanceId || !apiKey) {
      set({ socketStatus: "closed" });
      logReconnectTrace("connectWebSocket blocked: missing instance credentials", {
        instanceId,
        hasApiKey: Boolean(apiKey),
      });
      return;
    }

    if (maxLimitConfig.enabled && totalEventsCount >= maxLimitConfig.maxEvents) {
      const message = buildLimitReachedMessage(maxLimitConfig.maxEvents);
      set({ socketStatus: "closed", error: message, livePausedByLimit: true });
      logReconnectTrace("connectWebSocket blocked: max events limit reached", {
        instanceId,
        totalEventsCount,
        maxEvents: maxLimitConfig.maxEvents,
      });
      return;
    }

    set({ socketStatus: "connecting", error: "" });
    const socketQuery = buildQuery({ instance_id: instanceId, api_key: apiKey });
    logReconnectTrace("connectWebSocket opening", { instanceId });
    const socket = new WebSocket(`${getWsBase()}/soc/ws/live${socketQuery}`);
    socketRef = socket;

    socket.onopen = () => {
      set({ socketStatus: "open", error: "" });
      logReconnectTrace("websocket status transition", { from: "connecting", to: "open", instanceId });
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SocRealtimeMessage;
        get().applyRealtimeMessage(payload);
      } catch {
        set({ error: "Failed to parse live websocket payload" });
      }
    };

    socket.onerror = () => {
      set({ socketStatus: "closed", error: "Live stream connection error" });
      logReconnectTrace("websocket status transition", { from: "open|connecting", to: "closed", reason: "error", instanceId });
    };

    socket.onclose = () => {
      if (socketRef === socket) {
        socketRef = null;
      }
      set({ socketStatus: "closed" });
      logReconnectTrace("websocket status transition", { from: "open|connecting", to: "closed", reason: "close", instanceId });
    };
  },

  disconnectWebSocket: () => {
    if (socketRef) {
      logReconnectTrace("disconnectWebSocket closing active socket");
      socketRef.close();
      socketRef = null;
    }
    set({ socketStatus: "closed" });
    logReconnectTrace("websocket status transition", { to: "closed" });
  },

  reconnectWebSocket: () => {
    const before = get();
    const maxLimitConfig = getLiveMaxLimitConfig();

    if (maxLimitConfig.enabled && before.totalEventsCount >= maxLimitConfig.maxEvents) {
      const message = buildLimitReachedMessage(maxLimitConfig.maxEvents);
      set({ socketStatus: "closed", error: message, livePausedByLimit: true });
      logReconnectTrace("reconnectWebSocket blocked: max events limit reached", {
        instanceId: before.selectedInstanceId,
        totalEventsCount: before.totalEventsCount,
        maxEvents: maxLimitConfig.maxEvents,
      });
      return;
    }

    set({
      livePausedByLimit: false,
      error: isLimitReachedMessage(before.error) ? "" : before.error,
    });

    logReconnectTrace("reconnectWebSocket invoked", {
      instanceId: before.selectedInstanceId,
      socketStatus: before.socketStatus,
      alerts: before.alerts.length,
      incidents: before.incidents.length,
      bufferedEvents: before.events.length,
      sessionEvents: before.totalEventsCount,
    });
    get().disconnectWebSocket();
    void get().refreshLiveEvents();
    get().connectWebSocket();
    window.setTimeout(() => {
      const after = get();
      logReconnectTrace("reconnectWebSocket post-state", {
        instanceId: after.selectedInstanceId,
        socketStatus: after.socketStatus,
        alerts: after.alerts.length,
        incidents: after.incidents.length,
        bufferedEvents: after.events.length,
        sessionEvents: after.totalEventsCount,
      });
    }, 1200);
  },

  setInstanceSelection: async (instanceId: string, apiKey: string) => {
    let instances = get().instances;
    let selected = instances.find((item) => item.instance_id === instanceId) || null;

    if (!selected) {
      const refreshed = await apiGet<InstanceItem[]>("/instances");
      instances = refreshed;
      selected = refreshed.find((item) => item.instance_id === instanceId) || null;
      set({ instances: refreshed });
    }

    if (!selected && apiKey.trim()) {
      selected = {
        instance_id: instanceId,
        name: instanceId,
        api_key: apiKey,
        ingestion_mode: "hybrid",
        active: true,
        created_at: new Date().toISOString(),
      };
      set({ instances: [selected, ...instances] });
    }

    if (!selected) {
      throw new Error("Instance not found. Please refresh instances and try again.");
    }

    set({
      currentInstance: selected,
      selectedInstanceId: instanceId,
      selectedApiKey: apiKey || selected.api_key,
      selectedIngestionMode: normalizeMode(selected.ingestion_mode),
      alerts: [],
      incidents: [],
      responses: [],
      events: [],
      totalEventsCount: 0,
      livePausedByLimit: false,
      error: "",
    });

    const selectedApiKey = apiKey || selected.api_key;
    window.localStorage.setItem("soc.instance.id", instanceId);
    window.localStorage.setItem("soc.instance.apiKey", selectedApiKey);

    const scoped = await loadScopedData(instanceId);
    set((state) => ({
      alerts: scoped.alerts ?? state.alerts,
      incidents: scoped.incidents ?? state.incidents,
      responses: scoped.responses ?? state.responses,
      error: mergeSyncError(state.error, scoped.syncError),
    }));
    get().reconnectWebSocket();
  },

  setInstanceFromRoute: async (instanceId: string) => {
    if (!instanceId) {
      return;
    }

    if (get().selectedInstanceId === instanceId && get().selectedApiKey) {
      return;
    }

    const instances = get().instances.length ? get().instances : await apiGet<InstanceItem[]>("/instances");
    const selected = instances.find((item) => item.instance_id === instanceId);
    if (!selected) {
      throw new Error("Instance not found");
    }

    await get().setInstanceSelection(instanceId, selected.api_key);
    set({ instances });
  },

  createInstance: async (payload: CreateInstanceInput) => {
    const created = await apiPost<InstanceItem>("/instances", payload);
    await get().refreshInstances();
    return created;
  },

  deleteInstance: async (instanceId: string) => {
    await apiDelete<{ instance_id: string; deleted: boolean }>(`/instances/${encodeURIComponent(instanceId)}`);
    const isCurrent = get().selectedInstanceId === instanceId;

    await get().refreshInstances();

    if (isCurrent) {
      get().disconnectWebSocket();
      window.localStorage.removeItem("soc.instance.id");
      window.localStorage.removeItem("soc.instance.apiKey");
      set({
        currentInstance: null,
        selectedInstanceId: "",
        selectedApiKey: "",
        selectedIngestionMode: "hybrid",
        events: [],
        alerts: [],
        incidents: [],
        responses: [],
        totalEventsCount: 0,
        livePausedByLimit: false,
      });
    }
  },

  hasInstanceSelected: () => {
    return Boolean(get().selectedInstanceId && get().selectedApiKey);
  },

  applyRealtimeMessage: (message: SocRealtimeMessage) => {
    if (message.type === "connection") {
      set({ socketStatus: message.status === "connected" ? "open" : "connecting" });
      logReconnectTrace("websocket connection payload", {
        status: message.status,
        channels: message.channels,
        path: message.path,
      });
      return;
    }

    if (message.type !== "soc_update") {
      return;
    }

    if (get().socketStatus !== "open") {
      set({ socketStatus: "open" });
    }

    const selectedInstanceId = get().selectedInstanceId;
    const messageInstanceId = asString(message.instance_id, "");
    if (!selectedInstanceId || messageInstanceId !== selectedInstanceId) {
      logReconnectTrace("soc_update ignored due to instance mismatch", {
        selectedInstanceId,
        messageInstanceId,
      });
      return;
    }

    const ts = asString(message.timestamp, new Date().toISOString());
    const messageEvent =
      typeof message.event === "object" && message.event !== null
        ? (message.event as Record<string, unknown>)
        : {};
    const messageAlert =
      typeof message.alert === "object" && message.alert !== null
        ? (message.alert as Record<string, unknown>)
        : undefined;
    const messageResponse =
      typeof message.response === "object" && message.response !== null
        ? (message.response as Record<string, unknown>)
        : undefined;
    const messageIncident =
      (typeof message.incident === "object" && message.incident !== null
        ? (message.incident as Record<string, unknown>)
        : undefined) ||
      (typeof messageEvent.incident === "object" && messageEvent.incident !== null
        ? (messageEvent.incident as Record<string, unknown>)
        : undefined);

    const nextEvent = normalizeLiveEvent(messageEvent, ts);
    const nextAlert = normalizeAlert(messageAlert, messageEvent, ts);
    const nextResponse = normalizeResponse(messageResponse, messageAlert, ts);
    const nextIncident = normalizeIncident(messageIncident, messageEvent, ts);
    const maxLimitConfig = getLiveMaxLimitConfig();
    const limitReachedMessage = buildLimitReachedMessage(maxLimitConfig.maxEvents);
    let shouldDisconnectForLimit = false;

    set((state) => {
      if (maxLimitConfig.enabled && state.totalEventsCount >= maxLimitConfig.maxEvents) {
        logReconnectTrace("soc_update skipped: max events limit reached", {
          instanceId: selectedInstanceId,
          totalEventsCount: state.totalEventsCount,
          maxEvents: maxLimitConfig.maxEvents,
        });
        shouldDisconnectForLimit = true;
        return {
          ...state,
          livePausedByLimit: true,
          socketStatus: "closed",
          error: limitReachedMessage,
        };
      }

      const nextAlerts = nextAlert ? upsertAlert(state.alerts, nextAlert) : state.alerts;
      const nextIncidents = nextIncident ? upsertIncident(state.incidents, nextIncident) : state.incidents;
      const nextResponses = nextResponse
        ? [nextResponse, ...state.responses].slice(0, MAX_RESPONSES)
        : state.responses;
      const nextTotalEventsCount = state.totalEventsCount + 1;
      if (maxLimitConfig.enabled && nextTotalEventsCount >= maxLimitConfig.maxEvents) {
        shouldDisconnectForLimit = true;
      }

      logReconnectTrace("soc_update applied", {
        instanceId: selectedInstanceId,
        alertsBefore: state.alerts.length,
        alertsAfter: nextAlerts.length,
        incidentsBefore: state.incidents.length,
        incidentsAfter: nextIncidents.length,
        sessionEventsBefore: state.totalEventsCount,
        sessionEventsAfter: nextTotalEventsCount,
      });

      return {
        events: [nextEvent, ...state.events].slice(0, maxLimitConfig.enabled ? maxLimitConfig.maxEvents : MAX_EVENTS),
        alerts: nextAlerts,
        incidents: nextIncidents,
        responses: nextResponses,
        totalEventsCount: nextTotalEventsCount,
        livePausedByLimit: shouldDisconnectForLimit ? true : state.livePausedByLimit,
        socketStatus: shouldDisconnectForLimit ? "closed" : state.socketStatus,
        error: shouldDisconnectForLimit ? limitReachedMessage : state.error,
      };
    });

    if (shouldDisconnectForLimit) {
      get().disconnectWebSocket();
      set({ error: limitReachedMessage });
    }
  },
}));
