<template>
  <div v-if="menuItems?.length" class="flex-1 h-full p-2">
    <ul
      ref="listRef"
      class="flex flex-col w-full h-full gap-y-2 first:rounded-t-md last:rounded-b-md p-1"
    >
      <TransitionGroup name="list">
        <li
          v-for="(item, index) in menuItems"
          :key="item.id"
          :ref="(el) => setupLongPress(el as HTMLElement, item)"
          class="bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 origin-to intersect:motion-preset-slide-down intersect:motion-ease-spring-bouncier intersect:motion-delay ease-in-out shadow cursor-pointer transition-colors"
          :class="{
            'bg-primary-100 dark:bg-primary-900/30 outline outline-primary hover:bg-primary-200 dark:hover:bg-primary-800/30':
              selectedItems.has(item) ||
              (currentSelectedItem?.id === item.id &&
                longPressedHook &&
                !selectedItems.has(item)),
            'opacity-60 shadow-primary': selectedGroupItems?.some(
              (_item) => _item.id === item.id
            ),
            'opacity-50': item.inTrash,
          }"
          :style="{ '--motion-delay': `${50 * index}ms` }"
          @mousedown="
            longPressedHook
              ? (currentSelectedItem = null)
              : (currentSelectedItem = item)
          "
        >
          <MobileMenuItem v-bind="item" @click="onClickItemAsync(item)" />
        </li>
      </TransitionGroup>
    </ul>
  </div>
  <div v-else class="flex justify-center items-center flex-1">
    <UiIconNoData class="text-primary size-24 shrink-0" />
  </div>
</template>

<script setup lang="ts">
import type { IPasswordMenuItem } from "./types";
import { onClickOutside, useMagicKeys, onLongPress } from "@vueuse/core";

defineProps<{
  menuItems: IPasswordMenuItem[];
}>();

defineEmits(["add"]);
const selectedItems = defineModel<Set<IPasswordMenuItem>>("selectedItems", {
  default: new Set(),
});

const currentSelectedItem = ref<IPasswordMenuItem | null>();

const longPressedHook = ref(false);

const setupLongPress = (el: HTMLElement | null, _item: IPasswordMenuItem) => {
  if (!el) return;

  onLongPress(
    el,
    () => {
      longPressedHook.value = true;
    },
    { delay: 1000 }
  );
};

watch(longPressedHook, () => {
  if (!longPressedHook.value) selectedItems.value.clear();
});

watch(selectedItems, () => {
  if (!selectedItems.value.size) longPressedHook.value = false;
});

const localePath = useLocalePath();
const { ctrl } = useMagicKeys();

const onClickItemAsync = async (item: IPasswordMenuItem) => {
  currentSelectedItem.value = null;

  if (longPressedHook.value || selectedItems.value.size || ctrl?.value) {
    if (selectedItems.value?.has(item)) {
      selectedItems.value.delete(item);
    } else {
      selectedItems.value?.add(item);
    }

    if (!selectedItems.value.size) longPressedHook.value = false;
  } else {
    if (item.type === "group") {
      await navigateTo(
        localePath({
          name: "passwordGroupItems",
          params: {
            ...useRouter().currentRoute.value.params,
            groupId: item.id,
          },
        })
      );
    } else {
      await navigateTo(
        localePath({
          name: "passwordItemEdit",
          params: { ...useRouter().currentRoute.value.params, itemId: item.id },
        })
      );
    }
    // Keep search term active when opening items
  }
};

const listRef = useTemplateRef("listRef");

onClickOutside(listRef, async () => {
  // needed cause otherwise the unselect is to fast for other processing like "edit selected group"
  setTimeout(() => {
    longPressedHook.value = false;
  }, 50);
});

const { selectedGroupItems } = storeToRefs(usePasswordGroupStore());
</script>
