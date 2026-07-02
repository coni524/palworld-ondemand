#!/bin/bash

## Required Environment Variables

[ -n "$CLUSTER" ] || { echo "CLUSTER env variable must be set to the name of the ECS cluster" ; exit 1; }
[ -n "$SERVICE" ] || { echo "SERVICE env variable must be set to the name of the service in the $CLUSTER cluster" ; exit 1; }
[ -n "$SERVERNAME" ] || { echo "SERVERNAME env variable must be set to the full A record in Route53 we are updating" ; exit 1; }
[ -n "$DNSZONE" ] || { echo "DNSZONE env variable must be set to the Route53 Hosted Zone ID" ; exit 1; }
[ -n "$STARTUPMIN" ] || { echo "STARTUPMIN env variable not set, defaulting to a 10 minute startup wait" ; STARTUPMIN=10; }
[ -n "$SHUTDOWNMIN" ] || { echo "SHUTDOWNMIN env variable not set, defaulting to a 20 minute shutdown wait" ; SHUTDOWNMIN=20; }
[ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD="$RCONPASSWORD"  ## backward compatibility with the pre-REST-API variable name
[ -n "$ADMIN_PASSWORD" ] || { echo "The ADMIN_PASSWORD environment variable must be set to AdminPassword." ; exit 1; }
[ -n "$RESTAPIPORT" ] || RESTAPIPORT=8212

## Player count via the official REST API (RCON is deprecated by Palworld and
## breaks on multi-byte player names). Prints 0 if the API is unreachable.
function player_count ()
{
  local count
  count=$(curl --silent --fail --max-time 10 -u "admin:$ADMIN_PASSWORD" \
    "http://localhost:$RESTAPIPORT/v1/api/players" | jq -r '.players | length')
  [ -n "$count" ] || count=0
  echo "$count"
}

## Notifications are published to SNS as plain text; a Lambda subscribed to
## the topic forwards them to a Discord channel webhook.
function send_notification ()
{
  [ "$1" = "startup" ] && MESSAGETEXT="🟢 ${SERVICE} is online at ${SERVERNAME}"
  [ "$1" = "shutdown" ] && MESSAGETEXT="🔴 Shutting down ${SERVICE} at ${SERVERNAME}"

  [ -n "$SNSTOPIC" ] && \
  echo "SNS topic set, sending $1 message" && \
  aws sns publish --topic-arn "$SNSTOPIC" --message "$MESSAGETEXT"
}

function zero_service ()
{
  send_notification shutdown
  echo Setting desired task count to zero.
  aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 0
  exit 0
}

function sigterm ()
{
  ## upon SIGTERM set the service desired count to zero
  echo "Received SIGTERM, terminating task..."
  zero_service
}
trap sigterm SIGTERM

## get task id from the Fargate metadata
TASK=$(curl -s ${ECS_CONTAINER_METADATA_URI_V4}/task | jq -r '.TaskARN' | awk -F/ '{ print $NF }')
echo I believe our task id is $TASK

## get eni from from ECS
ENI=$(aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value | [0]" --output text)
echo I believe our eni is $ENI

## get public ip address from EC2
PUBLICIP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
echo "I believe our public IP address is $PUBLICIP"

## update public dns record
echo "Updating DNS record for $SERVERNAME to $PUBLICIP"
## prepare json file
cat << EOF > palworld-dns.json
{
  "Comment": "Fargate Public IP change for Palworld Server",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$SERVERNAME",
        "Type": "A",
        "TTL": 30,
        "ResourceRecords": [
          {
            "Value": "$PUBLICIP"
          }
        ]
      }
    }
  ]
}
EOF
aws route53 change-resource-record-sets --hosted-zone-id $DNSZONE --change-batch file://palworld-dns.json

# Wait for Palworld server to start
echo "Determining Palworld based on listening port..."
echo "If we are stuck here, the palworld container probably failed to start.  Waiting 10 minutes just in case..."
COUNTER=0
while true
do
  netstat -aun | grep :8211 && break
  netstat -aun | grep :27015 && break
  sleep 1
  COUNTER=$(($COUNTER + 1))
  if [ $COUNTER -gt 600 ] ## 10 minutes
  then
    echo "10 minutes elapsed without a palworld server listening, terminating."
    zero_service
  fi
done
echo "Detected Palworld"

## Check for the REST API
echo "Waiting for the Palworld REST API to begin responding..."
while true
do
  if curl --silent --fail --max-time 10 -u "admin:$ADMIN_PASSWORD" "http://localhost:$RESTAPIPORT/v1/api/info" > /dev/null
  then
    echo "REST API is responding, we are ready for clients."
    break
  fi
  sleep 1
done

## Send startup notification message
send_notification startup

# Begin monitoring for active connections
echo "Checking every 1 minute for active connections to Palworld, up to $STARTUPMIN minutes..."
COUNTER=0
CONNECTED=0
while [ $CONNECTED -lt 1 ]
do
  echo Waiting for connection, minute $COUNTER out of $STARTUPMIN...
  CONNECTIONS=$(player_count)
  CONNECTED=$(($CONNECTED + $CONNECTIONS))
  COUNTER=$(($COUNTER + 1))
  if [ $CONNECTED -gt 0 ] ## at least one active connection detected, break out of loop
  then
    break
  fi
  if [ $COUNTER -gt $STARTUPMIN ] ## no one has connected in at least these many minutes
  then
    echo $STARTUPMIN minutes exceeded without a connection, terminating.
    zero_service
  fi
  ## only doing short sleeps so that we can catch a SIGTERM if needed
  for i in $(seq 1 59) ; do sleep 1; done
done

echo "We believe a connection has been made, switching to shutdown watcher."
COUNTER=0
while [ $COUNTER -le $SHUTDOWNMIN ]
do
  CONNECTIONS=$(player_count)
  if [ $CONNECTIONS -lt 1 ]
  then
    echo "No active connections detected, $COUNTER out of $SHUTDOWNMIN minutes..."
    COUNTER=$(($COUNTER + 1))
  else
    echo "Active connections detected, resetting shutdown counter."
    COUNTER=0
  fi
  sleep 59
done

echo "$SHUTDOWNMIN minutes elapsed without a connection, terminating."
zero_service