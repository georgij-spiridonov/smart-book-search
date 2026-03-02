<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'

/**
 * Страница администратора для входа в систему управления.
 */

const { t } = useI18n()

// Схема валидации для формы входа администратора
const adminLoginSchema = z.object({
  password: z.string().min(1, t('admin.passwordField') + ' ' + t('error.required'))
})

type AdminLoginFields = z.output<typeof adminLoginSchema>

// Состояние формы входа
const adminLoginForm = reactive({
  password: ''
})

// Состояния процесса аутентификации
const isPending = ref(false)
const loginErrorMessage = ref<string | undefined>(undefined)
const hasAuthenticated = ref(false)

const { user: currentUser, fetch: refreshUserSession } = useUserSession()

// Проверка, является ли текущий пользователь администратором
const isAdmin = computed(() => currentUser.value?.isAdmin === true)

// Сброс ошибки при изменении пароля
watch(() => adminLoginForm.password, () => {
  if (loginErrorMessage.value) loginErrorMessage.value = undefined
})

/**
 * Обрабатывает попытку входа администратора.
 * @param event Событие отправки формы с данными.
 */
async function processAdminLogin(event: FormSubmitEvent<AdminLoginFields>) {
  isPending.value = true
  loginErrorMessage.value = undefined
  
  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: event.data
    })
    
    // Обновляем сессию пользователя после успешного входа
    await refreshUserSession()
    
    hasAuthenticated.value = true
    adminLoginForm.password = ''
    
    // Перенаправляем на главную страницу через небольшую паузу
    setTimeout(() => {
      navigateTo('/')
    }, 1500)
  } catch (error: unknown) {
    console.error('Admin login failed:', error)
    const fetchError = error as { data?: { message?: string; statusMessage?: string } }
    loginErrorMessage.value = fetchError.data?.message || fetchError.data?.statusMessage || t('admin.loginErrorMessage')
  } finally {
    isPending.value = false
  }
}

/**
 * Обрабатывает выход администратора из системы.
 */
async function processAdminLogout() {
  isPending.value = true
  
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
    
    // Полная перезагрузка страницы для сброса всех состояний клиента
    if (import.meta.client) {
      window.location.reload()
    }
  } catch (error) {
    console.error('Admin logout failed:', error)
    loginErrorMessage.value = t('error.unexpectedError')
  } finally {
    isPending.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="admin-login" class="min-h-0">
    <template #body>
      <div class="flex-1 flex items-center justify-center p-4">
        <UCard class="w-full max-w-sm">
          <template #header>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <UIcon :name="isAdmin ? 'i-heroicons-shield-exclamation' : 'i-heroicons-shield-check'" class="w-5 h-5 text-primary" />
                <h1 class="text-xl font-bold">{{ t('admin.mainTitle') }}</h1>
              </div>
              <p class="text-sm text-neutral-500">
                {{ t('admin.mainDescription') }}
              </p>
            </div>
          </template>

          <!-- Интерфейс для уже авторизованного администратора -->
          <div v-if="isAdmin" class="space-y-4">
            <div class="p-3 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 flex items-center gap-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-primary" />
              <p class="text-sm text-primary-700 dark:text-primary-300 font-medium">
                {{ t('admin.accessGrantedMessage') }}
              </p>
            </div>

            <UButton
              block
              :loading="isPending"
              color="error"
              variant="solid"
              icon="i-heroicons-lock-open"
              @click="processAdminLogout"
            >
              {{ t('admin.logoutButton') }}
            </UButton>
          </div>

          <!-- Форма входа -->
          <UForm 
            v-else
            :schema="adminLoginSchema" 
            :state="adminLoginForm" 
            class="space-y-4" 
            @submit="processAdminLogin"
          >
            <UFormField :label="t('admin.passwordField')" name="password" :error="loginErrorMessage">
              <UInput
                v-model="adminLoginForm.password"
                type="password"
                placeholder="••••••••"
                icon="i-lucide-lock"
                color="neutral"
                variant="outline"
                autocomplete="current-password"
                class="w-full"
                :disabled="isPending || hasAuthenticated"
              />
            </UFormField>

            <UButton
              type="submit"
              block
              :loading="isPending"
              :color="hasAuthenticated ? 'success' : 'primary'"
              :icon="hasAuthenticated ? 'i-heroicons-check' : undefined"
              :disabled="hasAuthenticated"
            >
              {{ hasAuthenticated ? t('admin.accessGrantedMessage') : t('admin.loginButton') }}
            </UButton>

            <p v-if="hasAuthenticated" class="text-sm text-center text-success">
              {{ t('admin.redirectingMessage') }}
            </p>
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
