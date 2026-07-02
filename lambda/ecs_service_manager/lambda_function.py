import os
import boto3

DEFAULT_REGION = 'us-east-1'
DEFAULT_CLUSTER = 'palworld'
DEFAULT_SERVICE = 'palworld-server'

REGION = os.environ.get('REGION', DEFAULT_REGION)
CLUSTER = os.environ.get('CLUSTER', DEFAULT_CLUSTER)
SERVICE = os.environ.get('SERVICE', DEFAULT_SERVICE)

if REGION is None or CLUSTER is None or SERVICE is None:
    raise ValueError("Missing environment variables")


def lambda_handler(event, context):
    """Updates the desired count for a service."""

    ecs = boto3.client('ecs', region_name=REGION)
    response = ecs.describe_services(
        cluster=CLUSTER,
        services=[SERVICE],
    )

    desired = response["services"][0]["desiredCount"]

    if desired == 0:
        ecs.update_service(
            cluster=CLUSTER,
            service=SERVICE,
            desiredCount=1,
        )
        print("Updated desiredCount to 1")
        return f"Updated desiredCount to 1 for {SERVICE}"
    else:
        print("desiredCount already at 1")
        return f"desiredCount already at 1 for {SERVICE}"
