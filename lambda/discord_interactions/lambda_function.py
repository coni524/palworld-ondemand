"""Discord Interactions endpoint that starts the on-demand Palworld server.

The function is invoked two ways:

1. By Discord through the Lambda Function URL when a slash command runs.
   The handler verifies the Ed25519 signature, answers PING, and for /start
   returns a deferred response within Discord's 3-second limit while handing
   the actual work to an asynchronous self-invocation.
2. By itself (asynchronously) to scale the ECS service up and post the
   follow-up message through the interaction token.
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

# Discord (Cloudflare) rejects urllib's default Python-urllib/3.x
# User-Agent with 403, so every request must carry a custom one.
USER_AGENT = 'palworld-ondemand (https://github.com/coni524/palworld-ondemand, 1.0)'

# Created at module scope: the init phase runs with a full CPU burst, so
# this keeps the synchronous handler inside Discord's 3-second limit even
# on a cold start.
lambda_client = boto3.client('lambda')
ecs = boto3.client('ecs')


def lambda_handler(event, context):
    if 'requestContext' in event:
        return handle_interaction(event, context)
    if event.get('action') == 'start-server':
        start_server(event)
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
    if command != 'start':
        return message_response(f'Unknown command: /{command}', ephemeral=True)

    # The ECS calls and the follow-up message happen in an async
    # self-invocation so the deferred response goes out immediately.
    lambda_client.invoke(
        FunctionName=context.invoked_function_arn,
        InvocationType='Event',
        Payload=json.dumps({
            'action': 'start-server',
            'application_id': interaction['application_id'],
            'interaction_token': interaction['token'],
        }).encode(),
    )
    return interaction_response(
        {'type': InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE}
    )


def start_server(event):
    """Scales the service to 1 and reports back via the interaction token."""
    # The Lambda runs in the same region as the ECS service.
    response = ecs.describe_services(cluster=CLUSTER, services=[SERVICE])
    desired = response['services'][0]['desiredCount']

    if desired == 0:
        ecs.update_service(cluster=CLUSTER, service=SERVICE, desiredCount=1)
        content = (
            f'🚀 Starting `{SERVICE}`. '
            'A notification arrives here when the server is ready.'
        )
    else:
        content = f'ℹ️ `{SERVICE}` is already starting or running.'

    followup_url = (
        'https://discord.com/api/v10/webhooks/'
        f"{event['application_id']}/{event['interaction_token']}"
    )
    request = urllib.request.Request(
        followup_url,
        data=json.dumps({'content': content}).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': USER_AGENT},
        method='POST',
    )
    urllib.request.urlopen(request, timeout=10)


def interaction_response(payload):
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(payload),
    }


def message_response(content, ephemeral=False):
    data = {'content': content}
    if ephemeral:
        data['flags'] = InteractionResponseFlags.EPHEMERAL
    return interaction_response(
        {'type': InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, 'data': data}
    )
