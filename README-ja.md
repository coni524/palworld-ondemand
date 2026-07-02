<div align="center">
  <a href="https://github.com/coni524/palworld-ondemand/stargazers"><img src="https://img.shields.io/github/stars/coni524/palworld-ondemand" alt="Stars Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/network/members"><img src="https://img.shields.io/github/forks/coni524/palworld-ondemand" alt="Forks Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/pulls"><img src="https://img.shields.io/github/issues-pr/coni524/palworld-ondemand" alt="Pull Requests Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/issues"><img src="https://img.shields.io/github/issues/coni524/palworld-ondemand" alt="Issues Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/graphs/contributors"><img alt="GitHub contributors" src="https://img.shields.io/github/contributors/coni524/palworld-ondemand?color=2b9348"></a>
<a href="https://github.com/coni524/palworld-ondemand/blob/master/LICENSE"><img src="https://img.shields.io/github/license/coni524/palworld-ondemand?color=2b9348" alt="License Badge"/></a>
</div>

# palworld-ondemand

オンデマンドの Palworld Dedicated Server （詳細省略版）

## 目次

- [palworld-ondemand](#palworld-ondemand)
  - [目次](#目次)
  - [要件](#要件)
  - [構成図](#構成図)
  - [コスト内訳](#コスト内訳)
  - [クイックスタート](#クイックスタート)
    - [1. Discord アプリケーションの作成](#1-discord-アプリケーションの作成)
    - [2. コンフィグの設定とデプロイ](#2-コンフィグの設定とデプロイ)
    - [3. Discord との接続](#3-discord-との接続)
    - [4. Palworld Dedicated Server を起動する](#4-palworld-dedicated-server-を起動する)
- [その他](#その他)
  - [README テンプレート](#readme-テンプレート)
  - [費用が心配な方へ](#費用が心配な方へ)
  - [不具合など](#不具合など)


## 要件

- AWSアカウント
- パルワールドのクライアント
- Discord のサーバー（ギルド）。アプリケーションの追加とスラッシュコマンドの登録に管理権限が必要です。

独自ドメインは不要です。
サーバーに固定の名前は付けず、起動のたびに変わるパブリック IP アドレス（インターネット側から接続するためのアドレス）を「IP:ポート番号」の形式で Discord の起動通知に載せます。
接続時は通知のアドレスをパルワールドのサーバーリストに入力します。

## 構成図

![基本的なワークフロー](docs/diagrams/aws_architecture.drawio.png)

（構成図は Slack + AWS Chatbot 構成当時のものです。起動導線は Discord へ移行済みで、図は追って更新します。）

## コスト内訳
サーバーは常に x86_64 アーキテクチャの Fargate Spot（AWS の空きキャパシティを通常より安価に利用できる購入オプション）で起動します。
Palworld のサーバーバイナリが x86_64 専用であるため、ARM64 は使用しません。

Spot の料金は通常の Fargate より最大 70% 安くなります。
AWS の都合で実行中に中断される可能性はありますが、watchdog が中断通知（SIGTERM）を受け取ってサーバーを安全に停止します。

ノート：https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/fargate-capacity-providers.html

- 月20時間の利用を想定した価格想定 [AWS Estimate]
- Fargate の使用料は 1 時間あたり $0.29072（4vCPU、16GB メモリ）。その他のコストは少なく済みます。
- 4vCPU、16GBメモリ構成で20時間使用した場合、月額約 5.81 ドル程度

## クイックスタート
手動での準備は Discord アプリケーションの作成だけです。
以降は AWS CloudShell 上で cdk よりデプロイします。

ローカル環境に追加のソフトウェアや、開発ツールのインストールは不要です。

### 1. Discord アプリケーションの作成

起動コマンドと通知の受け口として、Discord アプリケーションを作成します。

1. [Discord Developer Portal] の「New Application」からアプリケーションを作成します。
2. 「General Information」画面の **Application ID** と **Public Key**（署名検証用の公開鍵）を控えます。
3. 「Bot」画面でボットを追加し、**Bot Token**（ボットの認証トークン）を控えます。トークンは後述のコマンド登録スクリプトでのみ使用し、AWS には保存しません。
4. 「Installation」画面のインストールリンクを使い、アプリケーションを自分の Discord サーバー（ギルド）へ追加します。スコープに `applications.commands` が必要です。
5. Discord クライアントの「設定 → 詳細設定 → 開発者モード」を有効にし、サーバー名を右クリックして **サーバー ID**（ギルド ID）をコピーします。
6. 通知を受け取るチャンネルの「連携サービス → ウェブフック」で Webhook（チャンネルへの投稿用 URL）を作成し、**Webhook URL** を控えます。

### 2. コンフィグの設定とデプロイ
AWS CloudShell のみでデプロイが可能です。

![cloudshell](docs/cloudshell.png)

以下はAWS CloudShellを使った操作です。

Gitクローン
```
git clone https://github.com/coni524/palworld-ondemand.git
```

.env を編集する
```
cd palworld-ondemand/cdk/
cp -p .env.sample .env
vi .env
```

**必須フィールド**

- **DISCORD_PUBLIC_KEY** ： Discord アプリケーションの Public Key。「General Information」画面で確認できます。
- **DISCORD_GUILD_ID** ： スラッシュコマンドの実行を許可する Discord サーバーの ID。
- **ADMIN_PASSWORD** ： Palworld の AdminPassword。watchdog が REST API（HTTP ベースの管理用 API）で接続ユーザーを確認するために、コンテナ内でのみ使用されます。
- **SERVER_PASSWORD** ： Palworld へのクライアント接続に必要なパスワード。
- **SERVER_REGION** ： Palworld 専用サーバーを起動するリージョン (例: 最寄りのリージョンを選択)

**.env** の例
```
# Required
DISCORD_PUBLIC_KEY            = 3717e9b6247e0a5e9db9e0e70d842c3a...
DISCORD_GUILD_ID              = 1234567890123456789
ADMIN_PASSWORD                = worldofpaladmin
SERVER_PASSWORD               = worldofpal
SERVER_REGION                 = ap-northeast-1
```

控えておいた Webhook URL を、SERVER_REGION と同じリージョンの SSM Parameter Store（AWS の設定値保管サービス）へ登録します。
CloudFormation（AWS のリソースをテンプレートから作成するサービス）は SecureString（暗号化された文字列パラメータ）を作成できないため、この 1 件だけ手動で登録します。

```
aws ssm put-parameter --region ap-northeast-1 \
  --name /palworld/discord/webhook-url --type SecureString \
  --value 'https://discord.com/api/webhooks/...'
```

pnpm のインストール（インストール済みならスキップ）
```
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc
```

ビルドとデプロイ
```
pnpm install
pnpm run build && pnpm run deploy
```

デプロイ完了時に `palworld-server-stack` が出力する **DiscordInteractionsEndpointUrl** の値（Lambda Function URL、Lambda に直接付与できる HTTPS エンドポイント）を控えます。

### 3. Discord との接続

デプロイした受け口を Discord アプリケーションに設定し、スラッシュコマンドを登録します。

1. [Discord Developer Portal] の「General Information」画面で、**Interactions Endpoint URL** に控えた URL を設定して保存します。保存時に Discord が検証リクエストを送るため、デプロイ完了後に設定してください。
2. スラッシュコマンドを登録します。手元の端末か CloudShell で次を実行します。

```
DISCORD_APP_ID=<Application ID> \
DISCORD_BOT_TOKEN=<Bot Token> \
DISCORD_GUILD_ID=<サーバー ID> \
./scripts/register_discord_commands.sh
```

コマンドは登録したサーバー専用で、既定ではサーバー管理者だけが実行できます。
実行を許可するロールやメンバーを増やす場合は、Discord の「サーバー設定 → 連携サービス」で該当コマンドに追加します。

### 4. Palworld Dedicated Server を起動する

Discord のチャンネルで `/start` を実行します。

数分後、Webhook を設定したチャンネルに起動完了のメッセージが届き、接続できるようになります。
メッセージに載っているアドレス（IP:ポート番号）をパルワールドのサーバーリストに入力して接続します。
IP アドレスは起動のたびに変わるため、毎回最新の通知のアドレスを入力してください。

```
# 起動通知と接続パスワードの例
🟢 palworld-server is online at 203.0.113.10:8211
password: worldofpal
```

- 起動直後から10分間クライアントからの接続がない場合、システムは自動的に停止します。
- クライアントからの接続後、20分間接続ユーザがいないことを検知すると自動的に停止します。
- 6時間ごとに当月のAWS使用額の合計が Discord に通知されます。

# その他

## README テンプレート

[awesome-README-templates](https://github.com/elangosundar/awesome-README-templates?tab=readme-ov-file)

## 費用が心配な方へ

AWS の料金通知を利用することをおすすめします!! [Billing Alert]

## 不具合など

不具合やコメント/プルリクなどありましたらぜひお寄せください。

[Discord Developer Portal]: https://discord.com/developers/applications
[aws estimate]: https://calculator.aws/#/estimate?id=ebd1972b24b7d393610389a0017d3e1f8df2ed56
[billing alert]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/monitor_estimated_charges_with_cloudwatch.html