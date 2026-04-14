#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Appreciate Web - Firebase Hosting デプロイ\n');

const projectRoot = path.join(__dirname, '..');

try {
  // Check if firebase-tools is installed
  console.log('📦 Firebase CLI を確認中...');
  try {
    execSync('firebase --version', { stdio: 'pipe' });
  } catch {
    console.log('⚠️  Firebase CLI がインストールされていません。インストールします...');
    execSync('npm install -g firebase-tools', { stdio: 'inherit' });
  }

  // Check if logged in
  console.log('🔐 Firebase ログイン状態を確認中...');
  try {
    execSync('firebase projects:list', { stdio: 'pipe', cwd: projectRoot });
  } catch {
    console.log('⚠️  Firebase にログインしていません。ログインしてください...');
    execSync('firebase login', { stdio: 'inherit', cwd: projectRoot });
  }

  // Deploy to Firebase Hosting
  console.log('\n📤 Firebase Hosting にデプロイ中...\n');
  execSync('firebase deploy --only hosting', { stdio: 'inherit', cwd: projectRoot });

  console.log('\n✅ デプロイ完了！');
  console.log('🌐 URL: https://appreciate-54692.web.app\n');

} catch (error) {
  console.error('\n❌ デプロイに失敗しました:', error.message);
  process.exit(1);
}
