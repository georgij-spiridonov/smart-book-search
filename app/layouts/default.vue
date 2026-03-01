<script setup lang="ts">
import { LazyModalConfirm } from "#components";

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();

const open = ref(false);

const deleteModal = overlay.create(LazyModalConfirm, {
  props: {
    title: t("chat.deleteTitle"),
    description: t("chat.deleteDescription"),
  },
});

const { data: chats, refresh: refreshChats } = await useFetch("/api/chats", {
  key: "chats",
  transform: (data: Array<{ id: string; title: string; createdAt: string }>) =>
    data.map((chat) => ({
      id: chat.id,
      label: chat.title || t("chat.untitled"),
      to: `/chat/${chat.id}`,
      icon: "i-lucide-message-circle",
      createdAt: chat.createdAt,
    })),
});

// Adaptive polling for chats (fallback for SSE)
const pollingActive = ref(false);
let timer: NodeJS.Timeout | null = null;

function startPolling(interval: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      refreshChats();
    }
  }, interval);
}

// Watch for chats that need title updates
watch(
  () => chats.value,
  (newChats) => {
    const hasUntitled =
      newChats?.some((chat) => chat.label === t("chat.untitled")) || false;

    if (hasUntitled) {
      startPolling(5000); // 5s when waiting for title
      pollingActive.value = true;
    } else if (pollingActive.value) {
      startPolling(60000); // 60s for background check
      pollingActive.value = false;
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  if (!pollingActive.value) {
    startPolling(60000);
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const { groups } = useChats(chats);
useEvents();

const navigationItems = computed(() => [
  {
    label: t("library.title"),
    to: "/library",
    icon: "i-lucide-library",
  },
]);

const items = computed(() =>
  groups.value?.flatMap((group) => {
    return [
      {
        label: group.label,
        type: "label" as const,
      },
      ...group.items.map((item) => ({
        ...item,
        slot: "chat" as const,
        class: item.label === t("chat.untitled") ? "text-muted" : "",
      })),
    ];
  }),
);

async function deleteChat(id: string) {
  const instance = deleteModal.open();
  const result = await instance.result;
  if (!result) {
    return;
  }

  await $fetch(`/api/chats/${id}`, { method: "DELETE" });

  toast.add({
    title: t("chat.chatDeleted"),
    description: t("chat.chatDeletedDescription"),
    icon: "i-lucide-trash",
  });

  refreshChats();

  if (route.params.id === id) {
    navigateTo("/");
  }
}

defineShortcuts({
  c: () => {
    navigateTo("/");
  },
});
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      :min-size="12"
      collapsible
      resizable
      class="border-r-0 py-4"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2.5" :class="{ 'justify-center w-full': collapsed }">
          <AppLogo class="shrink-0 transition-all duration-200" :class="collapsed ? 'h-10 w-10' : 'h-8 w-8'" />
          <span v-if="!collapsed" class="text-xl font-bold text-highlighted">{{
            t("chat.title")
          }}</span>
        </NuxtLink>

        <div v-if="!collapsed" class="flex items-center gap-1.5 ms-auto">
          <UDashboardSearchButton collapsed />
        </div>
      </template>

      <template #default="{ collapsed }">
        <div class="flex flex-col gap-6" :class="{ 'items-center': collapsed }">
          <div class="flex flex-col gap-2 w-full" :class="collapsed ? 'items-center' : 'px-4'">
            <template v-if="collapsed">
              <UDashboardSearchButton
                collapsed
                class="w-10 h-10 justify-center transition-all duration-200"
                :ui="{
                  input: 'hidden',
                  button: {
                    base: 'w-10 h-10 p-0 flex items-center justify-center',
                    icon: { base: 'w-5 h-5' }
                  }
                }"
              />
            </template>

            <div class="w-full" :class="{ 'flex justify-center': collapsed }">
              <UNavigationMenu
                :items="navigationItems"
                :collapsed="collapsed"
                orientation="vertical"
                :ui="{
                  link: collapsed
                    ? 'w-10 h-10 flex items-center justify-center rounded-lg p-0'
                    : 'px-2.5 h-9 justify-center',
                  icon: 'w-5 h-5 text-highlighted'
                }"
              />
            </div>

            <UButton
              v-bind="
                collapsed
                  ? { icon: 'i-lucide-square-pen', square: true }
                  : { label: t('chat.newChat'), icon: 'i-lucide-square-pen', block: true }
              "
              variant="solid"
              color="primary"
              to="/"
              @click="open = false"
              class="transition-all duration-200 justify-center"
              :class="collapsed ? 'h-10 w-10 rounded-xl' : 'h-9'"
            >
              <template #leading v-if="collapsed">
                <UIcon name="i-lucide-square-pen" class="w-5 h-5" />
              </template>
            </UButton>
          </div>

          <UDivider v-if="!collapsed" class="px-4" />

          <div class="w-full flex-1 overflow-y-auto" :class="collapsed ? 'px-1.5' : 'px-2'">
            <UNavigationMenu
              :items="items"
              :collapsed="collapsed"
              orientation="vertical"
              :ui="{
                link: 'overflow-hidden px-2.5 h-10 flex items-center justify-center rounded-lg',
                icon: 'w-5 h-5'
              }"
            >
              <template #chat-trailing="{ item }">
                <div
                  class="flex -mr-1.25 translate-x-full group-hover:translate-x-0 transition-transform"
                >
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="text-muted hover:text-primary hover:bg-accented/50 focus-visible:bg-accented/50 p-0.5"
                    tabindex="-1"
                    @click.stop.prevent="deleteChat((item as any).id)"
                  />
                </div>
              </template>
            </UNavigationMenu>
          </div>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UButton
          icon="i-lucide-github"
          color="neutral"
          variant="ghost"
          :label="collapsed ? undefined : t('chat.sourceCode')"
          to="https://github.com/georgij-spiridonov/smart-book-search"
          target="_blank"
          :block="!collapsed"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      :placeholder="t('chat.searchChats')"
      :groups="[
        {
          id: 'links',
          items: [
            {
              label: t('chat.newChat'),
              to: '/',
              icon: 'i-lucide-square-pen',
            },
            {
              label: t('library.title'),
              to: '/library',
              icon: 'i-lucide-library',
            },
          ],
        },
        ...groups,
      ]"
    />

    <div
      class="flex-1 flex m-4 lg:ml-0 rounded-lg ring ring-default bg-default/75 shadow min-w-0"
    >
      <slot />
    </div>
  </UDashboardGroup>
</template>
