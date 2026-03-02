<script setup lang="ts">
import * as locales from "@nuxt/ui/locale";
import { LazyModalConfirm } from "#components";
import { SpeedInsights } from "@vercel/speed-insights/nuxt";

const { locale: i18nLocale, locales: i18nLocales, setLocale, t } = useI18n();
const currentRoute = useRoute();
const toastNotification = useToast();
const modalOverlay = useOverlay();

const isSidebarOpen = ref(false);

const currentAppLocale = computed({
  get: () => i18nLocale.value,
  set: (newLocale) => {
    setLocale(newLocale);
  },
});

const availableAppLocales = computed(() => {
  return i18nLocales.value.map((locale) => locales[locale.code as keyof typeof locales]);
});

const chatDeletionConfirmationModal = modalOverlay.create(LazyModalConfirm, {
  props: {
    title: t("chat.deleteTitle"),
    description: t("chat.deleteDescription"),
  },
});

const { data: chats, refresh: refreshChatsList } = await useFetch("/api/chats", {
  key: "chats",
  transform: (chatData: Array<{ id: string; title: string; createdAt: string }>) =>
    chatData.map((chat) => ({
      id: chat.id,
      label: chat.title || t("chat.untitled"),
      to: `/chat/${chat.id}`,
      icon: "i-lucide-message-circle",
      createdAt: chat.createdAt,
    })),
});

// Адаптивный опрос чатов (резервный механизм при отсутствии SSE)
const isChatPollingActive = ref(false);
let chatPollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Инициализирует интервальный опрос списка чатов.
 * Работает только на стороне клиента.
 */
function initiateChatPolling(pollingIntervalMs: number) {
  if (!import.meta.client) return;

  if (chatPollingTimer) {
    clearInterval(chatPollingTimer);
  }

  chatPollingTimer = setInterval(() => {
    // Обновляем список только если вкладка активна
    if (document.visibilityState === "visible") {
      refreshChatsList();
    }
  }, pollingIntervalMs);
}

// Следим за чатами, которым может потребоваться обновление заголовка (генерируется асинхронно ИИ)
watch(
  () => chats.value,
  (updatedChats) => {
    const hasChatWithPlaceholderTitle =
      updatedChats?.some((chat) => chat.label === t("chat.untitled")) || false;

    if (hasChatWithPlaceholderTitle) {
      // Опрашиваем чаще (раз в 5 сек), если ждем заголовок
      initiateChatPolling(5000);
      isChatPollingActive.value = true;
    } else if (isChatPollingActive.value) {
      // Возвращаемся к стандартному интервалу (раз в минуту)
      initiateChatPolling(60000);
      isChatPollingActive.value = false;
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  // Запускаем опрос по умолчанию, если он еще не активен
  if (!isChatPollingActive.value) {
    initiateChatPolling(60000);
  }
});

onUnmounted(() => {
  if (chatPollingTimer) {
    clearInterval(chatPollingTimer);
  }
});

const { groups: chatGroups } = useChats(chats);
useEvents();

const topNavigationItems = computed(() => [
  {
    label: t("library.title"),
    to: "/library",
    icon: "i-lucide-library",
  },
]);

const chatListItems = computed(() =>
  chatGroups.value?.flatMap((group) => {
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

/**
 * Удаляет чат после подтверждения пользователем.
 */
async function performChatDeletion(targetChatId: string) {
  const modalInstance = chatDeletionConfirmationModal.open();
  const userConfirmed = await modalInstance.result;
  
  if (!userConfirmed) {
    return;
  }

  try {
    await $fetch(`/api/chats/${targetChatId}`, { method: "DELETE" });

    toastNotification.add({
      title: t("chat.chatDeleted"),
      description: t("chat.chatDeletedDescription"),
      icon: "i-lucide-trash",
    });

    refreshChatsList();

    if (currentRoute.params.id === targetChatId) {
      navigateTo("/");
    }
  } catch {
    toastNotification.add({
      title: "Ошибка",
      description: "Не удалось удалить чат. Попробуйте еще раз.",
      color: "error",
    });
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
      v-model:open="isSidebarOpen"
      :min-size="12"
      collapsible
      resizable
      class="border-r-0 py-4"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/"
          class="flex items-center gap-2.5"
          :class="collapsed ? 'justify-center w-full' : 'px-6.5'"
        >
          <AppLogo
            class="shrink-0 transition-all duration-200"
            :class="collapsed ? 'h-10 w-10' : 'h-8 w-8'"
          />
          <span v-if="!collapsed" class="text-xl font-bold text-highlighted">{{
            t("chat.title")
          }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <div class="flex flex-col gap-6" :class="{ 'items-center': collapsed }">
          <div
            class="hidden lg:flex flex-col gap-2 w-full"
            :class="collapsed ? 'items-center' : 'px-4'"
          >
            <div class="w-full" :class="{ 'flex justify-center': collapsed }">
              <UNavigationMenu
                :items="topNavigationItems"
                :collapsed="collapsed"
                orientation="vertical"
                :ui="{
                  link: collapsed
                    ? 'w-10 h-10 flex items-center justify-center rounded-lg p-0'
                    : 'px-2.5 h-9 justify-center',
                  linkLeadingIcon: 'w-5 h-5 text-highlighted',
                }"
              />
            </div>

            <UButton
              v-bind="
                collapsed
                  ? { icon: 'i-lucide-square-pen', square: true }
                  : {
                      label: t('chat.newChat'),
                      icon: 'i-lucide-square-pen',
                      block: true,
                    }
              "
              variant="solid"
              color="primary"
              to="/"
              class="transition-all duration-200 justify-center"
              :class="collapsed ? 'h-10 w-10 rounded-xl' : 'h-9'"
              @click="isSidebarOpen = false"
            >
              <template v-if="collapsed" #leading>
                <UIcon name="i-lucide-square-pen" class="w-5 h-5" />
              </template>
            </UButton>
          </div>

          <USeparator v-if="!collapsed" class="hidden lg:block px-4" />

          <div v-if="!collapsed" class="w-full flex-1 overflow-y-auto px-2">
            <UNavigationMenu
              :items="chatListItems"
              orientation="vertical"
              :ui="{
                link: 'overflow-hidden px-2.5 h-10 flex items-center justify-center rounded-lg',
                linkLeadingIcon: 'w-5 h-5',
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
                    @click.stop.prevent="performChatDeletion((item as any).id)"
                  />
                </div>
              </template>
            </UNavigationMenu>
          </div>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <div
          class="flex flex-col gap-1 w-full"
          :class="collapsed ? 'items-center' : 'px-4'"
        >
          <UButton
            icon="i-lucide-github"
            color="neutral"
            variant="ghost"
            :label="collapsed ? undefined : t('chat.sourceCode')"
            to="https://github.com/georgij-spiridonov/smart-book-search"
            target="_blank"
            :block="!collapsed"
          />

          <div v-if="!collapsed" class="flex items-center w-full mt-1">
            <ULocaleSelect
              v-model="currentAppLocale"
              :locales="availableAppLocales"
              variant="subtle"
              color="neutral"
              class="flex-1"
              :ui="{ base: 'rounded-r-none focus-visible:ring-inset' }"
            />
            <UColorModeButton
              variant="subtle"
              color="neutral"
              class="rounded-l-none border-l-0"
              :ui="{ base: 'focus-visible:ring-inset' }"
            />
          </div>
          <div v-else class="mt-1">
            <UColorModeButton />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <div
      class="flex-1 flex m-4 lg:ml-0 rounded-lg ring ring-default bg-default/75 shadow min-w-0"
    >
      <slot />
    </div>

    <SpeedInsights />
  </UDashboardGroup>
</template>
