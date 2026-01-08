import { eq, inArray } from "drizzle-orm";
import {
  haexPasswordsTags,
  haexPasswordsItemTags,
  haexPasswordsItemDetails,
  type SelectHaexPasswordsTags,
  type SelectHaexPasswordsItemTags,
} from "~/database";

export const useTagStore = defineStore("tagStore", () => {
  // All tags in the database
  const tags = ref<SelectHaexPasswordsTags[]>([]);

  // Load all tags from database
  const syncTagsAsync = async () => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsTags)
      .orderBy(haexPasswordsTags.name);

    tags.value = result;
  };

  // Get or create a tag by name
  const getOrCreateTagAsync = async (
    name: string,
    color?: string | null
  ): Promise<SelectHaexPasswordsTags> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const normalizedName = name.trim().toLowerCase();

    // Check if tag already exists
    const existing = tags.value.find(
      (t) => t.name.toLowerCase() === normalizedName
    );
    if (existing) return existing;

    // Create new tag
    const newTag: SelectHaexPasswordsTags = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color: color || null,
      createdAt: new Date().toISOString(),
    };

    await haexVaultStore.orm.insert(haexPasswordsTags).values(newTag);
    tags.value.push(newTag);

    return newTag;
  };

  // Add a tag to an item
  const addTagToItemAsync = async (itemId: string, tagName: string) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const tag = await getOrCreateTagAsync(tagName);

    // Check if already linked
    const existingLink = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId))
      .limit(100);

    if (existingLink.some((link) => link.tagId === tag.id)) {
      return; // Already linked
    }

    await haexVaultStore.orm.insert(haexPasswordsItemTags).values({
      id: crypto.randomUUID(),
      itemId,
      tagId: tag.id,
    });
  };

  // Remove a tag from an item
  const removeTagFromItemAsync = async (itemId: string, tagId: string) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // Find the link to delete
    const links = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId));

    const linkToDelete = links.find((link) => link.tagId === tagId);
    if (linkToDelete) {
      await haexVaultStore.orm
        .delete(haexPasswordsItemTags)
        .where(eq(haexPasswordsItemTags.id, linkToDelete.id));
    }
  };

  // Get all tags for an item
  const getItemTagsAsync = async (
    itemId: string
  ): Promise<SelectHaexPasswordsTags[]> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const links = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId));

    const tagIds = links.map((link) => link.tagId);
    if (tagIds.length === 0) return [];

    return tags.value.filter((t) => tagIds.includes(t.id));
  };

  // Set tags for an item (replaces existing tags)
  const setItemTagsAsync = async (itemId: string, tagNames: string[]) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // Get current links
    const currentLinks = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId));

    // Delete all current links
    for (const link of currentLinks) {
      await haexVaultStore.orm
        .delete(haexPasswordsItemTags)
        .where(eq(haexPasswordsItemTags.id, link.id));
    }

    // Add new tags
    for (const tagName of tagNames) {
      if (tagName.trim()) {
        await addTagToItemAsync(itemId, tagName);
      }
    }
  };

  // Update tag color
  const updateTagColorAsync = async (tagId: string, color: string | null) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    await haexVaultStore.orm
      .update(haexPasswordsTags)
      .set({ color })
      .where(eq(haexPasswordsTags.id, tagId));

    const tag = tags.value.find((t) => t.id === tagId);
    if (tag) {
      tag.color = color;
    }
  };

  // Delete a tag (removes from all items)
  const deleteTagAsync = async (tagId: string) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    // Delete tag (cascade will remove item links)
    await haexVaultStore.orm
      .delete(haexPasswordsTags)
      .where(eq(haexPasswordsTags.id, tagId));

    tags.value = tags.value.filter((t) => t.id !== tagId);
  };

  // Migration function removed - tags field no longer exists in schema
  // Migration should be run before applying the schema migration that removes the tags field

  // Toggle tag on item (add if not present, remove if present)
  const toggleTagOnItemAsync = async (itemId: string, tagId: string) => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const links = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId));

    const existingLink = links.find((link) => link.tagId === tagId);

    if (existingLink) {
      await haexVaultStore.orm
        .delete(haexPasswordsItemTags)
        .where(eq(haexPasswordsItemTags.id, existingLink.id));
      return false; // Tag was removed
    } else {
      await haexVaultStore.orm.insert(haexPasswordsItemTags).values({
        id: crypto.randomUUID(),
        itemId,
        tagId,
      });
      return true; // Tag was added
    }
  };

  // Check if item has a specific tag
  const itemHasTagAsync = async (
    itemId: string,
    tagId: string
  ): Promise<boolean> => {
    const haexVaultStore = useHaexVaultStore();
    if (!haexVaultStore.orm) throw new Error("Database not initialized");

    const links = await haexVaultStore.orm
      .select()
      .from(haexPasswordsItemTags)
      .where(eq(haexPasswordsItemTags.itemId, itemId));

    return links.some((link) => link.tagId === tagId);
  };

  return {
    tags,
    syncTagsAsync,
    getOrCreateTagAsync,
    addTagToItemAsync,
    removeTagFromItemAsync,
    getItemTagsAsync,
    setItemTagsAsync,
    updateTagColorAsync,
    deleteTagAsync,
    toggleTagOnItemAsync,
    itemHasTagAsync,
  };
});
