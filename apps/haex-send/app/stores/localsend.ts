// stores/localsend.ts
import type {
  Device,
  DeviceInfo,
  ServerStatus,
  LocalSendSettings,
  PendingTransfer,
  TransferProgress,
  LocalSendFileInfo,
} from "@haex-space/vault-sdk";

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

  // Computed
  const isServerRunning = computed(() => serverStatus.value?.running ?? false);
  const deviceCount = computed(() => devices.value.length);
  const hasPendingTransfers = computed(() => pendingTransfers.value.length > 0);

  // Initialize LocalSend
  const initializeAsync = async () => {
    if (isInitialized.value) return;

    try {
      console.log("[LocalSend] Initializing...");
      deviceInfo.value = await haexVaultStore.client.localsend.init();
      settings.value = await haexVaultStore.client.localsend.getSettings();
      serverStatus.value = await haexVaultStore.client.localsend.getServerStatus();

      // Setup event listeners
      setupEventListeners();

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

    // Device discovered
    client.on("localsend:device-discovered", (event: unknown) => {
      const device = event as Device;
      console.log("[LocalSend] Device discovered:", device.alias);
      const index = devices.value.findIndex((d) => d.fingerprint === device.fingerprint);
      if (index >= 0) {
        devices.value[index] = device;
      } else {
        devices.value.push(device);
      }
    });

    // Device lost
    client.on("localsend:device-lost", (event: unknown) => {
      const fingerprint = event as string;
      console.log("[LocalSend] Device lost:", fingerprint);
      devices.value = devices.value.filter((d) => d.fingerprint !== fingerprint);
    });

    // Transfer request
    client.on("localsend:transfer-request", (event: unknown) => {
      const transfer = event as PendingTransfer;
      console.log("[LocalSend] Transfer request:", transfer.sessionId);
      pendingTransfers.value.push(transfer);
    });

    // Transfer progress
    client.on("localsend:transfer-progress", (event: unknown) => {
      const progress = event as TransferProgress;
      activeTransfers.value.set(progress.sessionId, progress);
    });

    // Transfer complete
    client.on("localsend:transfer-complete", (event: unknown) => {
      const sessionId = event as string;
      console.log("[LocalSend] Transfer complete:", sessionId);
      activeTransfers.value.delete(sessionId);
      pendingTransfers.value = pendingTransfers.value.filter(
        (t) => t.sessionId !== sessionId
      );
    });

    // Transfer failed
    client.on("localsend:transfer-failed", (event: unknown) => {
      const data = event as { sessionId: string; error: string };
      console.error("[LocalSend] Transfer failed:", data.sessionId, data.error);
      activeTransfers.value.delete(data.sessionId);
    });
  };

  // Server management
  const startServerAsync = async (port?: number) => {
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
    activeTransfers.value.delete(sessionId);
  };

  // Settings
  const updateSettingsAsync = async (newSettings: LocalSendSettings) => {
    await haexVaultStore.client.localsend.setSettings(newSettings);
    settings.value = newSettings;
  };

  const setAliasAsync = async (alias: string) => {
    await haexVaultStore.client.localsend.setAlias(alias);
    if (deviceInfo.value) {
      deviceInfo.value.alias = alias;
    }
    if (settings.value) {
      settings.value.alias = alias;
    }
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
  };
});
