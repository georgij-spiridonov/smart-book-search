<script setup lang="ts">
import type { Book } from "../../shared/types/book";

/**
 * Главная страница приложения для инициации нового чата с выбранной книгой.
 */

const { t } = useI18n();
const route = useRoute();
const toast = useToast();

// Текст текущего запроса пользователя
const chatPrompt = ref("");
// Состояние загрузки (создание чата)
const isProcessing = ref(false);

// Получение списка всех доступных книг
const { data: rawBooksResponse } = await useFetch<{ books: Book[] }>("/api/books", {
  key: "available-books-list",
});

// Форматированный список книг для выпадающего меню
const availableBooks = computed(() => {
  const books = rawBooksResponse.value?.books ?? [];
  return books.map((book) => ({
    ...book,
    label: book.author ? `${book.author} / ${book.title}` : book.title,
  }));
});

// Текущая выбранная книга (инициализируется из query-параметра bookId, если он есть)
const currentSelectedBook = ref(
  availableBooks.value.find((book) => book.id === route.query.bookId)
);

/**
 * Создает новый чат и перенаправляет пользователя на страницу чата.
 * @param prompt Текст первого сообщения в чате.
 */
async function initiateNewChat(prompt: string) {
  if (!currentSelectedBook.value) {
    toast.add({
      title: t("chat.selectBookRequired"),
      icon: "i-lucide-alert-circle",
      color: "error",
    });
    return;
  }

  chatPrompt.value = prompt;
  isProcessing.value = true;

  try {
    const createdChat = await $fetch<{ id: string }>("/api/chats", {
      method: "POST",
      body: {
        bookIds: [currentSelectedBook.value.id],
      },
    });

    if (createdChat?.id) {
      // Обновляем данные чатов в фоне и переходим к новому чату
      refreshNuxtData("chats");
      await navigateTo(`/chat/${createdChat.id}?prompt=${encodeURIComponent(prompt)}`);
    } else {
      throw new Error("Failed to create chat: no ID returned");
    }
  } catch (error) {
    console.error("Error while creating a new chat session:", error);
    toast.add({
      title: t("error.unexpectedError"),
      icon: "i-lucide-x-circle",
      color: "error",
    });
  } finally {
    isProcessing.value = false;
  }
}

/**
 * Обработчик отправки формы.
 */
async function onPromptSubmit() {
  const trimmedPrompt = chatPrompt.value.trim();
  if (!trimmedPrompt) return;
  
  await initiateNewChat(trimmedPrompt);
}
</script>

<template>
  <UDashboardPanel id="home" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer
          class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8"
        >
          <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
            {{ t("chat.welcomeMessage") }}
          </h1>

          <UChatPrompt
            v-model="chatPrompt"
            :placeholder="t('chat.inputPlaceholder')"
            :status="isProcessing ? 'streaming' : 'ready'"
            class="[view-transition-name:chat-prompt]"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onPromptSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1 flex-1 min-w-0">
                <USelectMenu
                  v-model="currentSelectedBook"
                  :items="availableBooks"
                  label-key="label"
                  :placeholder="t('chat.selectBookLabel')"
                  :search-input="{ placeholder: t('chat.searchBooksPlaceholder') }"
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

              <UChatPromptSubmit color="neutral" size="sm" />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
