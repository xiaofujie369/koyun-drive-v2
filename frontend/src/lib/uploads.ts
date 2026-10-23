import { ref } from 'vue'
import { Uploader, type UploadTask } from './uploader'
import { refreshUser } from './store'

// One uploader for the whole SPA so transfers keep running across page changes.
export const uploadTick = ref(0)
let frame = 0
const listeners = new Set<(t: UploadTask) => void>()

export const uploader = new Uploader({
  onChange: () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; uploadTick.value++ })
  },
  onFileDone: (t) => {
    listeners.forEach((fn) => fn(t))
    void refreshUser().catch(() => {})
  },
})

export function onUploadDone(fn: (t: UploadTask) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

window.addEventListener('beforeunload', (e) => {
  if (uploader.active > 0) {
    e.preventDefault()
    e.returnValue = ''
  }
})
