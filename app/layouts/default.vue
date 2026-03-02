<script setup lang="ts">
import * as locales from "@nuxt/ui/locale";
import { LazyModalConfirm } from "#components";
import { SpeedInsights } from "@vercel/speed-insights/nuxt";

/**
 * Основной макет приложения.
 * Управляет боковой панелью, списком чатов, навигацией и локализацией.
 */

interface ChatItem {
  id: string;
  title: string;
  createdAt: string;
}

interface NavItem {
  id?: string;
  label: string;
  to?: string;
  icon?: string;
  type?: "label";
  slot?: "chat";
  class?: string;
  createdAt?: string;
}

const { locale: activeLocale, locales: supportedLocales, setLocale, t } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();

const isSidebarOpen = ref(false);

// Модель для переключения языка в UI
const localeModel = computed({
  get: () => activeLocale.value,
  set: (value) => {
    setLocale(value);
  },
});

// Список доступных локалей, адаптированный для компонента выбора
const availableLocales = computed(() => {
  return supportedLocales.value.map((l) => locales[l.code as keyof typeof locales]);
});

// Модальное окно подтверждения удаления чата
const confirmDeleteModal = overlay.create(LazyModalConfirm, {
  props: {
    title: t("chat.deleteChatTitle"),
    description: t("chat.deleteChatConfirm"),
  },
});

// Запрос списка чатов с сервера
const { data: chatList, refresh: refreshChats } = await useFetch("/api/chats", {
  key: "chat-list",
  transform: (data: ChatItem[]) =>
    data.map((chat) => ({
      id: chat.id,
      label: chat.title || t("chat.untitledChat"),
      to: `/chat/${chat.id}`,
      icon: "i-lucide-message-circle",
      createdAt: chat.createdAt,
    })),
});

// Резервный механизм опроса при отсутствии SSE
const isPollingActive = ref(false);
let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Настройка интервального обновления списка чатов.
 * @param intervalMs Интервал обновления в миллисекундах.
 */
function setupPolling(intervalMs: number) {
  if (!import.meta.client) return;

  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }

  pollingIntervalId = setInterval(() => {
    // Обновляем список только если вкладка активна, чтобы экономить ресурсы
    if (document.visibilityState === "visible") {
      refreshChats();
    }
  }, intervalMs);
}

// Отслеживание необходимости частого обновления (например, пока ИИ генерирует заголовок)
watch(
  () => chatList.value,
  (newChats) => {
    const hasPendingTitles =
      newChats?.some((chat) => chat.label === t("chat.untitledChat")) || false;

    if (hasPendingTitles) {
      // Опрашиваем чаще (5с), если есть чаты без заголовка
      setupPolling(5000);
      isPollingActive.value = true;
    } else if (isPollingActive.value) {
      // Возвращаемся к стандартному интервалу (60с)
      setupPolling(60000);
      isPollingActive.value = false;
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  // Запуск фонового обновления по умолчанию
  if (!isPollingActive.value) {
    setupPolling(60000);
  }
});

onUnmounted(() => {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }
});

const { groups: chatGroups } = useChats(chatList);
useEvents();

// Элементы верхней навигации
const topNavItems = computed(() => [
  {
    label: t("library.mainTitle"),
    to: "/library",
    icon: "i-lucide-library",
  },
]);

// Плоский список элементов для меню чатов с разделителями
const chatMenuItems = computed<NavItem[]>(() =>
  (chatGroups.value || []).flatMap((group) => [
    {
      label: group.label,
      type: "label" as const,
    },
    ...group.items.map((item) => ({
      ...item,
      slot: "chat" as const,
      class: item.label === t("chat.untitledChat") ? "text-muted" : "",
    })),
  ]),
);

/**
 * Обработка удаления чата с подтверждением.
 * @param chatId Идентификатор чата для удаления.
 */
async function handleDeleteChat(chatId: string) {
  const modal = confirmDeleteModal.open();
  const confirmed = await modal.result;
  
  if (!confirmed) return;

  try {
    await $fetch(`/api/chats/${chatId}`, { method: "DELETE" });

    toast.add({
      title: t("chat.chatDeletedSuccess"),
      description: t("chat.chatDeletedDetail"),
      icon: "i-lucide-trash",
    });

    await refreshChats();

    // Если удален текущий открытый чат, переходим на главную
    if (route.params.id === chatId) {
      await navigateTo("/");
    }
  } catch (err) {
    console.error("Failed to delete chat:", err);
    toast.add({
      title: t("error.unexpectedError"),
      description: t("chat.deleteChatError"),
      color: "error",
    });
  }
}

// Горячие клавиши приложения
defineShortcuts({
  c: () => navigateTo("/"),
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
          <span v-if="!collapsed" class="text-xl font-bold text-highlighted">
            {{ t("chat.mainTitle") }}
          </span>
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
                :items="topNavItems"
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
                      label: t('chat.newChatButton'),
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
              :items="chatMenuItems"
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
                    @click.stop.prevent="handleDeleteChat((item as NavItem).id!)"
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
            :label="collapsed ? undefined : t('chat.viewSourceCode')"
            to="https://github.com/georgij-spiridonov/smart-book-search"
            target="_blank"
            :block="!collapsed"
          />

          <div v-if="!collapsed" class="flex items-center w-full mt-1">
            <ULocaleSelect
              v-model="localeModel"
              :locales="availableLocales"
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
