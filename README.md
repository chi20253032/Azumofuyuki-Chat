# Azumofuyuki Chat

GitHub Pages + Supabase の実運用チャットアプリです。Node.jsサーバーは使いません。

## 実装機能
- Minecraftユーザー名申請、パスワード認証、6桁のゲーム内本人確認コード（30分有効）、管理者承認
- 固定管理者 AzumoAurora3032（DBの管理者ロールで認証）
- チャンネル、Realtimeメッセージ、DM、返信、編集・削除、リアクション、ピン留め
- メンバー停止・復帰、モデレーター、管理者専用チャンネル
- メンション/DM通知、検索、オンラインPresence
- 非公開Storage添付（15MB/ファイル）

## A. Supabase準備
1. https://supabase.com/dashboard でプロジェクトを作成。
2. SQL Editorで supabase/schema.sql 全体を実行。
3. Authentication → Providers → Email で Confirm email をOFFにする（このアプリはMinecraft内確認を使います）。
4. Authentication → URL Configuration の Site URL に https://chi20253032.github.io/Azumofuyuki-Chat/ を設定。
5. Project Settings → API から Project URL と Publishable key（または anon key）を取得。

## B. 管理者を安全に作成
1. Authentication → Users → Add user で作成。Email: azumoaurora3032@chat.azumofuyuki.invalid。パスワードは自分だけが知るものを設定。
2. User metadata に未使用の仮ユーザー名（例: {"username":"AzumoBoot7Q4K9"}）を設定。
3. SQL Editorで一度だけ実行:
   update public.profiles set username='AzumoAurora3032',username_key='azumoaurora3032',role='admin',status='approved',verification_code=null,verification_expires_at=null where username_key='azumoboot7q4k9';
4. そのアカウントでサイトにログイン。公開画面から管理者を自称することはできません。

## C. サイト接続
public/config.js の空欄に Project URL と Publishable key を記入してください。service_role / Secret key / DB password は絶対に記載しないでください。Publishable keyは公開前提で、アクセス制御はRLSが担当します。

## D. GitHub Pages公開
1. GitHubの Settings → Pages → Build and deployment → Source を GitHub Actions に変更。
2. mainブランチへのpushで .github/workflows/pages.yml が public/ を自動公開。
3. URL: https://chi20253032.github.io/Azumofuyuki-Chat/

## 本人確認
申請者がサイトで発行した6桁コードをMinecraftサーバー内で発言し、管理者が実際のプレイヤーと照合して承認します。Minecraftチャットの自動取得やMicrosoftアカウント所有権検証ではありません。

## セキュリティと制約
RLSとDB関数でアカウント/権限/承認を保護します。ブラウザにはPublishable/anon keyだけを配置します。service_role/Secret key/DB passwordを公開しないでください。
音声・ビデオ通話、E2E暗号化、Minecraftサーバーチャット自動連携、Microsoft OAuthは未実装です。DMの添付ファイルは未対応です。
