<script setup lang="ts">
import { Chat } from "@ai-sdk/vue";
import type { UIMessage } from "ai";
import { useClipboard } from "@vueuse/core";
import { getTextFromMessage } from "@nuxt/ui/utils/ai";
import { createBookChatTransport } from "~/utils/BookChatTransport";
import type { Book } from "../../../shared/types/book";

/**
 * Страница конкретного чата.
 * Обеспечивает интерфейс общения с ИИ на основе содержимого выбранной книги.
 */

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const { copy: copyToClipboard } = useClipboard();

// Загрузка данных текущего чата
const { data: chatData } = await useFetch<{
  id: string;
  bookIds: string[];
  messages: UIMessage[];
}>(() => `/api/chats/${route.params.id}`, {
  key: `chat-session-${route.params.id}`,
});

if (!chatData.value) {
  throw createError({ statusCode: 404, statusMessage: t("chat.chatNotFound") });
}

definePageMeta({
  key: (route) => route.params.id as string,
});

// Загрузка списка всех книг для возможности смены (если чат пустой) или отображения названия
const { data: booksData } = await useFetch<{ books: Book[] }>("/api/books");
const availableBooks = computed(() =>
  (booksData.value?.books || []).map((book) => ({
    ...book,
    label: book.author ? `${book.author} / ${book.title}` : book.title,
  })),
);

// Текущая активная книга для этого чата
const activeBook = ref<(Book & { label: string }) | undefined>(undefined);

// Синхронизация выбранной книги с данными чата при загрузке
watch(
  [availableBooks, chatData],
  ([books, data]) => {
    if (data?.bookIds && books.length) {
      activeBook.value = books.find((book) => data.bookIds?.includes(book.id));
    }
  },
  { immediate: true },
);

// Текст в поле ввода сообщения
const promptInput = ref("");

// Инициализация сессии чата через AI SDK
const chat = new Chat({
  id: chatData.value.id,
  messages: (chatData.value.messages || []) as unknown as UIMessage[],
  transport: createBookChatTransport(
    computed(() => (activeBook.value ? [activeBook.value.id] : [])),
  ),
  onError(error) {
    console.error("Chat session error:", error);
    
    let message = t("error.unexpectedError");
    try {
      if (typeof error.message === "string" && error.message.startsWith("{")) {
        const parsed = JSON.parse(error.message);
        message = parsed.message || message;
      } else {
        message = error.message || message;
      }
    } catch (e) {
      console.warn("Failed to parse error message:", e);
    }
        
    toast.add({
      description: message,
      icon: "i-lucide-alert-circle",
      color: "error",
      duration: 0,
    });
  },
});

/**
 * Обработчик отправки сообщения.
 */
async function onChatSubmit(event: Event) {
  event.preventDefault();
  
  if (!activeBook.value) {
    toast.add({
      title: t("chat.selectBookRequired"),
      icon: "i-lucide-alert-circle",
      color: "error",
    });
    return;
  }

  const trimmedPrompt = promptInput.value.trim();
  if (trimmedPrompt) {
    chat.sendMessage({
      text: trimmedPrompt,
    });
    promptInput.value = "";
  }
}

const hasCopied = ref(false);

/**
 * Копирует текст сообщения в буфер обмена.
 * @param _event Событие клика.
 * @param message Объект сообщения для копирования.
 */
function copyMessageContent(_event: MouseEvent, message: UIMessage) {
  copyToClipboard(getTextFromMessage(message));
  hasCopied.value = true;
  setTimeout(() => {
    hasCopied.value = false;
  }, 2000);
}

/**
 * Извлекает данные о промежуточных шагах выполнения (reasoning) из сообщения.
 * @param message Объект сообщения.
 */
function getMessageSteps(message: UIMessage) {
  const stepParts = message.parts.filter((part) => part.type === "data-step");
  if (!stepParts.length) return null;

  type StepPayload = { data: { text: string; state: string } };
  const lastStep = stepParts[stepParts.length - 1] as unknown as StepPayload;
  
  return {
    combinedText: stepParts.map((part) => (part as unknown as StepPayload).data.text).join(""),
    isStreaming: lastStep.data.state === "active",
  };
}

onMounted(() => {
  if (!activeBook.value) return;

  // Автоматическая отправка промпта, если он передан в URL
  const initialPrompt = route.query.prompt as string;
  if (initialPrompt) {
    chat.sendMessage({ text: initialPrompt });
    // Очищаем query-параметры после использования
    router.replace({ query: {} });
  } else if (chatData.value?.messages.length === 1) {
    // Если чат только что создан (содержит только приветствие), генерируем первый ответ
    chat.regenerate();
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
          <!-- Список сообщений -->
          <UChatMessages
            should-auto-scroll
            :messages="chat.messages"
            :status="chat.status"
            :assistant="
              chat.status !== 'streaming'
                ? {
                    actions: [
                      {
                        label: t('chat.copyCitation'),
                        icon: hasCopied ? 'i-lucide-copy-check' : 'i-lucide-copy',
                        onClick: copyMessageContent,
                      },
                    ],
                  }
                : { actions: [] }
            "
            :spacing-offset="160"
            class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
          >
            <template #content="{ message }">
              <!-- Отображение процесса размышления ИИ (reasoning) -->
              <AppReasoning
                v-if="getMessageSteps(message)"
                :text="getMessageSteps(message)!.combinedText"
                :is-streaming="getMessageSteps(message)!.isStreaming"
              />

              <!-- Основное содержимое сообщения -->
              <template
                v-for="(part, index) in message.parts"
                :key="`${message.id}-${part.type}-${index}`"
              >
                <!-- Текст ассистента с поддержкой Markdown -->
                <MDCCached
                  v-if="part.type === 'text' && message.role === 'assistant'"
                  :value="(part as any).text"
                  :cache-key="`${message.id}-${index}`"
                  :parser-options="{ highlight: false }"
                  class="*:first:mt-0 *:last:mb-0"
                />
                <!-- Текст пользователя как обычный текст -->
                <p
                  v-else-if="part.type === 'text' && message.role === 'user'"
                  class="whitespace-pre-wrap"
                >
                  {{ (part as any).text }}
                </p>
              </template>

              <!-- Цитаты и источники -->
              <template
                v-for="(part, index) in message.parts"
                :key="`citation-${message.id}-${index}`"
              >
                <AppCitations
                  v-if="part.type === 'data-chunks'"
                  :chunks="(part as any).data"
                />
              </template>
            </template>
          </UChatMessages>

          <!-- Поле ввода промпта -->
          <UChatPrompt
            v-model="promptInput"
            :placeholder="t('chat.inputPlaceholder')"
            :error="chat.error"
            variant="subtle"
            class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
            :ui="{ base: 'px-1.5' }"
            @submit="onChatSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1 flex-1 min-w-0">
                <!-- Выбор книги (доступен только в начале чата) -->
                <USelectMenu
                  v-model="activeBook"
                  :items="availableBooks"
                  label-key="label"
                  :placeholder="t('chat.selectBookLabel')"
                  :search-input="{ placeholder: t('chat.searchBooksPlaceholder') }"
                  :disabled="chat.messages.length > 0"
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
                    <span v-else>{{ t("chat.noBooksFound") }}</span>
                  </template>
                </USelectMenu>
              </div>

              <!-- Кнопки управления отправкой -->
              <UChatPromptSubmit
                :status="chat.status"
                color="neutral"
                size="sm"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>