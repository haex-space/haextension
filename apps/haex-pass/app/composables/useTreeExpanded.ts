// Global state for tree expansion
const expandedGroups = ref<Set<string>>(new Set());
const treeScrollPosition = ref<number>(0);

export const useTreeExpanded = () => {
  const isExpanded = (groupId: string) => {
    return expandedGroups.value.has(groupId);
  };

  const setExpanded = (groupId: string, expanded: boolean) => {
    if (expanded) {
      expandedGroups.value.add(groupId);
    } else {
      expandedGroups.value.delete(groupId);
    }
  };

  const toggleExpanded = (groupId: string) => {
    const currentState = expandedGroups.value.has(groupId);
    setExpanded(groupId, !currentState);
  };

  return {
    isExpanded,
    setExpanded,
    toggleExpanded,
    treeScrollPosition,
  };
};
