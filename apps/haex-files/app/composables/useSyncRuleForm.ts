import type { Ref } from "vue";
import type { SyncRule, SyncDirection, ConflictStrategy } from "~/stores/syncRules";

export const useSyncRuleForm = (
  isOpen: Ref<boolean>,
  getEditRule: () => SyncRule | null | undefined,
  error: Ref<string | null>
) => {
  const { backends } = storeToRefs(useBackendsStore());
  const { spaces } = storeToRefs(useSpacesStore());

  const form = reactive({
    localPath: "",
    remotePaths: [] as string[],
    spaceId: "",
    backendIds: [] as string[],
    direction: "up" as SyncDirection,
    ignorePatterns: "",
    conflictStrategy: "ask" as ConflictStrategy,
  });

  const isValid = computed(() => {
    return (
      form.localPath.trim() !== "" &&
      form.spaceId !== "" &&
      form.backendIds.length > 0
    );
  });

  // Helper to convert ignore patterns string to array
  const ignorePatternsArray = computed(() => {
    return form.ignorePatterns
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  });

  // Computed display value for remote paths (semicolon-separated)
  const remotePathsDisplay = computed(() => form.remotePaths.join("; "));

  const hasChanges = computed(() => {
    const rule = getEditRule();
    if (!rule) return false;
    const backendsSame = rule.backendIds.length === form.backendIds.length &&
      rule.backendIds.every((id) => form.backendIds.includes(id));
    const ignorePatternsSame = JSON.stringify(rule.ignorePatterns) === JSON.stringify(ignorePatternsArray.value);
    const remotePathsSame = JSON.stringify(rule.remotePaths) === JSON.stringify(form.remotePaths);
    return rule.direction !== form.direction ||
      rule.conflictStrategy !== form.conflictStrategy ||
      !backendsSame ||
      !ignorePatternsSame ||
      !remotePathsSame;
  });

  const resetForm = () => {
    form.localPath = "";
    form.remotePaths = [];
    form.spaceId = "";
    form.backendIds = [];
    form.direction = "up";
    form.ignorePatterns = "";
    form.conflictStrategy = "ask";
    error.value = null;
  };

  // Helper to pre-select all backends (only in add mode)
  const preselectAllBackends = () => {
    if (getEditRule()) return;
    if (backends.value.length === 0) return;
    if (form.backendIds.length > 0) return;

    form.backendIds = backends.value.map((b) => b.id);
  };

  // Helper to pre-select first space
  const preselectFirstSpace = () => {
    if (getEditRule()) return;
    if (form.spaceId) return;

    const firstSpace = spaces.value[0];
    if (firstSpace) {
      form.spaceId = firstSpace.id;
    }
  };

  // Watch both isOpen AND editRule together to handle all cases
  watch(
    [isOpen, getEditRule],
    ([open, editRule]) => {
      if (!open) return;

      if (editRule) {
        // Edit mode: populate form from rule
        form.localPath = editRule.localPath;
        form.remotePaths = [...editRule.remotePaths];
        form.spaceId = editRule.spaceId;
        form.backendIds = [...editRule.backendIds];
        form.direction = editRule.direction;
        form.ignorePatterns = editRule.ignorePatterns.join("\n");
        form.conflictStrategy = editRule.conflictStrategy;
      } else {
        // Add mode: reset form and pre-select defaults
        form.localPath = "";
        form.remotePaths = [];
        form.spaceId = spaces.value[0]?.id || "";
        form.backendIds = backends.value.map((b) => b.id);
        form.direction = "up";
        form.ignorePatterns = "";
        form.conflictStrategy = "ask";
        error.value = null;
      }
    },
    { immediate: true }
  );

  // Pre-select backends when they load (handles async loading)
  watch(
    () => backends.value.length,
    () => {
      if (isOpen.value && !getEditRule() && form.backendIds.length === 0) {
        preselectAllBackends();
      }
    }
  );

  // Pre-select first space when spaces load (handles async loading)
  watch(
    () => spaces.value.length,
    () => {
      if (isOpen.value && !getEditRule() && !form.spaceId) {
        preselectFirstSpace();
      }
    }
  );

  return {
    form,
    isValid,
    ignorePatternsArray,
    remotePathsDisplay,
    hasChanges,
    resetForm,
  };
};
