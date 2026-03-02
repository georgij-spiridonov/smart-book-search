/**
 * Внутренние интерфейсы для централизованного управления структурой данных.
 * Это позволяет избежать дублирования кода при расширении нескольких модулей.
 */
interface BaseUser {
  /** Уникальный идентификатор пользователя (UUID) */
  id: string;
  /** Признак администратора для доступа к защищенным функциям */
  isAdmin: boolean;
}

interface BaseUserSession {
  /** Стабильный идентификатор посетителя, сохраняющийся между визитами */
  id: string;
  /** Данные пользователя (если он авторизован) */
  user?: BaseUser;
  /** Дополнительные метаданные сессии */
  [key: string]: any;
}

/**
 * Расширение типов для внешнего модуля nuxt-auth-utils.
 */
declare module "nuxt-auth-utils" {
  interface User extends BaseUser {}
  interface UserSession extends BaseUserSession {}
}

/**
 * Расширение типов для внутреннего алиаса Nuxt (#auth-utils).
 */
declare module "#auth-utils" {
  interface User extends BaseUser {}
  interface UserSession extends BaseUserSession {}
}

export {}
