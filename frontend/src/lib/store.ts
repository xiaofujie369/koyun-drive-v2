import { reactive } from 'vue'
import { api, type SiteConfig, type UserInfo } from './api'

export const store = reactive({
  ready: false,
  config: null as SiteConfig | null,
  user: null as UserInfo | null,
})

export async function loadConfig() {
  try {
    const c = await api.config()
    store.config = c
    store.user = c.user
    document.title = c.site_name
  } finally {
    store.ready = true
  }
}

export async function refreshUser() {
  store.user = (await api.me()).user
}
