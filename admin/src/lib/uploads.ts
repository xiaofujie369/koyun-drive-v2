import { useSyncExternalStore } from 'react'
import { Uploader, type UploadTask } from './uploader'

// One uploader for the whole admin app so transfers survive page navigation.
let version = 0
let frame = 0
const subscribers = new Set<() => void>()
const doneListeners = new Set<(t: UploadTask) => void>()

export const uploader = new Uploader({
  chunkConcurrency: 4,
  onChange: () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      version++
      subscribers.forEach((fn) => fn())
    })
  },
  onFileDone: (t) => doneListeners.forEach((fn) => fn(t)),
})

export function useUploads() {
  useSyncExternalStore((cb) => { subscribers.add(cb); return () => subscribers.delete(cb) }, () => version)
  return uploader
}

export function onUploadDone(fn: (t: UploadTask) => void) {
  doneListeners.add(fn)
  return () => { doneListeners.delete(fn) }
}

window.addEventListener('beforeunload', (e) => {
  if (uploader.active > 0) {
    e.preventDefault()
    e.returnValue = ''
  }
})
