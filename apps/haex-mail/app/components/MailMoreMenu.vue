<script setup lang="ts">
import { Forward, MoreVertical, ReplyAll } from "lucide-vue-next";

/**
 * Triple-dot overflow menu for a message's secondary actions (reply-all,
 * forward). Shared by the desktop message-view header, the fullscreen
 * overlay header, and the mobile detail header.
 */
const emit = defineEmits<{ replyAll: []; forward: [] }>();

const { t } = useI18n();
</script>

<template>
  <ShadcnDropdownMenu>
    <ShadcnDropdownMenuTrigger as-child>
      <UiButton
        variant="ghost"
        size="icon-lg"
        :icon="MoreVertical"
        :aria-label="t('more')"
      />
    </ShadcnDropdownMenuTrigger>
    <ShadcnDropdownMenuContent align="end" class="w-48">
      <ShadcnDropdownMenuItem @select="emit('replyAll')">
        <ReplyAll class="h-4 w-4 mr-2" />
        {{ t("replyAll") }}
      </ShadcnDropdownMenuItem>
      <ShadcnDropdownMenuItem @select="emit('forward')">
        <Forward class="h-4 w-4 mr-2" />
        {{ t("forward") }}
      </ShadcnDropdownMenuItem>
    </ShadcnDropdownMenuContent>
  </ShadcnDropdownMenu>
</template>

<i18n lang="yaml">
de:
  more: Weitere Aktionen
  replyAll: Allen antworten
  forward: Weiterleiten
en:
  more: More actions
  replyAll: Reply all
  forward: Forward
</i18n>
