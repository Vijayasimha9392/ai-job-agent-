// =====================================================================
// Firebase Cloud Messaging (FCM) Service Worker - Web Push Receiver
// =====================================================================

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// Fallback background message handler if Firebase config is passed
self.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const payload = event.data.json();
      const notificationTitle = payload.notification?.title || payload.title || "🔥 Job Hunter AI Alert";
      const notificationOptions = {
        body: payload.notification?.body || payload.body || "New high-match software job discovered.",
        icon: "/icon.png",
        badge: "/badge.png",
        data: payload.data || {},
        tag: "job-hunter-alert",
        renotify: true
      };

      event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
      );
    } catch (e) {
      event.waitUntil(
        self.registration.showNotification("🔥 Job Hunter AI Alert", {
          body: event.data.text()
        })
      );
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
