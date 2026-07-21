import { eq } from "drizzle-orm";
import { getTableName, type SpaceAssignment, type DecryptedSpace } from "@haex-space/vault-sdk";
import { notebooks, pages } from "~/database/schemas";
import manifest from "../../haextension/manifest.json";
import packageJson from "../../package.json";

const FULL_NOTEBOOKS_TABLE = getTableName(manifest.publicKey, packageJson.name, "notebooks");
const FULL_PAGES_TABLE = getTableName(manifest.publicKey, packageJson.name, "pages");
export { FULL_NOTEBOOKS_TABLE, FULL_PAGES_TABLE };

const nbPk = (id: string) => JSON.stringify({ id });

/**
 * Sharing of notebooks/pages into shared spaces.
 *
 * Assigns rows to a space via the vault's SpacesAPI; the vault's cloud sync
 * pushes them read-only to other members. Space create/join/invite happens in
 * the vault app — here we only assign existing rows to existing spaces.
 */
export const useSpacesStore = defineStore("spaces", () => {
  const haexVault = useHaexVaultStore();

  /** Current space assignments for a notebook row. */
  async function getNotebookAssignmentsAsync(notebookId: string): Promise<SpaceAssignment[]> {
    return haexVault.client.spaces.getAssignmentsAsync(FULL_NOTEBOOKS_TABLE, nbPk(notebookId));
  }

  /** All space assignments for the pages table (used to mark shared pages). */
  async function getAllPageAssignmentsAsync(): Promise<SpaceAssignment[]> {
    return haexVault.client.spaces.getAssignmentsAsync(FULL_PAGES_TABLE);
  }

  /**
   * Share the whole notebook (+ all its pages) into a space.
   * Sets notebooks.space_id → future pages inherit (see notebook store).
   */
  async function shareNotebookWithSpaceAsync(notebookId: string, spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;

    const [nb] = await orm.select().from(notebooks).where(eq(notebooks.id, notebookId));
    const nbPages = await orm.select().from(pages).where(eq(pages.notebookId, notebookId));

    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId, type: "Notebook", label: nb?.name },
      ...nbPages.map((p) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(p.id), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.assignAsync(assignments);
    await orm.update(notebooks).set({ spaceId }).where(eq(notebooks.id, notebookId));
  }

  /**
   * Share only selected pages into a space. The notebook row is shared too (for
   * context), but notebooks.space_id is left unset → this is a partial share and
   * new pages do NOT inherit.
   */
  async function sharePagesWithSpaceAsync(notebookId: string, pageIds: string[], spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;

    const [nb] = await orm.select().from(notebooks).where(eq(notebooks.id, notebookId));

    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId, type: "Notebook", label: nb?.name },
      ...pageIds.map((pid) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(pid), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.assignAsync(assignments);
  }

  /** Unshare the whole notebook (+ its pages) from a space and recompute space_id. */
  async function unshareNotebookFromSpaceAsync(notebookId: string, spaceId: string) {
    const orm = haexVault.orm;
    if (!orm) return;

    const nbPages = await orm.select().from(pages).where(eq(pages.notebookId, notebookId));
    const assignments: SpaceAssignment[] = [
      { tableName: FULL_NOTEBOOKS_TABLE, rowPks: nbPk(notebookId), spaceId, groupId: notebookId },
      ...nbPages.map((p) => ({ tableName: FULL_PAGES_TABLE, rowPks: nbPk(p.id), spaceId, groupId: notebookId })),
    ];
    await haexVault.client.spaces.unassignAsync(assignments);

    const remaining = await getNotebookAssignmentsAsync(notebookId);
    await orm.update(notebooks).set({ spaceId: remaining[0]?.spaceId ?? null }).where(eq(notebooks.id, notebookId));
  }

  /** Spaces the user can write to (valid share targets). */
  async function listWritableSpacesAsync(): Promise<DecryptedSpace[]> {
    const all = await haexVault.client.spaces.listSpacesAsync();
    return all.filter(
      (s) => s.capabilities.includes("space/write") || s.capabilities.includes("space/admin"),
    );
  }

  return {
    getNotebookAssignmentsAsync,
    getAllPageAssignmentsAsync,
    shareNotebookWithSpaceAsync,
    sharePagesWithSpaceAsync,
    unshareNotebookFromSpaceAsync,
    listWritableSpacesAsync,
  };
});
