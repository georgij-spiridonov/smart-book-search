/**
 * Типы данных для событий, получаемых через SSE.
 */
interface BaseEventPayload {
  id: string;
  [key: string]: unknown;
}

/**
 * Композабл для управления Server-Sent Events (SSE).
 * Подписывается на обновления чатов, книг и фоновых задач.
 */
export function useEvents() {
  const eventSource = ref<EventSource | null>(null);

  onMounted(() => {
    // Подключаемся к эндпоинту событий
    const es = new EventSource("/api/events");
    eventSource.value = es;

    // Обработка обновления чата
    es.addEventListener("chat:updated", (event: MessageEvent) => {
      try {
        const payload: BaseEventPayload = JSON.parse(event.data);
        console.info("[SSE] Chat update received:", payload.id);
        
        // Глобальное обновление данных чатов
        refreshNuxtData("chats").catch((error) => {
          console.error("[SSE] Failed to refresh chats data:", error);
        });
      } catch (error) {
        console.error("[SSE] Error parsing chat update payload:", error);
      }
    });

    // Обработка обновления книги
    es.addEventListener("book:updated", (event: MessageEvent) => {
      try {
        const payload: BaseEventPayload = JSON.parse(event.data);
        console.info("[SSE] Book update received:", payload.id);
        
        // Обновляем список книг для отображения актуального статуса
        refreshNuxtData("books");
      } catch (error) {
        console.error("[SSE] Error parsing book update payload:", error);
      }
    });

    // Обработка обновления статуса фоновой задачи
    es.addEventListener("job:updated", (event: MessageEvent) => {
      try {
        const payload: BaseEventPayload = JSON.parse(event.data);
        console.info("[SSE] Job progress updated:", payload.id);
        
        // Обновляем список книг для отображения прогресса векторизации
        refreshNuxtData("books");
      } catch (error) {
        console.error("[SSE] Error parsing job update payload:", error);
      }
    });

    // Обработка ошибок соединения
    es.onerror = (error) => {
      console.error("[SSE] Connection error:", error);
      // EventSource автоматически попытается переподключиться
    };
  });

  // Закрываем соединение при уничтожении компонента
  onUnmounted(() => {
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
  });

  return {
    eventSource,
  };
}
