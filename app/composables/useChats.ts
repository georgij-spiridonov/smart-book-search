import { isToday, isYesterday, subDays, subMonths } from "date-fns";

/**
 * Интерфейс для элемента чата в пользовательском интерфейсе.
 */
export interface ChatListItem {
  id: string;
  label: string;
  icon: string;
  to: string;
  createdAt: string;
}

/**
 * Группа чатов, разделенная по временным периодам.
 */
interface ChatGroup {
  id: string;
  label: string;
  items: ChatListItem[];
}

/**
 * Композабл для группировки списка чатов по дате создания.
 * 
 * @param chats - Реактивный список чатов для группировки.
 * @returns Вычисляемое свойство со сгруппированными чатами.
 */
export function useChats(chats: Ref<ChatListItem[] | undefined>) {
  const { t, locale } = useI18n();

  const groups = computed<ChatGroup[]>(() => {
    const list = chats.value;
    if (!list?.length) return [];

    const today: ChatListItem[] = [];
    const yesterday: ChatListItem[] = [];
    const lastWeek: ChatListItem[] = [];
    const lastMonth: ChatListItem[] = [];
    const older: Record<string, ChatListItem[]> = {};

    const now = new Date();
    const oneWeekAgo = subDays(now, 7);
    const oneMonthAgo = subMonths(now, 1);
    const monthYearFormatter = new Intl.DateTimeFormat(locale.value, {
      month: "long",
      year: "numeric",
    });

    // Распределяем чаты по категориям за один проход
    for (const chat of list) {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        today.push(chat);
      } else if (isYesterday(chatDate)) {
        yesterday.push(chat);
      } else if (chatDate >= oneWeekAgo) {
        lastWeek.push(chat);
      } else if (chatDate >= oneMonthAgo) {
        lastMonth.push(chat);
      } else {
        const monthYearKey = `${chatDate.getFullYear()}-${String(chatDate.getMonth() + 1).padStart(2, "0")}`;

        if (!older[monthYearKey]) {
          older[monthYearKey] = [];
        }
        older[monthYearKey].push(chat);
      }
    }

    const groupedChats: ChatGroup[] = [];

    if (today.length > 0) {
      groupedChats.push({
        id: "today",
        label: t("chat.groupToday"),
        items: today,
      });
    }

    if (yesterday.length > 0) {
      groupedChats.push({
        id: "yesterday",
        label: t("chat.groupYesterday"),
        items: yesterday,
      });
    }

    if (lastWeek.length > 0) {
      groupedChats.push({
        id: "last-week",
        label: t("chat.groupLastWeek"),
        items: lastWeek,
      });
    }

    if (lastMonth.length > 0) {
      groupedChats.push({
        id: "last-month",
        label: t("chat.groupLastMonth"),
        items: lastMonth,
      });
    }

    // Добавляем более старые группы, отсортированные по дате (от новых к старым)
    const sortedMonthYearKeys = Object.keys(older).sort((a, b) => b.localeCompare(a));

    for (const key of sortedMonthYearKeys) {
      const items = older[key];
      if (items && items[0]) {
        const representativeDate = new Date(items[0].createdAt);
        if (!isNaN(representativeDate.getTime())) {
          groupedChats.push({
            id: key,
            label: monthYearFormatter.format(representativeDate),
            items,
          });
        }
      }
    }

    return groupedChats;
  });

  return {
    groups,
  };
}
