#!/usr/bin/env node
/**
 * 主催者画面（オーバーレイ）テスト
 *
 * Firestoreから感謝データを取得して表示をテスト
 *
 * 使い方:
 *   node scripts/test-overlay.js [eventCode]
 *
 *   eventCode を省略すると TEST001 を使用
 */

require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, orderBy } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: 'appreciate-54692.firebaseapp.com',
  projectId: 'appreciate-54692',
  storageBucket: 'appreciate-54692.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID'
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function fetchGratitudes(eventCode) {
  console.log(`\n📊 感謝データ取得: eventCode = ${eventCode}\n`);

  try {
    const q = query(
      collection(db, 'gratitudes'),
      where('eventCode', '==', eventCode)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ 感謝データが見つかりません');
      console.log('\n💡 テストDMから感謝を送信してからもう一度お試しください');
      console.log('   node scripts/test-slack-dm.js your-email@example.com');
      return;
    }

    console.log(`✅ ${snapshot.size} 件の感謝が見つかりました\n`);
    console.log('─'.repeat(50));

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n[${index + 1}] ${data.emojis?.join('') || '🙏'}`);
      if (data.message) {
        console.log(`    "${data.message}"`);
      }
      if (data.slackUserName) {
        console.log(`    from: ${data.slackUserName}`);
      }
      if (data.createdAt) {
        const date = data.createdAt.toDate?.() || new Date(data.createdAt);
        console.log(`    at: ${date.toLocaleString('ja-JP')}`);
      }
    });

    console.log('\n' + '─'.repeat(50));
    console.log('\n🖥️  主催者画面で表示するには:');
    console.log('   npm start');
    console.log('   → システムトレイから「テスト通知を送信」を選択');
    console.log('\n');

  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

const eventCode = process.argv[2] || 'TEST001';
fetchGratitudes(eventCode);
