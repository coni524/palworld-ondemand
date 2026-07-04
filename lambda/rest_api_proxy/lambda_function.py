"""VPC-internal proxy for the Palworld server's official REST API.

The receiver Lambda (``palworld-discord-interactions``) lives outside the VPC
and can talk to discord.com, but it cannot reach the Fargate task's private
IP. This function is the opposite: it sits inside the VPC, has no Function URL
and no internet egress, and only ever calls the task's private ``IP:8212``.

It is invoked synchronously (``RequestResponse``) by the receiver Lambda with a
payload of::

    {"private_ip": "10.0.1.23", "method": "GET", "path": "/v1/api/players",
     "body": {...}}

and returns::

    {"status": 200, "body": <parsed JSON or raw text>}

The REST API uses HTTP Basic auth (user ``admin``, password ``ADMIN_PASSWORD``);
the password is held here so the receiver Lambda never sees it.
"""

import base64
import json
import os
import urllib.error
import urllib.request

ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
REST_API_PORT = os.environ.get('REST_API_PORT', '8212')

_auth = base64.b64encode(f'admin:{ADMIN_PASSWORD}'.encode()).decode()
BASIC_AUTH_HEADER = f'Basic {_auth}'


def lambda_handler(event, context):
    private_ip = event['private_ip']
    method = event.get('method', 'GET').upper()
    path = event['path']
    body = event.get('body')

    url = f'http://{private_ip}:{REST_API_PORT}{path}'
    headers = {'Authorization': BASIC_AUTH_HEADER}

    data = None
    if method != 'GET':
        # POST endpoints expect a JSON body (an empty object for save/stop).
        data = json.dumps(body or {}).encode()
        headers['Content-Type'] = 'application/json'

    request = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return _result(response.status, response.read())
    except urllib.error.HTTPError as error:
        # The API answered with a non-2xx status (e.g. 400 for a bad steamid).
        return _result(error.code, error.read())
    except urllib.error.URLError as error:
        # Could not connect: the task may be mid-boot or already gone.
        return {'status': 0, 'error': str(error.reason)}


def _result(status, raw):
    """Return the status and the body parsed as JSON when possible."""
    text = raw.decode('utf-8', 'replace') if raw else ''
    try:
        return {'status': status, 'body': json.loads(text)}
    except (ValueError, TypeError):
        return {'status': status, 'body': text}
