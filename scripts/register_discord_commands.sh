#!/usr/bin/env bash
#
# Registers the /start slash command in a single Discord guild (server).
#
# Guild-scoped registration is the first of the three authorization layers
# (guild-only registration, default_member_permissions, guild_id check in the
# Lambda). "default_member_permissions": "0" hides the command from everyone
# except server admins; grant additional roles, members, or channels under
# Server Settings > Integrations after registering.
#
# Usage:
#   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... \
#     ./scripts/register_discord_commands.sh
#
# The bot token is used only for this registration call; it is not stored in
# AWS anywhere.
set -euo pipefail

: "${DISCORD_APP_ID:?Set DISCORD_APP_ID to the Discord application ID}"
: "${DISCORD_BOT_TOKEN:?Set DISCORD_BOT_TOKEN to the bot token}"
: "${DISCORD_GUILD_ID:?Set DISCORD_GUILD_ID to the guild (server) ID}"

curl --silent --fail --show-error \
  -X PUT "https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${DISCORD_GUILD_ID}/commands" \
  -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '[
    {
      "name": "start",
      "type": 1,
      "description": "Start the on-demand Palworld server",
      "default_member_permissions": "0"
    }
  ]'
echo
