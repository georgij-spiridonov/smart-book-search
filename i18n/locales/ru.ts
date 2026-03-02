import type { LocaleSchema } from "./schema";

/**
 * Локализация на русском языке.
 * Оптимизирована для высокой скорости работы и полной типобезопасности.
 */
export default defineI18nLocale((): LocaleSchema => {
  return {
    seo: {
      pageTitle: "Умный поиск по книгам",
      pageDescription:
        "Умный поиск по книгам с AI-ассистентом. Задавайте вопросы и получайте ответы на основе текста книг.",
    },

    chat: {
      mainTitle: "Поиск по книгам",
      welcomeMessage: "Что вы хотите узнать?",
      newChatButton: "Новый чат",
      searchChatsPlaceholder: "Поиск чатов...",
      untitledChat: "Без названия",
      deleteChatTitle: "Удалить чат",
      deleteChatConfirm:
        "Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.",
      deleteButton: "Удалить",
      cancelButton: "Отмена",
      chatDeletedSuccess: "Чат удалён",
      chatDeletedDetail: "Ваш чат был удалён",
      deleteChatError: "Не удалось удалить чат. Попробуйте еще раз.",
      processingMessage: "Работа...",
      viewPipelineDetails: "Ход работы",
      groupToday: "Сегодня",
      groupYesterday: "Вчера",
      groupLastWeek: "На прошлой неделе",
      groupLastMonth: "В прошлом месяце",
      inputPlaceholder: "Введите сообщение...",
      selectBookLabel: "Выберите книгу",
      selectBookRequired:
        "Пожалуйста, выберите книгу перед отправкой сообщения",
      searchBooksPlaceholder: "Поиск книг...",
      noBooksFound: "Нет книг",
      noMatchingBooks: "Книги не найдены",
      copyCitation: "Копировать",
      copyCitationSuccess: "Цитата скопирована в буфер обмена",
      citationLabel: "Цитата",
      citationsLabel: "Цитаты",
      untitledChapter: "Глава без названия",
      chatNotFound: "Чат не найден",
      viewSourceCode: "Исходный код",
    },

    error: {
      backToHomeButton: "На главную",
      pageNotFoundTitle: "Страница не найдена",
      pageNotFoundDetail:
        "Запрашиваемая страница не существует или была перемещена.",
      internalServerErrorTitle: "Ошибка сервера",
      unexpectedError: "Произошла непредвиденная ошибка",
      internalServerErrorDetail: "На нашей стороне что-то пошло не так.",
      required: "Поле обязательно для заполнения",
    },

    library: {
      mainTitle: "Библиотека",
      mainDescription: "Управление книгами и документами",
      uploadBookButton: "Загрузить книгу",
      uploadModalTitle: "Загрузить новую книгу",
      startChatButton: "Начать чат",
      closeButton: "Закрыть",
      columnAuthor: "Автор",
      columnPage: "Страница",
      columnSize: "Размер",
      columnUploadedAt: "Загружена",
      columnStatus: "Статус",
      statusProcessed: "Обработана",
      statusPending: "В очереди",
      statusProcessing: "Обработка",
      statusWaiting: "В ожидании",
      statusUploading: "Загрузка...",
      statusError: "Ошибка",
      selectFileLabel: "Выберите файл для загрузки",
      dropzoneMainLabel: "Перетащите сюда PDF, TXT или EPUB",
      dropzoneDescription: "Поддерживаемые форматы: .pdf, .txt, .epub",
      fileLabel: "Файл",
      coverUrlLabel: "URL обложки (необязательно)",
      bookTitleLabel: "Название",
      uploadSubmitButton: "Загрузить",
      uploadSuccessMessage: "Книга успешно загружена",
      statusVectorizing: "Векторизация...",
      vectorizeSuccessMessage: "Книга успешно обработана",
      unknownValue: "Неизвестен",
      deleteBookTitle: "Удалить книгу",
      deleteButton: "Удалить",
      deleteBookConfirm:
        "Вы уверены, что хотите полностью удалить эту книгу? Это действие нельзя отменить.",
      deleteBookSuccess: "Книга полностью удалена",
      editBookTitle: "Редактировать метаданные",
      editButton: "Редактировать",
      saveButton: "Сохранить",
      updateSuccessMessage: "Метаданные книги успешно обновлены",
    },

    admin: {
      mainTitle: "Доступ администратора",
      mainDescription:
        "Авторизуйтесь для получения расширенных прав по управлению контентом на платформе.",
      passwordField: "Пароль",
      loginButton: "Включить доступ",
      logoutButton: "Отключить доступ",
      accessGrantedMessage: "Доступ разрешен",
      accessRevokedMessage: "Доступ отозван",
      redirectingMessage: "Включение режима администратора...",
      redirectingHomeMessage: "Переход на главную...",
      loginErrorMessage: "Ошибка входа",
    },
  };
});
