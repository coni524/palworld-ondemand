"""Forwards SNS notifications (watchdog and billing report) to a Discord
channel webhook.

The webhook URL is read at runtime from SSM Parameter Store in the same
region so it never appears in a CloudFormation template. Create the
parameter once by hand:

    aws ssm put-parameter --region <server region> \
        --name /palworld/discord/webhook-url --type SecureString \
        --value https://discord.com/api/webhooks/...
"""

import json
import os
import urllib.request

import boto3

WEBHOOK_URL_PARAMETER = os.environ['WEBHOOK_URL_PARAMETER']

# Discord (Cloudflare) rejects urllib's default Python-urllib/3.x
# User-Agent with 403, so every request must carry a custom one.
USER_AGENT = 'palworld-ondemand (https://github.com/coni524/palworld-ondemand, 1.0)'

ssm = boto3.client('ssm')
_webhook_url = None


def get_webhook_url():
    global _webhook_url
    if _webhook_url is None:
        _webhook_url = ssm.get_parameter(
            Name=WEBHOOK_URL_PARAMETER, WithDecryption=True
        )['Parameter']['Value']
    return _webhook_url


def extract_text(message):
    """Watchdog images published before the Discord migration wrap the text
    in AWS Chatbot custom-notification JSON; unwrap it so the transition
    window does not post raw JSON to Discord."""
    try:
        return json.loads(message)['content']['description']
    except (ValueError, KeyError, TypeError):
        return message


def lambda_handler(event, context):
    for record in event.get('Records', []):
        request = urllib.request.Request(
            get_webhook_url(),
            data=json.dumps({'content': extract_text(record['Sns']['Message'])}).encode(),
            headers={'Content-Type': 'application/json', 'User-Agent': USER_AGENT},
            method='POST',
        )
        urllib.request.urlopen(request, timeout=10)
