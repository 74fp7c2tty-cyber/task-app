// サービスワーカー：アプリを閉じてもブラウザの裏で動くプログラム
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// あなたのFirebase設定（App.jsxと同じもの）
firebase.initializeApp({
  apiKey: "AIzaSyDRu18T2yEvoDwm19-nQaEwrOfNwBGeRGk",
  authDomain: "task-manager-d1570.firebaseapp.com",
  projectId: "task-manager-d1570",
  storageBucket: "task-manager-d1570.firebasestorage.app",
  messagingSenderId: "569544638136",
  appId: "1:569544638136:web:63da55e24228c9a695be4d"
});

const messaging = firebase.messaging();

// アプリが閉じている時に通知が届いた時の処理
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
