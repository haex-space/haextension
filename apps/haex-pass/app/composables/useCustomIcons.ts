import { ref } from 'vue';
import { eq } from 'drizzle-orm';
import { haexPasswordsBinaries } from '~/database';

export const useCustomIcons = () => {
  const customIcons = ref<string[]>([]);
  const { orm } = storeToRefs(useHaexVaultStore());

  const loadCustomIconsAsync = async () => {
    if (orm.value) {
      try {
        const binaries = await orm.value
          .select({ hash: haexPasswordsBinaries.hash })
          .from(haexPasswordsBinaries)
          .where(eq(haexPasswordsBinaries.type, 'icon'));

        customIcons.value = binaries.map(b => `binary:${b.hash}`);
      } catch (error) {
        console.error('[CustomIcons] Failed to load custom icons:', error);
      }
    }
  };

  const deleteIconAsync = async (icon: string) => {
    // Extract hash from binary:hash format
    const hash = icon.replace('binary:', '');

    if (!orm.value) {
      console.error('[CustomIcons] ORM not available');
      return;
    }

    try {
      // Delete from database
      await orm.value
        .delete(haexPasswordsBinaries)
        .where(eq(haexPasswordsBinaries.hash, hash));

      // Reload icons list
      await loadCustomIconsAsync();
    } catch (error) {
      console.error('[CustomIcons] Failed to delete icon:', error);
      throw error;
    }
  };

  return {
    customIcons,
    loadCustomIconsAsync,
    deleteIconAsync,
  };
};
