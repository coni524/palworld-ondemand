"""Forwards SNS notifications (watchdog and billing report) to a Discord
channel webhook.

The webhook URL is read at runtime from SSM Parameter Store so it never
appears in a CloudFormation template. Create the parameter once by hand:

    aws ssm put-parameter --region us-east-1 \
        --name /palworld/discord/webhook-url --type SecureString \
        --value https://discord.com/api/webhooks/...
"""

import json
import os
import urllib.request

import boto3

WEBHOOK_URL_PARAMETER = os.environ['WEBHOOK_URL_PARAMETER']
SSM_REGION = os.environ['SSM_REGION']

ssm = boto3.client('ssm', region_name=SSM_REGION)
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
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        urllib.request.urlopen(request, timeout=10)
