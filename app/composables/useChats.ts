import { isToday, isYesterday, subMonths } from "date-fns";

export interface UIChat {
  id: string;
  label: string;
  icon: string;
  to: string;
  createdAt: string;
}

export function useChats(chats: Ref<UIChat[] | undefined>) {
  const { t } = useI18n();

  const groups = computed(() => {
    const today: UIChat[] = [];
    const yesterday: UIChat[] = [];
    const lastWeek: UIChat[] = [];
    const lastMonth: UIChat[] = [];
    const older: Record<string, UIChat[]> = {};

    const oneWeekAgo = subMonths(new Date(), 0.25); // ~7 days ago
    const oneMonthAgo = subMonths(new Date(), 1);

    chats.value?.forEach((chat) => {
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
        const monthYear = chatDate.toLocaleDateString("ru-RU", {
          month: "long",
          year: "numeric",
        });

        if (!older[monthYear]) {
          older[monthYear] = [];
        }
        older[monthYear].push(chat);
      }
    });

    const sortedMonthYears = Object.keys(older).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });

    const formattedGroups = [] as Array<{
      id: string;
      label: string;
      items: UIChat[];
    }>;

    if (today.length) {
      formattedGroups.push({
        id: "today",
        label: t("chat.today"),
        items: today,
      });
    }

    if (yesterday.length) {
      formattedGroups.push({
        id: "yesterday",
        label: t("chat.yesterday"),
        items: yesterday,
      });
    }

    if (lastWeek.length) {
      formattedGroups.push({
        id: "last-week",
        label: t("chat.lastWeek"),
        items: lastWeek,
      });
    }

    if (lastMonth.length) {
      formattedGroups.push({
        id: "last-month",
        label: t("chat.lastMonth"),
        items: lastMonth,
      });
    }

    sortedMonthYears.forEach((monthYear) => {
      if (older[monthYear]?.length) {
        formattedGroups.push({
          id: monthYear,
          label: monthYear,
          items: older[monthYear],
        });
      }
    });

    return formattedGroups;
  });

  return {
    groups,
  };
}
