/**
 * Схема для всех файлов локализации.
 * Обеспечивает полную типобезопасность и соответствие ключей во всех языках.
 */
export interface LocaleSchema {
  /** Настройки SEO и заголовки страниц */
  seo: {
    pageTitle: string;
    pageDescription: string;
  };

  /** Функционал чата и поиска по книгам */
  chat: {
    mainTitle: string;
    welcomeMessage: string;
    newChatButton: string;
    searchChatsPlaceholder: string;
    untitledChat: string;
    deleteChatTitle: string;
    deleteChatConfirm: string;
    deleteButton: string;
    cancelButton: string;
    chatDeletedSuccess: string;
    chatDeletedDetail: string;
    deleteChatError: string;
    processingMessage: string;
    viewPipelineDetails: string;
    groupToday: string;
    groupYesterday: string;
    groupLastWeek: string;
    groupLastMonth: string;
    inputPlaceholder: string;
    selectBookLabel: string;
    selectBookRequired: string;
    searchBooksPlaceholder: string;
    noBooksFound: string;
    noMatchingBooks: string;
    copyCitation: string;
    copyCitationSuccess: string;
    citationLabel: string;
    citationsLabel: string;
    untitledChapter: string;
    chatNotFound: string;
    viewSourceCode: string;
  };

  /** Общие сообщения об ошибках */
  error: {
    backToHomeButton: string;
    pageNotFoundTitle: string;
    pageNotFoundDetail: string;
    internalServerErrorTitle: string;
    unexpectedError: string;
    internalServerErrorDetail: string;
  };

  /** Библиотека книг и документов */
  library: {
    mainTitle: string;
    mainDescription: string;
    uploadBookButton: string;
    uploadModalTitle: string;
    startChatButton: string;
    closeButton: string;
    columnAuthor: string;
    columnPage: string;
    columnSize: string;
    columnUploadedAt: string;
    columnStatus: string;
    statusProcessed: string;
    statusPending: string;
    statusProcessing: string;
    statusWaiting: string;
    statusUploading: string;
    statusError: string;
    selectFileLabel: string;
    dropzoneMainLabel: string;
    dropzoneDescription: string;
    fileLabel: string;
    coverUrlLabel: string;
    bookTitleLabel: string;
    uploadSubmitButton: string;
    uploadSuccessMessage: string;
    statusVectorizing: string;
    vectorizeSuccessMessage: string;
    unknownValue: string;
    deleteBookTitle: string;
    deleteButton: string;
    deleteBookConfirm: string;
    deleteBookSuccess: string;
    editBookTitle: string;
    editButton: string;
    saveButton: string;
    updateSuccessMessage: string;
  };

  /** Панель администратора */
  admin: {
    mainTitle: string;
    mainDescription: string;
    passwordField: string;
    loginButton: string;
    logoutButton: string;
    accessGrantedMessage: string;
    accessRevokedMessage: string;
    redirectingMessage: string;
    redirectingHomeMessage: string;
    loginErrorMessage: string;
  };
}
