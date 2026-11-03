import * as Native from './native.js';

// Son de notification personnalisé : stocké localement dans IndexedDB.
// Le navigateur ne permet pas à une PWA de choisir le son système d'une notification.
// Ce module sert au choix, à l'aperçu et à la lecture quand l'application est visible.
const DB_NAME = 'agenda-etoile-media';
const DB_VERSION = 1;
const STORE = 'sounds';
const KEY = 'notification';
const MAX_BYTES = 10 * 1024 * 1024;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('indexeddb-unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexeddb-error'));
  });
}

export function chooseNotificationSound() {
  if (!Native.isNative()) return false;
  return new Promise(resolve => { choosePending = resolve; if (!Native.chooseSound()) { choosePending = null; resolve(null); } });
}

export async function saveNotificationSound(file) {
  if (!(file instanceof Blob) || !file.type.startsWith('audio/')) throw new Error('audio-required');
  if (file.size > MAX_BYTES) throw new Error('audio-too-large');
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob: file, name: String(file.name || 'Son personnalisé').slice(0, 120), type: file.type, size: file.size }, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('indexeddb-write'));
  });
  db.close();
  return { name: String(file.name || 'Son personnalisé').slice(0, 120), size: file.size, type: file.type };
}

export async function getNotificationSound() {
  try {
    const db = await openDB();
    const item = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('indexeddb-read'));
    });
    db.close();
    return item;
  } catch { return null; }
}

export async function deleteNotificationSound() {
  if (Native.isNative()) return Native.removeSound();
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('indexeddb-delete'));
    });
    db.close();
    return true;
  } catch { return false; }
}

let currentAudio = null;
let choosePending = null;
if (typeof window !== 'undefined') {
  window.__agendaNativeSoundSelected = name => {
    if (!choosePending) return;
    const p = choosePending; choosePending = null; p(name || null);
  };
}
export async function previewNotificationSound() {
  if (Native.isNative()) {
    return Native.previewSound();
  }
  const item = await getNotificationSound();
  if (!item?.blob) return false;
  try {
    if (currentAudio) { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); }
    const url = URL.createObjectURL(item.blob);
    const audio = new Audio(url);
    audio.volume = 1;
    currentAudio = audio;
    audio.addEventListener('ended', () => { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; }, { once: true });
    await audio.play();
    return true;
  } catch { return false; }
}

export function stopPreview() {
  if (!currentAudio) return;
  try { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); } catch {}
  currentAudio = null;
}

export async function playNotificationSoundIfAvailable() {
  return previewNotificationSound();
}

export const MAX_SOUND_BYTES = MAX_BYTES;
