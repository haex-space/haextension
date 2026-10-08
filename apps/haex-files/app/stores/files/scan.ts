import type { Ref } from "vue";
import type { LocalFileInfo, RemoteFileInfo } from "./types";
import { dirEntryToLocalFileInfo, isPathIgnored } from "./helpers";

interface FilesScanState {
  remoteFiles: Ref<RemoteFileInfo[]>;
  isLoadingRemote: Ref<boolean>;
}

export type FilesScan = ReturnType<typeof useFilesScan>;

export function useFilesScan({ remoteFiles, isLoadingRemote }: FilesScanState) {
  const haexVaultStore = useHaexVaultStore();
  const syncRulesStore = useSyncRulesStore();

  /**
   * Recursively scan all local files for a sync rule
   */
  const scanAllLocalFilesAsync = async (
    ruleId: string,
    subpath: string = ""
  ): Promise<LocalFileInfo[]> => {
    const rule = syncRulesStore.getRule(ruleId);
    if (!rule) return [];

    let fullPath = rule.localPath;
    if (subpath) {
      fullPath = `${rule.localPath}/${subpath}`;
    }

    const entries = await haexVaultStore.client.filesystem.readDir(fullPath);
    const allFiles: LocalFileInfo[] = [];

    for (const entry of entries) {
      const fileInfo = dirEntryToLocalFileInfo(entry, rule.localPath);
      allFiles.push(fileInfo);

      if (entry.isDirectory) {
        const subFiles = await scanAllLocalFilesAsync(ruleId, fileInfo.relativePath);
        allFiles.push(...subFiles);
      }
    }

    return allFiles;
  };

  /**
   * Scan all remote files for a sync rule from configured backends
   * Supports multiple remote paths for download rules
   */
  const scanRemoteFilesAsync = async (ruleId: string): Promise<RemoteFileInfo[]> => {
    const rule = syncRulesStore.getRule(ruleId);
    if (!rule) return [];

    const allRemoteFiles: RemoteFileInfo[] = [];

    for (const backendId of rule.backendIds) {
      // Use remotePaths if specified (for download rules), otherwise use sync prefix
      const paths = rule.remotePaths.length > 0 ? rule.remotePaths : [`sync/${ruleId}/`];

      for (const remotePath of paths) {
        try {
          // First, try listing with the path as a folder prefix (with trailing slash)
          const folderPrefix = remotePath.endsWith("/") ? remotePath : remotePath + "/";
          const objects = await haexVaultStore.client.remoteStorage.list(backendId, folderPrefix);

          if (objects.length > 0) {
            // It's a folder - process all files under it
            for (const obj of objects) {
              // Extract relative path by removing the folder prefix
              const relativePath = obj.key.startsWith(folderPrefix)
                ? obj.key.slice(folderPrefix.length)
                : obj.key;

              // Skip empty relative paths (the folder itself) and ignored paths
              if (!relativePath || isPathIgnored(relativePath, rule.ignorePatterns)) {
                continue;
              }

              allRemoteFiles.push({
                key: obj.key,
                relativePath,
                size: obj.size,
                lastModified: obj.lastModified ?? null,
                backendId,
              });
            }
          } else {
            // No files found with folder prefix - might be a single file
            // Try listing with exact path (without trailing slash)
            const exactObjects = await haexVaultStore.client.remoteStorage.list(backendId, remotePath);
            const exactMatch = exactObjects.find(obj => obj.key === remotePath);

            if (exactMatch) {
              // It's a single file
              const fileName = remotePath.split("/").pop() || remotePath;
              if (!isPathIgnored(fileName, rule.ignorePatterns)) {
                allRemoteFiles.push({
                  key: exactMatch.key,
                  relativePath: fileName,
                  size: exactMatch.size,
                  lastModified: exactMatch.lastModified ?? null,
                  backendId,
                });
              }
            }
          }
        } catch (error) {
          console.warn(`[haex-files] Failed to scan remote files from backend ${backendId} with path ${remotePath}:`, error);
        }
      }
    }

    return allRemoteFiles;
  };

  /**
   * Load remote files for display in the UI
   */
  const loadRemoteFilesAsync = async (ruleId: string): Promise<void> => {
    isLoadingRemote.value = true;
    try {
      remoteFiles.value = await scanRemoteFilesAsync(ruleId);
    } catch (error) {
      console.warn("[haex-files] Failed to load remote files:", error);
      remoteFiles.value = [];
    } finally {
      isLoadingRemote.value = false;
    }
  };

  return {
    scanAllLocalFilesAsync,
    scanRemoteFilesAsync,
    loadRemoteFilesAsync,
  };
}
