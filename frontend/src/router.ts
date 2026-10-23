import { createRouter, createWebHistory } from 'vue-router'
import { store } from './lib/store'

export const router = createRouter({
  history: createWebHistory('/'),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/folder/:id(\\d+)', name: 'folder', component: () => import('./views/FolderView.vue') },
    { path: '/search', name: 'search', component: () => import('./views/SearchView.vue') },
    { path: '/s/:token', name: 'share', component: () => import('./views/ShareView.vue') },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/drive/:folder(\\d+)?', name: 'drive', component: () => import('./views/DriveView.vue'), meta: { auth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta.auth && store.ready && !store.user) return { name: 'login', query: { redirect: to.fullPath } }
})
