#!/usr/bin/env bash
#
# Registers the Palworld slash commands in a single Discord guild (server):
# /start plus the full set backed by the official REST API (/info, /players,
# /settings, /metrics, /announce, /kick, /ban, /unban, /save, /shutdown, /stop).
#
# Guild-scoped registration is the first of the three authorization layers
# (guild-only registration, default_member_permissions, guild_id check in the
# Lambda). "default_member_permissions": "0" hides every command from everyone
# except server admins; grant additional roles, members, or channels under
# Server Settings > Integrations after registering.
#
# Option types (Discord application command option type):
#   3 = STRING, 4 = INTEGER.
# The `userid` for /kick, /ban and /unban is the Palworld user id, e.g.
# "steam_0123456789ABCDEF".
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
    },
    {
      "name": "info",
      "type": 1,
      "description": "Show server name, version and description",
      "default_member_permissions": "0"
    },
    {
      "name": "players",
      "type": 1,
      "description": "List the players currently online",
      "default_member_permissions": "0"
    },
    {
      "name": "settings",
      "type": 1,
      "description": "Show the server settings",
      "default_member_permissions": "0"
    },
    {
      "name": "metrics",
      "type": 1,
      "description": "Show server FPS, uptime and player count",
      "default_member_permissions": "0"
    },
    {
      "name": "announce",
      "type": 1,
      "description": "Broadcast a message to everyone in-game",
      "default_member_permissions": "0",
      "options": [
        {
          "name": "message",
          "description": "The text to announce",
          "type": 3,
          "required": true
        }
      ]
    },
    {
      "name": "kick",
      "type": 1,
      "description": "Kick a player by Palworld user id",
      "default_member_permissions": "0",
      "options": [
        {
          "name": "userid",
          "description": "Palworld user id, e.g. steam_0123456789ABCDEF",
          "type": 3,
          "required": true
        },
        {
          "name": "message",
          "description": "Reason shown to the player",
          "type": 3,
          "required": false
        }
      ]
    },
    {
      "name": "ban",
      "type": 1,
      "description": "Ban a player by Palworld user id",
      "default_member_permissions": "0",
      "options": [
        {
          "name": "userid",
          "description": "Palworld user id, e.g. steam_0123456789ABCDEF",
          "type": 3,
          "required": true
        },
        {
          "name": "message",
          "description": "Reason shown to the player",
          "type": 3,
          "required": false
        }
      ]
    },
    {
      "name": "unban",
      "type": 1,
      "description": "Remove a ban by Palworld user id",
      "default_member_permissions": "0",
      "options": [
        {
          "name": "userid",
          "description": "Palworld user id, e.g. steam_0123456789ABCDEF",
          "type": 3,
          "required": true
        }
      ]
    },
    {
      "name": "save",
      "type": 1,
      "description": "Save the world now",
      "default_member_permissions": "0"
    },
    {
      "name": "shutdown",
      "type": 1,
      "description": "Shut the server down after a grace period",
      "default_member_permissions": "0",
      "options": [
        {
          "name": "waittime",
          "description": "Seconds to wait before shutting down (default 30)",
          "type": 4,
          "required": false
        },
        {
          "name": "message",
          "description": "Message shown to players before shutdown",
          "type": 3,
          "required": false
        }
      ]
    },
    {
      "name": "stop",
      "type": 1,
      "description": "Force-stop the server immediately",
      "default_member_permissions": "0"
    }
  ]'
echo
