// Pont optionnel avec l'APK Android natif. Inactif dans le navigateur/PWA classique.
const B = () => globalThis.AndroidAgenda && typeof globalThis.AndroidAgenda === 'object' ? globalThis.AndroidAgenda : null;
export const isNative = () => Boolean(B());
export function permissionState() { try { return B()?.notificationPermissionState?.() || 'unsupported'; } catch { return 'unsupported'; } }
export function requestNotifications() { try { const b = B(); if (!b || typeof b.requestNotifications !== 'function') return false; b.requestNotifications(); return true; } catch { return false; } }
export function chooseSound() { try { B()?.pickNotificationSound?.(); return true; } catch { return false; } }
export function removeSound() { try { B()?.removeNotificationSound?.(); return true; } catch { return false; } }
export function openNotificationSettings() { try { B()?.openNotificationSettings?.(); return true; } catch { return false; } }
export function openExactAlarmSettings() { try { B()?.openExactAlarmSettings?.(); return true; } catch { return false; } }
export function exactAlarmAllowed() { try { return Boolean(B()?.exactAlarmAllowed?.()); } catch { return false; } }
export function saveFile(name, mime, text) { try { const b = B(); if (!b || typeof b.saveFile !== 'function') return false; b.saveFile(String(name), String(mime), String(text)); return true; } catch { return false; } }
export function previewSound() { try { B()?.previewNotificationSound?.(); return true; } catch { return false; } }
export function showNotification(title, body, taskId, tag) { try { return Boolean(B()?.showNotification?.(title, body, taskId, tag)); } catch { return false; } }
export function scheduleReminder(id, at, title, body, taskId, tag) { try { const b = B(); if (!b || typeof b.scheduleReminder !== 'function' || !Number.isFinite(Number(at)) || Number(at) <= Date.now()) return false; b.scheduleReminder(String(id), Number(at), String(title || 'Rappel'), String(body || 'Rappel de tâche'), String(taskId || id), String(tag || `n_${id}`)); return true; } catch { return false; } }
export function cancelReminder(id) { try { const b = B(); if (!b || typeof b.cancelReminder !== 'function') return false; b.cancelReminder(String(id)); return true; } catch { return false; } }
