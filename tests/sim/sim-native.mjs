// Simulation du pont Android : vérifie que le code PWA utilise bien le canal natif
// quand il est disponible, sans exécuter Android dans Node.
let calls = [];
globalThis.AndroidAgenda = {
  notificationPermissionState: () => 'granted',
  requestNotifications: () => calls.push(['permission']),
  pickNotificationSound: () => calls.push(['pick']),
  removeNotificationSound: () => calls.push(['remove']),
  previewNotificationSound: () => calls.push(['preview']),
  showNotification: (...a) => { calls.push(['show', ...a]); return true; },
  scheduleReminder: (...a) => calls.push(['schedule', ...a]),
  cancelReminder: id => calls.push(['cancel', id]),
  saveFile: (...a) => calls.push(['save', ...a])
};

const N = await import('../../js/native.js');
const NT = await import('../../js/notifications.js');

function expect(ok, msg) { if (!ok) throw new Error(msg); }
expect(N.isNative(), 'pont Android non détecté');
expect(N.permissionState() === 'granted', 'permission native mal remontée');
expect(NT.permissionState() === 'granted', 'notifications ne basculent pas sur le pont natif');
const task = { id:'n1', title:'Maths', subject:'algebre', type:'homework', note:'Page 42', reminder:{mode:'hour1',notificationId:'n_n1_123'} };
const state = (await import('../../js/state.js')).state;
state.db = { settings:{ notifications:true, sound:true }, tasks:[] };
expect(await NT.show(task), 'notification native non envoyée');
N.scheduleReminder('n1', Date.now()+60000, 'Devoir : Maths', 'Rappel', 'n1', 'n_n1');
N.cancelReminder('n1');
expect(calls.some(x=>x[0]==='show'), 'appel show absent');
expect(calls.some(x=>x[0]==='schedule'), 'appel schedule absent');
expect(calls.some(x=>x[0]==='cancel'), 'appel cancel absent');
expect(N.saveFile('sauvegarde.json', 'application/json', '{}') && calls.some(x=>x[0]==='save' && x[1]==='sauvegarde.json'), 'sauvegarde native non transmise');
console.log('Pont Android : OK (permission, notification, programmation, annulation)');
