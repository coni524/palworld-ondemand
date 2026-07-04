"""Discord Interactions endpoint for the on-demand Palworld server.

The function is invoked two ways:

1. By Discord through the Lambda Function URL when a slash command runs.
   The handler verifies the Ed25519 signature, answers PING, and for a known
   command returns a deferred response within Discord's 3-second limit while
   handing the actual work to an asynchronous self-invocation.
2. By itself (asynchronously) to do the slow work — scale the ECS service
   (`/start`) or relay a REST API call through the proxy Lambda — and post the
   follow-up message through the interaction token.

This Lambda lives outside the VPC and cannot reach the task's private IP, so
every REST API call is delegated to the VPC-internal proxy Lambda: this handler
reads the task's private IP (published to SSM by the watchdog) and passes it,
plus the method/path/body, to the proxy, which returns the response. The admin
password stays in the proxy; it is never seen here.
"""

import base64
import json
import os
import urllib.request

import boto3
from discord_interactions import (
    InteractionResponseFlags,
    InteractionResponseType,
    InteractionType,
    verify_key,
)

CLUSTER = os.environ['CLUSTER']
SERVICE = os.environ['SERVICE']
DISCORD_PUBLIC_KEY = os.environ['DISCORD_PUBLIC_KEY']
DISCORD_GUILD_ID = os.environ['DISCORD_GUILD_ID']
PROXY_LAMBDA_ARN = os.environ['PROXY_LAMBDA_ARN']
PRIVATE_IP_SSM_PARAM = os.environ['PRIVATE_IP_SSM_PARAM']

# Discord (Cloudflare) rejects urllib's default Python-urllib/3.x
# User-Agent with 403, so every request must carry a custom one.
USER_AGENT = 'palworld-ondemand (https://github.com/coni524/palworld-ondemand, 1.0)'

# Discord truncates messages above 2000 characters; leave headroom.
MAX_CONTENT = 1900

# Commands that only read state; the rest mutate the server.
GET_COMMANDS = {'info', 'players', 'settings', 'metrics'}
# Every command this Lambda answers. `start` is special (scales ECS); the
# others are relayed to the REST API.
REST_COMMANDS = GET_COMMANDS | {
    'announce', 'kick', 'ban', 'unban', 'save', 'shutdown', 'stop'
}
KNOWN_COMMANDS = {'start'} | REST_COMMANDS

# Created at module scope: the init phase runs with a full CPU burst, so
# this keeps the synchronous handler inside Discord's 3-second limit even
# on a cold start.
lambda_client = boto3.client('lambda')
ecs = boto3.client('ecs')
ssm = boto3.client('ssm')


def lambda_handler(event, context):
    if 'requestContext' in event:
        return handle_interaction(event, context)
    if event.get('action') == 'run-command':
        run_command(event)
        return None
    raise ValueError(f'Unsupported event: {json.dumps(event)[:200]}')


def handle_interaction(event, context):
    """Handles an HTTP request from Discord via the Function URL."""
    body = event.get('body') or ''
    raw_body = base64.b64decode(body) if event.get('isBase64Encoded') else body.encode()
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    signature = headers.get('x-signature-ed25519', '')
    timestamp = headers.get('x-signature-timestamp', '')
    if not signature or not timestamp or not verify_key(
        raw_body, signature, timestamp, DISCORD_PUBLIC_KEY
    ):
        return {'statusCode': 401, 'body': 'invalid request signature'}

    interaction = json.loads(raw_body)

    if interaction['type'] == InteractionType.PING:
        return interaction_response({'type': InteractionResponseType.PONG})

    if interaction['type'] != InteractionType.APPLICATION_COMMAND:
        return {'statusCode': 400, 'body': 'unsupported interaction type'}

    # Last of the three authorization layers: the command is registered in a
    # single guild and gated by default_member_permissions, but the payload's
    # guild_id is still checked against the deployed configuration.
    if interaction.get('guild_id') != DISCORD_GUILD_ID:
        return message_response(
            'This command can only be used in the configured Discord server.',
            ephemeral=True,
        )

    command = interaction['data']['name']
    if command not in KNOWN_COMMANDS:
        return message_response(f'Unknown command: /{command}', ephemeral=True)

    # Flatten the command options ({name, type, value}) into a plain dict.
    options = {
        opt['name']: opt.get('value')
        for opt in interaction['data'].get('options', [])
    }

    # The slow work (ECS calls / REST relay + follow-up) happens in an async
    # self-invocation so the deferred response goes out immediately. `/start`
    # is announced publicly; the admin REST commands answer ephemerally.
    ephemeral = command != 'start'
    lambda_client.invoke(
        FunctionName=context.invoked_function_arn,
        InvocationType='Event',
        Payload=json.dumps({
            'action': 'run-command',
            'command': command,
            'options': options,
            'ephemeral': ephemeral,
            'application_id': interaction['application_id'],
            'interaction_token': interaction['token'],
        }).encode(),
    )
    return deferred_response(ephemeral)


def run_command(event):
    """Does the slow work and reports back via the interaction token."""
    command = event['command']
    options = event.get('options') or {}

    if command == 'start':
        content = start_server()
    else:
        content = run_rest_command(command, options)

    post_followup(event, content, ephemeral=event.get('ephemeral', False))


def start_server():
    """Scales the service to 1 and returns a status message."""
    if current_desired_count() == 0:
        ecs.update_service(cluster=CLUSTER, service=SERVICE, desiredCount=1)
        return (
            f'🚀 Starting `{SERVICE}`. '
            'A notification arrives here when the server is ready.'
        )
    return f'ℹ️ `{SERVICE}` is already starting or running.'


def run_rest_command(command, options):
    """Relays a REST API call through the proxy Lambda and formats the reply."""
    if current_desired_count() == 0:
        return f'⚠️ `{SERVICE}` is not running. Start it with `/start` first.'

    private_ip = get_private_ip()
    if not private_ip:
        return '⚠️ The server is still starting; the REST API is not reachable yet. Try again shortly.'

    method, path, req_body = build_request(command, options)
    result = call_proxy(private_ip, method, path, req_body)

    status = result.get('status', 0)
    if status == 0:  # could not connect at all
        return f'⚠️ Could not reach the server: {result.get("error", "unknown error")}'
    if not 200 <= status < 300:
        detail = result.get('body')
        return f'⚠️ REST API returned HTTP {status}.' + (
            f' {truncate(str(detail), 200)}' if detail else ''
        )
    return format_response(command, options, result.get('body'))


def build_request(command, options):
    """Maps a command + options to (method, path, body) for the REST API."""
    if command in GET_COMMANDS:
        return 'GET', f'/v1/api/{command}', None
    if command == 'save':
        return 'POST', '/v1/api/save', {}
    if command == 'stop':
        return 'POST', '/v1/api/stop', {}
    if command == 'announce':
        return 'POST', '/v1/api/announce', {'message': options.get('message', '')}
    if command == 'shutdown':
        return 'POST', '/v1/api/shutdown', {
            'waittime': int(options.get('waittime', 30)),
            'message': options.get('message', 'The server is shutting down.'),
        }
    if command == 'kick':
        return 'POST', '/v1/api/kick', {
            'userid': options.get('userid', ''),
            'message': options.get('message', 'You have been kicked.'),
        }
    if command == 'ban':
        return 'POST', '/v1/api/ban', {
            'userid': options.get('userid', ''),
            'message': options.get('message', 'You have been banned.'),
        }
    if command == 'unban':
        return 'POST', '/v1/api/unban', {'userid': options.get('userid', '')}
    raise ValueError(f'Unmapped command: {command}')


def format_response(command, options, body):
    """Turns a successful REST response into a human-readable message."""
    if command == 'info':
        body = body or {}
        return (
            f"🖥️ **{body.get('servername', '?')}**\n"
            f"version: `{body.get('version', '?')}`\n"
            f"{body.get('description', '')}"
        ).strip()

    if command == 'players':
        players = (body or {}).get('players', [])
        if not players:
            return 'No players are currently online.'
        lines = [
            f"• {p.get('name', '?')} "
            f"(Lv {p.get('level', '?')}, ping {round(p.get('ping', 0))}ms)"
            for p in players
        ]
        return truncate(f'👥 **{len(players)} online**\n' + '\n'.join(lines))

    if command == 'metrics':
        body = body or {}
        return (
            f"📊 FPS: `{body.get('serverfps', '?')}` | "
            f"players: `{body.get('currentplayernum', '?')}` | "
            f"uptime: `{body.get('serveruptime', '?')}s` | "
            f"in-game days: `{body.get('days', '?')}`"
        )

    if command == 'settings':
        pretty = json.dumps(body, indent=2, ensure_ascii=False)
        return truncate('⚙️ Server settings:\n```json\n' + pretty + '\n```')

    userid = options.get('userid', '')
    return {
        'announce': '📢 Announcement sent.',
        'save': '💾 World saved.',
        'shutdown': '🛑 Shutdown scheduled.',
        'stop': '🛑 Server is stopping.',
        'kick': f'👢 Kicked `{userid}`.',
        'ban': f'🔨 Banned `{userid}`.',
        'unban': f'♻️ Unbanned `{userid}`.',
    }.get(command, '✅ Done.')


def current_desired_count():
    # The Lambda runs in the same region as the ECS service.
    response = ecs.describe_services(cluster=CLUSTER, services=[SERVICE])
    return response['services'][0]['desiredCount']


def get_private_ip():
    """Reads the running task's private IP (published by the watchdog)."""
    try:
        response = ssm.get_parameter(Name=PRIVATE_IP_SSM_PARAM)
        return response['Parameter']['Value']
    except ssm.exceptions.ParameterNotFound:
        return None


def call_proxy(private_ip, method, path, body):
    """Invokes the VPC-internal proxy Lambda and returns its parsed result."""
    response = lambda_client.invoke(
        FunctionName=PROXY_LAMBDA_ARN,
        InvocationType='RequestResponse',
        Payload=json.dumps({
            'private_ip': private_ip,
            'method': method,
            'path': path,
            'body': body,
        }).encode(),
    )
    payload = json.loads(response['Payload'].read() or 'null')
    if response.get('FunctionError'):
        return {'status': 0, 'error': 'proxy Lambda failed'}
    return payload or {'status': 0, 'error': 'empty proxy response'}


def post_followup(event, content, ephemeral):
    followup_url = (
        'https://discord.com/api/v10/webhooks/'
        f"{event['application_id']}/{event['interaction_token']}"
    )
    data = {'content': truncate(content)}
    if ephemeral:
        data['flags'] = InteractionResponseFlags.EPHEMERAL
    request = urllib.request.Request(
        followup_url,
        data=json.dumps(data).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': USER_AGENT},
        method='POST',
    )
    urllib.request.urlopen(request, timeout=10)


def truncate(text, limit=MAX_CONTENT):
    return text if len(text) <= limit else text[: limit - 1] + '…'


def interaction_response(payload):
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(payload),
    }


def deferred_response(ephemeral):
    payload = {'type': InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}
    if ephemeral:
        payload['data'] = {'flags': InteractionResponseFlags.EPHEMERAL}
    return interaction_response(payload)


def message_response(content, ephemeral=False):
    data = {'content': content}
    if ephemeral:
        data['flags'] = InteractionResponseFlags.EPHEMERAL
    return interaction_response(
        {'type': InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, 'data': data}
    )
