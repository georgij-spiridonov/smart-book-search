<script setup lang="ts">
import type { DefineComponent } from "vue";
import { Chat } from "@ai-sdk/vue";
import type { UIMessage } from "ai";
import { useClipboard } from "@vueuse/core";
import { getTextFromMessage } from "@nuxt/ui/utils/ai";
import { createBookChatTransport } from "~/utils/BookChatTransport";
import ProseStreamPre from "../../components/prose/PreStream.vue";
import type { Book } from "../../../shared/types/book";

const { t } = useI18n();

const customComponents = {
  pre: ProseStreamPre as unknown as DefineComponent,
};

const currentRoute = useRoute();
const toastNotification = useToast();
const { copy: copyToClipboard } = useClipboard();

const { data: currentChatData } = await useFetch(() => `/api/chats/${currentRoute.params.id}`, {
  key: `chat-${currentRoute.params.id}`,
});

if (!currentChatData.value) {
  throw createError({ statusCode: 404, statusMessage: t("chat.notFound") });
}

definePageMeta({
  key: (route) => route.params.id as string,
});

const { data: booksResponse } = await useFetch("/api/books");
const availableBooks = computed(() =>
  (booksResponse.value?.books || []).map((book: Book) => ({
    ...book,
    label: book.author ? `${book.author} / ${book.title}` : book.title,
  })),
);
const selectedBookForChat = ref<(Book & { label: string }) | undefined>(undefined);

// Синхронизируем выбранную книгу с данными чата
watch(
  [availableBooks, currentChatData],
  ([newBooks, newData]) => {
    if (newData?.bookIds && newBooks.length) {
      selectedBookForChat.value =
        newBooks.find((book) => newData.bookIds?.includes(book.id)) || undefined;
    }
  },
  { immediate: true },
);

const chatUserInput = ref("");

const chatSession = new Chat({
  id: currentChatData.value.id,
  messages: currentChatData.value.messages as UIMessage[],
  transport: createBookChatTransport(
    computed(() => (selectedBookForChat.value ? [selectedBookForChat.value.id] : [])),
  ),
  onError(chatError) {
    const { message: errorMessage } =
      typeof chatError.message === "string" && chatError.message[0] === "{"
        ? JSON.parse(chatError.message)
        : chatError;
        
    toastNotification.add({
      description: errorMessage,
      icon: "i-lucide-alert-circle",
      color: "error",
      duration: 0,
    });
  },
});

/**
 * Обрабатывает отправку сообщения в чат.
 */
async function handleChatSubmit(event: Event) {
  event.preventDefault();
  
  if (!selectedBookForChat.value) {
    toastNotification.add({
      title: t("chat.selectBookError"),
      icon: "i-lucide-alert-circle",
      color: "error",
    });
    return;
  }

  if (chatUserInput.value.trim()) {
    chatSession.sendMessage({
      text: chatUserInput.value,
    });
    chatUserInput.value = "";
  }
}

const isMessageCopied = ref(false);

/**
 * Копирует содержимое сообщения в буфер обмена.
 */
function handleMessageCopy(_event: MouseEvent, targetMessage: UIMessage) {
  copyToClipboard(getTextFromMessage(targetMessage));

  isMessageCopied.value = true;

  setTimeout(() => {
    isMessageCopied.value = false;
  }, 2000);
}

/**
 * Извлекает текстовые фрагменты шагов выполнения из сообщения.
 */
function extractStepDetails(targetMessage: UIMessage) {
  const stepParts = targetMessage.parts.filter((part) => part.type === "data-step");
  if (!stepParts.length) return null;

  type StepPayload = { data: { text: string; state: string } };
  const lastStepPayload = stepParts[stepParts.length - 1] as unknown as StepPayload;
  
  return {
    combinedText: stepParts.map((part) => (part as unknown as StepPayload).data.text).join(""),
    isCurrentlyStreaming: lastStepPayload.data.state === "active",
  };
}

onMounted(() => {
  if (!selectedBookForChat.value) return;

  // Если передан промпт через URL, отправляем его сразу
  if (currentRoute.query.prompt) {
    chatSession.sendMessage({ text: currentRoute.query.prompt as string });
    const appRouter = useRouter();
    appRouter.replace({ query: {} });
  } else if (currentChatData.value?.messages.length === 1) {
    // Регенерируем ответ, если в чате только приветствие/первое сообщение
    chatSession.regenerate();
  }
});
</script>

<template>
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
          <UChatMessages
            should-auto-scroll
            :messages="chatSession.messages"
            :status="chatSession.status"
            :assistant="
              chatSession.status !== 'streaming'
                ? {
                    actions: [
                      {
                        label: t('chat.copy'),
                        icon: isMessageCopied ? 'i-lucide-copy-check' : 'i-lucide-copy',
                        onClick: handleMessageCopy,
                      },
                    ],
                  }
                : { actions: [] }
            "
            :spacing-offset="160"
            class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
          >
            <template #content="{ message }">
              <!-- Отображаем все шаги конвейера в едином блоке размышлений -->
              <AppReasoning
                v-if="extractStepDetails(message)"
                :text="extractStepDetails(message)!.combinedText"
                :is-streaming="extractStepDetails(message)!.isCurrentlyStreaming"
              />

              <template
                v-for="(part, index) in message.parts"
                :key="`${message.id}-${part.type}-${index}${'state' in part ? `-${(part as any).state}` : ''}`"
              >
                <!-- Рендерим Markdown только для сообщений ассистента -->
                <MDCCached
                  v-if="part.type === 'text' && message.role === 'assistant'"
                  :value="(part as any).text"
                  :cache-key="`${message.id}-${index}`"
                  :components="customComponents"
                  :parser-options="{ highlight: false }"
                  class="*:first:mt-0 *:last:mb-0"
                />
                <!-- Сообщения пользователя рендерим как обычный текст -->
                <p
                  v-else-if="part.type === 'text' && message.role === 'user'"
                  class="whitespace-pre-wrap"
                >
                  {{ (part as any).text }}
                </p>
              </template>

              <!-- Цитаты из первоисточников -->
              <template
                v-for="(part, index) in message.parts"
                :key="`cit-${message.id}-${index}`"
              >
                <AppCitations
                  v-if="part.type === 'data-chunks'"
                  :chunks="(part as any).data"
                />
              </template>
            </template>
          </UChatMessages>

          <UChatPrompt
            v-model="chatUserInput"
            :placeholder="t('chat.placeholder')"
            :error="chatSession.error"
            variant="subtle"
            class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
            :ui="{ base: 'px-1.5' }"
            @submit="handleChatSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1 flex-1 min-w-0">
                <USelectMenu
                  v-model="selectedBookForChat"
                  :items="availableBooks"
                  label-key="label"
                  :placeholder="t('chat.selectBook')"
                  :search-input="{ placeholder: t('chat.searchBooks') }"
                  :disabled="chatSession.messages.length > 0"
                  class="w-full"
                  variant="ghost"
                  size="sm"
                  color="neutral"
                >
                  <template #leading>
                    <UIcon name="i-lucide-book" class="size-4" />
                  </template>

                  <template #item="{ item }">
                    <span class="truncate">{{ item.title }}</span>
                  </template>

                  <template #empty="{ searchTerm }">
                    <span v-if="searchTerm">{{
                      t("chat.noMatchingBooks")
                    }}</span>
                    <span v-else>{{ t("chat.noBooks") }}</span>
                  </template>
                </USelectMenu>
              </div>

              <UChatPromptSubmit
                :status="chatSession.status"
                color="neutral"
                size="sm"
                @stop="chatSession.stop()"
                @reload="chatSession.regenerate()"
              />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
