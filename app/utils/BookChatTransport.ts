import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

/**
 * Custom ChatTransport that bridges AI SDK's Chat class format
 * with our /api/chat endpoint which expects {query, bookIds, chatId}.
 *
 * Extends DefaultChatTransport so we get proper SSE/UIMessageStream
 * parsing for free. We only customize the request body via
 * prepareSendMessagesRequest.
 */
export function createBookChatTransport(bookIds: string[] | Ref<string[]>) {
  return new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest({ messages, id }) {
      // Extract the last user message text as the query
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      const query =
        lastUserMessage?.parts
          ?.filter(
            (p): p is { type: "text"; text: string } => p.type === "text",
          )
          .map((p) => p.text)
          .join("") || "";

      return {
        body: {
          query,
          bookIds: toValue(bookIds),
          chatId: id,
        },
      };
    },
  });
}
