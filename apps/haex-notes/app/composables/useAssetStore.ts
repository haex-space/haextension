import { eq } from "drizzle-orm";
import { assets, type SelectAsset } from "~/database/schemas";
import { assetRelPath, extensionFor, sha256Hex } from "~/lib/assetPath";

/** Verzeichnis unterhalb des Dokumenten-Ordners. */
const ASSET_DIR = "haex-notes/assets";

/**
 * Dateien einer Notiz auf dem Filesystem.
 *
 * Die DB hält nur Metadaten — eine DB-Transaktion ist auf 100 MB begrenzt, und
 * Binärdaten gehören ohnehin nicht dorthin. Ob diese Dateien auf andere Geräte
 * wandern, konfiguriert der Nutzer in haex-vault; die Extension kennt nur lokale
 * Pfade.
 */
export function useAssetStore() {
  const haexVault = useHaexVaultStore();

  let rootPromise: Promise<string> | null = null;

  async function resolveRootAsync(): Promise<string> {
    const fs = haexVault.client.filesystem;
    const paths = (await fs.knownPaths()) as Record<string, string>;
    const base = paths.documents ?? paths.home;
    if (!base) throw new Error("[haex-notes] No writable base directory available");
    const root = `${base}/${ASSET_DIR}`;
    await fs.mkdir(root);
    return root;
  }

  // Cache the successful root, but clear on failure so the next call can retry
  // (e.g. permission denied, then user grants access).
  const rootAsync = () => {
    if (!rootPromise) {
      rootPromise = resolveRootAsync().catch((err) => {
        rootPromise = null;
        throw err;
      });
    }
    return rootPromise;
  };

  async function absolutePathAsync(asset: SelectAsset): Promise<string> {
    const root = await rootAsync();
    return `${root}/${assetRelPath(asset.sha256, extensionFor(asset.mimeType, asset.fileName))}`;
  }

  /**
   * Legt Bytes ab und gibt die Asset-Id zurück. Identischer Inhalt liefert das
   * bestehende Asset — der Dateiname ist der Inhalts-Hash, doppelte Importe
   * kosten also keinen zusätzlichen Platz.
   */
  async function putAsync(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
    const db = haexVault.orm;
    if (!db) throw new Error("[haex-notes] Database not ready");

    const sha256 = await sha256Hex(bytes);
    const [existing] = await db.select().from(assets).where(eq(assets.sha256, sha256));
    if (existing) return existing.id;

    const fs = haexVault.client.filesystem;
    const root = await rootAsync();
    const relPath = assetRelPath(sha256, extensionFor(mimeType, fileName));
    await fs.mkdir(`${root}/${relPath.split("/")[0]}`);
    await fs.writeFile(`${root}/${relPath}`, bytes);

    const id = crypto.randomUUID();
    await db.insert(assets).values({ id, sha256, fileName, mimeType, size: bytes.byteLength });
    return id;
  }

  async function metaAsync(assetId: string): Promise<SelectAsset | null> {
    const db = haexVault.orm;
    if (!db) return null;
    const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
    return row ?? null;
  }

  /**
   * Liest die Bytes eines Assets — oder null, wenn die Datei nicht (mehr) da ist.
   *
   * Fehlende Dateien sind der Normalfall, nicht der Fehlerfall: der Ordner kann
   * verschoben worden sein, oder die Seite kam über einen Shared Space von einem
   * Gerät, auf dem die Datei liegt. Aufrufer zeichnen dann einen Platzhalter.
   */
  async function readAsync(assetId: string): Promise<Uint8Array | null> {
    const asset = await metaAsync(assetId);
    if (!asset) return null;
    const fs = haexVault.client.filesystem;
    const path = await absolutePathAsync(asset);
    if (!(await fs.exists(path).catch(() => false))) return null;
    return fs.readFile(path).catch(() => null);
  }

  return { putAsync, readAsync, metaAsync, absolutePathAsync };
}
