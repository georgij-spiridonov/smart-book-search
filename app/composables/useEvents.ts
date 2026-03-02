export function useEvents() {
  const eventSource = ref<EventSource | null>(null);

  onMounted(() => {
    // Connect to the SSE endpoint
    const es = new EventSource("/api/events");
    eventSource.value = es;

    es.addEventListener("chat:updated", (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log("[SSE] Chat updated event received:", payload);
        // Refresh the chats list globally
        refreshNuxtData("chats").then(() => {
          console.log("[SSE] chats data refreshed after update");
        });
      } catch (e) {
        console.error("Failed to parse chat update event", e);
      }
    });

    es.addEventListener("book:updated", (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Refresh the books list globally
        refreshNuxtData("books");
        console.log("Book updated:", payload);
      } catch (e) {
        console.error("Failed to parse book update event", e);
      }
    });

    es.addEventListener("job:updated", (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Refresh the books list to show progress
        refreshNuxtData("books");
        console.log("Job updated:", payload);
      } catch (e) {
        console.error("Failed to parse job update event", e);
      }
    });

    es.onerror = (error) => {
      console.error("EventSource failed:", error);
      // EventSource will automatically retry connecting
    };
  });

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
