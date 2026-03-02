import { DefaultChatTransport, type UIMessage } from "ai";
import { toValue, type Ref } from "vue";

/**
 * Кастомный транспорт для чата, который адаптирует формат сообщений AI SDK
 * к специфическим требованиям нашего API (/api/chat).
 *
 * Мы расширяем функционал через DefaultChatTransport, что позволяет 
 * автоматически обрабатывать Server-Sent Events (SSE) и корректно 
 * десериализовать поток сообщений UIMessageStream.
 */
export function createBookChatTransport(bookIds: string[] | Ref<string[]>) {
  return new DefaultChatTransport<UIMessage>({
    // Основной эндпоинт для отправки сообщений
    api: "/api/chat",

    /**
     * Преобразует текущий стек сообщений и метаданные в формат тела запроса,
     * который ожидает наш серверный обработчик.
     * 
     * @param messages - Текущий список сообщений в чате.
     * @param id - Уникальный идентификатор чата.
     * @returns Объект с телом запроса для отправки на сервер.
     */
    prepareSendMessagesRequest({ messages, id: chatId }) {
      // Ищем последнее сообщение пользователя, чтобы использовать его текст как поисковый запрос.
      // Метод findLast работает эффективнее, так как обходит массив с конца без создания копии.
      const lastUserMessage = messages.findLast((message) => message.role === "user");
      
      if (!lastUserMessage) {
        // Внутреннее предупреждение для разработчиков на английском языке
        console.warn("[BookChatTransport] No user message found to extract query from current message stack.");
      }

      // Извлекаем все текстовые части (parts) из сообщения и объединяем их в одну строку.
      // Это гарантирует корректную работу, даже если сообщение состоит из нескольких фрагментов текста.
      const queryText = lastUserMessage?.parts
        ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("") ?? "";

      // Возвращаем сформированное тело запроса согласно схеме API
      return {
        body: {
          query: queryText,
          bookIds: toValue(bookIds),
          chatId,
        },
      };
    },
  });
}
