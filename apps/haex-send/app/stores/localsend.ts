// stores/localsend.ts
import { eq } from "drizzle-orm";
import {
  LOCALSEND_EVENTS,
  type Device,
  type DeviceInfo,
  type ServerStatus,
  type LocalSendSettings,
  type PendingTransfer,
  type TransferProgress,
  type LocalSendFileInfo,
} from "@haex-space/vault-sdk";
import { haexSendSettings, type SelectHaexSendSettings } from "~/database/schemas";

// Completed transfer record
export interface CompletedTransfer {
  sessionId: string;
  direction: "incoming" | "outgoing";
  deviceAlias: string;
  files: Array<{ fileName: string; size: number }>;
  saveDir?: string;
  completedAt: number;
}

export const useLocalSendStore = defineStore("localsend", () => {
  const haexVaultStore = useHaexVaultStore();

  // State
  const isInitialized = ref(false);
  const deviceInfo = ref<DeviceInfo | null>(null);
  const serverStatus = ref<ServerStatus | null>(null);
  const settings = ref<LocalSendSettings | null>(null);
  const devices = ref<Device[]>([]);
  const pendingTransfers = ref<PendingTransfer[]>([]);
  const isScanning = ref(false);
  const isServerStarting = ref(false);

  // Active transfers tracking
  const activeTransfers = ref<Map<string, TransferProgress>>(new Map());

  // Completed transfers (persist in memory for this session)
  const completedTransfers = ref<CompletedTransfer[]>([]);

  // Auto-refresh interval
  let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;
  const AUTO_REFRESH_INTERVAL_MS = 10000; // 10 seconds

  // Start auto-refresh for device discovery
  const startAutoRefresh = () => {
    if (autoRefreshInterval) return; // Already running

    console.log("[LocalSend] Starting auto-refresh every", AUTO_REFRESH_INTERVAL_MS / 1000, "seconds");
    autoRefreshInterval = setInterval(async () => {
      try {
        await refreshDevicesAsync();
      } catch (error) {
        console.error("[LocalSend] Auto-refresh failed:", error);
      }
    }, AUTO_REFRESH_INTERVAL_MS);
  };

  // Stop auto-refresh
  const stopAutoRefresh = () => {
    if (autoRefreshInterval) {
      console.log("[LocalSend] Stopping auto-refresh");
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  };

  // Track pending transfer info for completion
  const pendingTransferInfo = ref<Map<string, { transfer: PendingTransfer; saveDir: string }>>(new Map());

  // Computed
  const isServerRunning = computed(() => serverStatus.value?.running ?? false);
  const deviceCount = computed(() => devices.value.length);
  const hasPendingTransfers = computed(() => pendingTransfers.value.length > 0);

  // Load settings from database
  const loadSettingsFromDbAsync = async (): Promise<SelectHaexSendSettings | null> => {
    const db = haexVaultStore.orm;
    if (!db) {
      console.warn("[LocalSend] Database not initialized, cannot load settings");
      return null;
    }

    const rows = await db.select().from(haexSendSettings).limit(1);
    return rows[0] ?? null;
  };

  // Save settings to database
  const saveSettingsToDbAsync = async (newSettings: LocalSendSettings) => {
    const db = haexVaultStore.orm;
    if (!db) {
      console.warn("[LocalSend] Database not initialized, cannot save settings");
      return;
    }

    console.log("[LocalSend] Saving settings to database:", newSettings);

    const existing = await loadSettingsFromDbAsync();
    if (existing) {
      console.log("[LocalSend] Updating existing settings row");
      await db.update(haexSendSettings)
        .set({
          alias: newSettings.alias,
          port: newSettings.port,
          autoAccept: newSettings.autoAccept,
          saveDirectory: newSettings.saveDirectory,
          requirePin: newSettings.requirePin,
          pin: newSettings.pin,
          showNotifications: newSettings.showNotifications,
        })
        .where(eq(haexSendSettings.id, existing.id));
    } else {
      console.log("[LocalSend] Inserting new settings row");
      await db.insert(haexSendSettings).values({
        id: "settings",
        alias: newSettings.alias,
        port: newSettings.port,
        autoAccept: newSettings.autoAccept,
        saveDirectory: newSettings.saveDirectory,
        requirePin: newSettings.requirePin,
        pin: newSettings.pin,
        showNotifications: newSettings.showNotifications,
      });
    }

    // Verify the save
    const saved = await loadSettingsFromDbAsync();
    console.log("[LocalSend] Settings after save:", saved);
  };

  // Initialize LocalSend
  const initializeAsync = async () => {
    if (isInitialized.value) return;

    try {
      console.log("[LocalSend] Initializing...");
      deviceInfo.value = await haexVaultStore.client.localsend.init();

      // Load settings from database first
      const dbSettings = await loadSettingsFromDbAsync();
      if (dbSettings) {
        console.log("[LocalSend] Loaded settings from database:", dbSettings);
        console.log("[LocalSend] dbSettings.showNotifications raw value:", dbSettings.showNotifications, "type:", typeof dbSettings.showNotifications);
        // Use database settings - booleans come as 0/1 from SQLite or boolean
        const showNotif = dbSettings.showNotifications;
        settings.value = {
          alias: dbSettings.alias ?? deviceInfo.value.alias,
          port: dbSettings.port ?? 53317,
          autoAccept: Boolean(dbSettings.autoAccept),
          saveDirectory: dbSettings.saveDirectory ?? null,
          requirePin: Boolean(dbSettings.requirePin),
          pin: dbSettings.pin ?? null,
          showNotifications: showNotif === null || showNotif === undefined ? true : Boolean(showNotif),
        };
        console.log("[LocalSend] Converted settings:", settings.value);
        // Sync to Tauri backend
        await haexVaultStore.client.localsend.setSettings(settings.value);
      } else {
        // Get default settings from Tauri backend
        settings.value = await haexVaultStore.client.localsend.getSettings();
        // Save to database
        await saveSettingsToDbAsync(settings.value);
      }

      serverStatus.value = await haexVaultStore.client.localsend.getServerStatus();

      // Setup event listeners
      setupEventListeners();

      // Initial device scan
      console.log("[LocalSend] Performing initial device scan...");
      await refreshDevicesAsync();

      // Start auto-refresh for device discovery
      startAutoRefresh();

      isInitialized.value = true;
      console.log("[LocalSend] Initialized:", deviceInfo.value);
    } catch (error) {
      console.error("[LocalSend] Failed to initialize:", error);
      throw error;
    }
  };

  // Setup event listeners
  const setupEventListeners = () => {
    const client = haexVaultStore.client;
    console.log("[LocalSend] Setting up event listeners...");
    console.log("[LocalSend] LOCALSEND_EVENTS:", LOCALSEND_EVENTS);

    // Device discovered
    client.on(LOCALSEND_EVENTS.deviceDiscovered, (event: unknown) => {
      const evt = event as { data?: Device };
      const device = evt.data ?? (event as Device);
      console.log("[LocalSend] Device discovered:", device.alias);
      const index = devices.value.findIndex((d) => d.fingerprint === device.fingerprint);
      if (index >= 0) {
        devices.value[index] = device;
      } else {
        devices.value.push(device);
      }
    });

    // Device lost
    client.on(LOCALSEND_EVENTS.deviceLost, (event: unknown) => {
      const evt = event as { data?: string };
      const fingerprint = evt.data ?? (event as string);
      console.log("[LocalSend] Device lost:", fingerprint);
      devices.value = devices.value.filter((d) => d.fingerprint !== fingerprint);
    });

    // Transfer request
    client.on(LOCALSEND_EVENTS.transferRequest, (event: unknown) => {
      console.log("[LocalSend] Transfer request event received:", event);
      const evt = event as { data?: PendingTransfer };
      const transfer = evt.data ?? (event as PendingTransfer);
      console.log("[LocalSend] Transfer request:", transfer.sessionId);
      pendingTransfers.value.push(transfer);
    });

    // Transfer progress
    client.on(LOCALSEND_EVENTS.transferProgress, (event: unknown) => {
      console.log("[LocalSend] Transfer progress event received:", event);
      const evt = event as { data?: TransferProgress };
      const progress = evt.data ?? (event as TransferProgress);
      console.log("[LocalSend] Transfer progress:", progress.sessionId, progress.bytesTransferred, "/", progress.totalBytes);
      // Create new Map to trigger Vue reactivity
      const newMap = new Map(activeTransfers.value);
      newMap.set(progress.sessionId, progress);
      activeTransfers.value = newMap;
    });

    // Transfer complete
    client.on(LOCALSEND_EVENTS.transferComplete, (event: unknown) => {
      const evt = event as { data?: string };
      const sessionId = evt.data ?? (event as string);
      console.log("[LocalSend] Transfer complete:", sessionId);

      // Move to completed transfers
      const info = pendingTransferInfo.value.get(sessionId);
      if (info) {
        completedTransfers.value.unshift({
          sessionId,
          direction: "incoming",
          deviceAlias: info.transfer.sender.alias,
          files: info.transfer.files.map((f) => ({ fileName: f.fileName, size: Number(f.size) })),
          saveDir: info.saveDir,
          completedAt: Date.now(),
        });
        pendingTransferInfo.value.delete(sessionId);
      }

      // Create new Map to trigger Vue reactivity
      const newMap = new Map(activeTransfers.value);
      newMap.delete(sessionId);
      activeTransfers.value = newMap;
      pendingTransfers.value = pendingTransfers.value.filter(
        (t) => t.sessionId !== sessionId
      );
    });

    // Transfer failed
    client.on(LOCALSEND_EVENTS.transferFailed, (event: unknown) => {
      const evt = event as { data?: { sessionId: string; error: string } };
      const data = evt.data ?? (event as { sessionId: string; error: string });
      console.error("[LocalSend] Transfer failed:", data.sessionId, data.error);
      // Create new Map to trigger Vue reactivity
      const newActiveMap = new Map(activeTransfers.value);
      newActiveMap.delete(data.sessionId);
      activeTransfers.value = newActiveMap;
      pendingTransferInfo.value.delete(data.sessionId);
    });
  };

  // Server management
  const startServerAsync = async (port?: number) => {
    // Skip if already running
    if (isServerRunning.value) {
      console.log("[LocalSend] Server already running, skipping start");
      return;
    }

    isServerStarting.value = true;
    try {
      const info = await haexVaultStore.client.localsend.startServer(port);
      serverStatus.value = {
        running: true,
        port: info.port,
        fingerprint: info.fingerprint,
        addresses: info.addresses,
      };
      console.log("[LocalSend] Server started on port", info.port);
      return info;
    } finally {
      isServerStarting.value = false;
    }
  };

  const stopServerAsync = async () => {
    await haexVaultStore.client.localsend.stopServer();
    serverStatus.value = {
      running: false,
      port: null,
      fingerprint: null,
      addresses: [],
    };
    console.log("[LocalSend] Server stopped");
  };

  const refreshServerStatusAsync = async () => {
    serverStatus.value = await haexVaultStore.client.localsend.getServerStatus();
  };

  // Discovery (Desktop)
  const startDiscoveryAsync = async () => {
    try {
      await haexVaultStore.client.localsend.startDiscovery();
      console.log("[LocalSend] Discovery started");
    } catch (error) {
      console.error("[LocalSend] Failed to start discovery:", error);
    }
  };

  const stopDiscoveryAsync = async () => {
    try {
      await haexVaultStore.client.localsend.stopDiscovery();
      console.log("[LocalSend] Discovery stopped");
    } catch (error) {
      console.error("[LocalSend] Failed to stop discovery:", error);
    }
  };

  const refreshDevicesAsync = async () => {
    devices.value = await haexVaultStore.client.localsend.getDevices();
  };

  // Network scan (Mobile)
  const scanNetworkAsync = async () => {
    isScanning.value = true;
    try {
      devices.value = await haexVaultStore.client.localsend.scanNetwork();
      console.log("[LocalSend] Network scan complete, found", devices.value.length, "devices");
    } finally {
      isScanning.value = false;
    }
  };

  // Transfers - Receiving
  const refreshPendingTransfersAsync = async () => {
    pendingTransfers.value = await haexVaultStore.client.localsend.getPendingTransfers();
  };

  const acceptTransferAsync = async (sessionId: string, saveDir: string) => {
    // Store transfer info for completion tracking
    const transfer = pendingTransfers.value.find((t) => t.sessionId === sessionId);
    if (transfer) {
      pendingTransferInfo.value.set(sessionId, { transfer, saveDir });
    }

    await haexVaultStore.client.localsend.acceptTransfer(sessionId, saveDir);
    pendingTransfers.value = pendingTransfers.value.filter(
      (t) => t.sessionId !== sessionId
    );
  };

  const rejectTransferAsync = async (sessionId: string) => {
    await haexVaultStore.client.localsend.rejectTransfer(sessionId);
    pendingTransfers.value = pendingTransfers.value.filter(
      (t) => t.sessionId !== sessionId
    );
  };

  // Transfers - Sending
  const prepareFilesAsync = async (paths: string[]): Promise<LocalSendFileInfo[]> => {
    return haexVaultStore.client.localsend.prepareFiles(paths);
  };

  const sendFilesAsync = async (device: Device, files: LocalSendFileInfo[]): Promise<string> => {
    const sessionId = await haexVaultStore.client.localsend.sendFiles(device, files);
    console.log("[LocalSend] Sending files to", device.alias, "session:", sessionId);
    return sessionId;
  };

  const cancelSendAsync = async (sessionId: string) => {
    await haexVaultStore.client.localsend.cancelSend(sessionId);
    // Create new Map to trigger Vue reactivity
    const newMap = new Map(activeTransfers.value);
    newMap.delete(sessionId);
    activeTransfers.value = newMap;
  };

  // Settings
  const updateSettingsAsync = async (newSettings: LocalSendSettings) => {
    await haexVaultStore.client.localsend.setSettings(newSettings);
    settings.value = newSettings;
    // Persist to database
    await saveSettingsToDbAsync(newSettings);
  };

  const setAliasAsync = async (alias: string) => {
    await haexVaultStore.client.localsend.setAlias(alias);
    if (deviceInfo.value) {
      deviceInfo.value.alias = alias;
    }
    if (settings.value) {
      settings.value.alias = alias;
      // Persist to database
      await saveSettingsToDbAsync(settings.value);
    }
  };

  // Clear completed transfer from list
  const clearCompletedTransfer = (sessionId: string) => {
    completedTransfers.value = completedTransfers.value.filter(
      (t) => t.sessionId !== sessionId
    );
  };

  // Clear all completed transfers
  const clearAllCompletedTransfers = () => {
    completedTransfers.value = [];
  };

  return {
    // State
    isInitialized,
    deviceInfo,
    serverStatus,
    settings,
    devices,
    pendingTransfers,
    activeTransfers,
    completedTransfers,
    isScanning,
    isServerStarting,

    // Computed
    isServerRunning,
    deviceCount,
    hasPendingTransfers,

    // Actions
    initializeAsync,
    startServerAsync,
    stopServerAsync,
    refreshServerStatusAsync,
    startDiscoveryAsync,
    stopDiscoveryAsync,
    refreshDevicesAsync,
    scanNetworkAsync,
    refreshPendingTransfersAsync,
    acceptTransferAsync,
    rejectTransferAsync,
    prepareFilesAsync,
    sendFilesAsync,
    cancelSendAsync,
    updateSettingsAsync,
    setAliasAsync,
    clearCompletedTransfer,
    clearAllCompletedTransfers,
    startAutoRefresh,
    stopAutoRefresh,
  };
});
