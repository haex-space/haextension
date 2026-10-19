<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Header slot (above content area) -->
    <slot name="header" />

    <!-- Main Content Area -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <!-- Only one layout is mounted, so the slot contents never exist twice -->
      <template v-if="isSmallScreen">
        <!-- Mobile: Overlay Sidebar via Drawer with swipe-to-close -->
        <ShadcnDrawer v-model:open="mobileOpen" :direction="side">
          <ShadcnDrawerContent class="h-full w-80 p-0">
            <slot name="sidebar" />
          </ShadcnDrawerContent>
        </ShadcnDrawer>

        <!-- Mobile: Content only -->
        <div class="h-full overflow-y-auto">
          <slot name="content" />
        </div>
      </template>

      <!-- Desktop: Resizable Panels -->
      <ShadcnResizablePanelGroup
        v-else
        :id="panelGroupId"
        direction="horizontal"
        class="flex h-full"
        :auto-save-id="autoSaveId"
      >
        <!-- Sidebar Panel (left or right based on side prop) -->
        <template v-if="side === 'left'">
          <ShadcnResizablePanel
            :id="`${panelGroupId}-sidebar`"
            :default-size="defaultSidebarSize"
            :min-size="minSidebarSize"
            :max-size="maxSidebarSize"
          >
            <slot name="sidebar" />
          </ShadcnResizablePanel>

          <ShadcnResizableHandle />

          <ShadcnResizablePanel
            :id="`${panelGroupId}-content`"
            :default-size="100 - defaultSidebarSize"
          >
            <div class="h-full overflow-y-auto">
              <slot name="content" />
            </div>
          </ShadcnResizablePanel>
        </template>

        <template v-else>
          <ShadcnResizablePanel
            :id="`${panelGroupId}-content`"
            :default-size="100 - defaultSidebarSize"
          >
            <div class="h-full overflow-y-auto">
              <slot name="content" />
            </div>
          </ShadcnResizablePanel>

          <ShadcnResizableHandle />

          <ShadcnResizablePanel
            :id="`${panelGroupId}-sidebar`"
            :default-size="defaultSidebarSize"
            :min-size="minSidebarSize"
            :max-size="maxSidebarSize"
          >
            <slot name="sidebar" />
          </ShadcnResizablePanel>
        </template>
      </ShadcnResizablePanelGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";

withDefaults(
  defineProps<{
    /** Unique ID for the panel group (used for localStorage) */
    panelGroupId?: string;
    /** Auto-save ID for persisting panel sizes */
    autoSaveId?: string;
    /** Which side the sidebar appears on */
    side?: "left" | "right";
    /** Default sidebar size in percent */
    defaultSidebarSize?: number;
    /** Minimum sidebar size in percent */
    minSidebarSize?: number;
    /** Maximum sidebar size in percent */
    maxSidebarSize?: number;
  }>(),
  {
    panelGroupId: "sidebar-panels",
    autoSaveId: undefined,
    side: "left",
    defaultSidebarSize: 20,
    minSidebarSize: 15,
    maxSidebarSize: 40,
  }
);

const mobileOpen = defineModel<boolean>("mobileOpen", { default: false });

// "smaller('md')" matches Tailwind's breakpoint, so `md:hidden` triggers in the consumer agree with it
const isSmallScreen = useBreakpoints(breakpointsTailwind).smaller("md");

// The drawer does not exist on desktop; it must not pop up again when the window narrows
watch(isSmallScreen, (small) => {
  if (!small) mobileOpen.value = false;
});
</script>
