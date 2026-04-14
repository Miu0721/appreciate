#!/usr/bin/env node
/**
 * Slack DM テスト送信スクリプト
 *
 * 使い方:
 *   node scripts/test-slack-dm.js your-email@example.com
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const testEventCode = 'TEST001';
const testEventTitle = 'テストイベント';

async function sendTestDM(email) {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('❌ SLACK_BOT_TOKEN が .env に設定されていません');
    process.exit(1);
  }

  console.log(`\n📧 Slack DM 送信テスト`);
  console.log(`   宛先: ${email}`);
  console.log(`   イベント: ${testEventTitle}`);
  console.log('');

  try {
    // メールからSlackユーザーを検索
    console.log('🔍 Slackユーザーを検索中...');
    const userResult = await slackClient.users.lookupByEmail({ email });

    if (!userResult.ok || !userResult.user) {
      console.error(`❌ ユーザーが見つかりません: ${email}`);
      process.exit(1);
    }

    const slackUserId = userResult.user.id;
    const userName = userResult.user.real_name || userResult.user.name;
    console.log(`✅ ユーザー発見: ${userName} (${slackUserId})`);

    // DM送信
    console.log('📤 DM 送信中...');
    const result = await slackClient.chat.postMessage({
      channel: slackUserId,
      text: `「${testEventTitle}」が終了しました。感謝を送りましょう！`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📣 *「${testEventTitle}」が終了しました*\n\n主催者に感謝を送りましょう！`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🙏 感謝を送る',
                emoji: true
              },
              style: 'primary',
              action_id: 'open_gratitude_modal',
              value: `${testEventCode}|${testEventTitle}`
            }
          ]
        }
      ]
    });

    if (result.ok) {
      console.log('');
      console.log('✅ DM 送信成功！');
      console.log('   Slackを確認してください');
      console.log('');
      console.log('📝 次のステップ:');
      console.log('   1. Slackで届いたDMを確認');
      console.log('   2. 「🙏 感謝を送る」ボタンをクリック');
      console.log('   3. モーダルで絵文字を選択して送信');
      console.log('');
    } else {
      console.error('❌ 送信失敗:', result.error);
    }
  } catch (error) {
    console.error('❌ エラー:', error.message);

    if (error.data?.error === 'users_not_found') {
      console.log('\n💡 このメールアドレスはSlackワークスペースに登録されていません');
    } else if (error.data?.error === 'not_authed' || error.data?.error === 'invalid_auth') {
      console.log('\n💡 SLACK_BOT_TOKEN が無効です。確認してください');
    } else if (error.data?.error === 'missing_scope') {
      console.log('\n💡 Slack Appに必要な権限がありません');
      console.log('   OAuth & Permissions で以下を追加:');
      console.log('   - chat:write');
      console.log('   - users:read.email');
    }

    process.exit(1);
  }
}

// 引数チェック
const email = process.argv[2];
if (!email) {
  console.log('使い方: node scripts/test-slack-dm.js your-email@example.com');
  process.exit(1);
}

sendTestDM(email);
