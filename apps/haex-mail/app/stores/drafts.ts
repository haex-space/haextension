import { toast } from "vue-sonner";
import { createVaultDraftBackend } from "./mail/draftBackend";
import { createDraftStore } from "./mail/drafts";

/**
 * The drafts of haex-mail (spec 022), one instance for the dialog, the list and the upload. The
 * logic is in `stores/mail/drafts.ts`; this wires it to the vault database and the toasts.
 */
export const useDraftsStore = defineStore("drafts", () => {
  const haexVault = useHaexVaultStore();
  const { $i18n } = useNuxtApp();

  const requireOrm = () => {
    if (!haexVault.orm) throw new Error("The vault database is not ready.");
    return haexVault.orm;
  };

  const backend = createVaultDraftBackend(requireOrm, (statements) =>
    haexVault.client.database.transaction(statements),
  );

  return createDraftStore(backend, {
    now: Date.now,
    newId: () => crypto.randomUUID(),
    attachmentsDropped: (count) => toast.warning($i18n.t("mail.drafts.attachmentsTooLarge", { count })),
  });
});
