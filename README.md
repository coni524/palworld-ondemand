<div align="center">
  <a href="https://github.com/coni524/palworld-ondemand/stargazers"><img src="https://img.shields.io/github/stars/coni524/palworld-ondemand" alt="Stars Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/network/members"><img src="https://img.shields.io/github/forks/coni524/palworld-ondemand" alt="Forks Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/pulls"><img src="https://img.shields.io/github/issues-pr/coni524/palworld-ondemand" alt="Pull Requests Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/issues"><img src="https://img.shields.io/github/issues/coni524/palworld-ondemand" alt="Issues Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/graphs/contributors"><img alt="GitHub contributors" src="https://img.shields.io/github/contributors/coni524/palworld-ondemand?color=2b9348"></a>
<a href="https://github.com/coni524/palworld-ondemand/blob/master/LICENSE"><img src="https://img.shields.io/github/license/coni524/palworld-ondemand?color=2b9348" alt="License Badge"/></a>
</div>

# palworld-ondemand

On-demand Palworld Dedicated Server in AWS

[日本語版](./README-ja.md)

## Table of Contents

- [palworld-ondemand](#palworld-ondemand)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Diagram](#diagram)
  - [Cost Breakdown](#cost-breakdown)
  - [Quick Start](#quick-start)
    - [1. Route53](#1-route53)
    - [2. AWS Chatbot](#2-aws-chatbot)
    - [3. Configuration and Deployment](#3-configuration-and-deployment)
    - [4. Set Slack Alias](#4-set-slack-alias)
    - [5. Run palworld](#5-run-palworld)
  - [Background](#background)
  - [Workflow](#workflow)
- [Installation and Setup](#installation-and-setup)
  - [Checklist of things to keep track of](#checklist-of-things-to-keep-track-of)
  - [Region Selection](#region-selection)
  - [VPC](#vpc)
  - [Elastic File System](#elastic-file-system)
    - [Creating the EFS](#creating-the-efs)
    - [Allow access to EFS from within the VPC](#allow-access-to-efs-from-within-the-vpc)
  - [Lambda](#lambda)
  - [Route 53](#route-53)
    - [Server DNS Record](#server-dns-record)
    - [Query Logging](#query-logging)
  - [Optional SNS Notifications](#optional-sns-notifications)
  - [IAM](#iam)
    - [Policies](#policies)
      - [EFS Policy](#efs-policy)
      - [ECS Policy](#ecs-policy)
      - [Route 53 Policy](#route-53-policy)
      - [SNS policy (optional)](#sns-policy-optional)
    - [Roles](#roles)
      - [ECS Role](#ecs-role)
      - [Lambda Role](#lambda-role)
  - [Elastic Container Service](#elastic-container-service)
    - [Task Definition](#task-definition)
    - [Cluster](#cluster)
    - [Service](#service)
  - [CloudWatch](#cloudwatch)
- [Usage and Customization](#usage-and-customization)
  - [Option 1: Mount EFS Directly](#option-1-mount-efs-directly)
  - [Option 2: DataSync and S3](#option-2-datasync-and-s3)
    - [Step 1: Create an S3 bucket](#step-1-create-an-s3-bucket)
    - [Step 2: Create an EFS -\> S3 DataSync Task](#step-2-create-an-efs---s3-datasync-task)
    - [Step 3: Create an S3 -\> EFS DataSync Task](#step-3-create-an-s3---efs-datasync-task)
    - [Usage and file editing](#usage-and-file-editing)
- [Testing and Troubleshooting](#testing-and-troubleshooting)
  - [Areas of concern, what to watch](#areas-of-concern-what-to-watch)
    - [CloudWatch](#cloudwatch-1)
    - [Lambda](#lambda-1)
    - [Elastic Container Service](#elastic-container-service-1)
      - [Service won't launch task](#service-wont-launch-task)
      - [Containers won't switch to RUNNING state](#containers-wont-switch-to-running-state)
    - [Can't connect to palworld server](#cant-connect-to-palworld-server)
    - [Not getting text messages](#not-getting-text-messages)
  - [Server starts randomly?](#server-starts-randomly)
- [Other Stuff](#other-stuff)
  - [README Template](#readme-template)
  - [Concerned about cost overruns?](#concerned-about-cost-overruns)
  - [Suggestions, comments, concerns?](#suggestions-comments-concerns)


## Requirements

- AWS Account
- A domain name with a public DNS provided by Route 53; there is no need to register the domain through Route 53.
- The creation of a Route53 zone must be completed for the domain name you own. [DNS served from Route 53].
- Palworld client
- AWS Chatbot integrated with Slack. [Get started with Slack]

## Diagram

![Basic Workflow](docs/diagrams/aws_architecture.drawio.png)

## Cost Breakdown

If USE_FARGATE_SPOT is set to true, Fargate Spot will boot on the X86_64 architecture.

If USE_FARGATE_SPOT is false, Fargate will boot on the regular ARM64 architecture.

This can result in cost savings of up to 70% when using SPOT Fargate and up to 20% using ARM64 compared to X86_64 when using regular Fargate.

Note: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html


- Link to [AWS Estimate] assuming 20 hours a month usage.

- tl;dr:
   - $0.50 per month for DNS zones, $0.29072 per hour for Fargate usage with 4 vCPU and 16GB memory. All other costs negligible, a couple of pennies per month at most.

- tl;dr;tl;dt:
   - Approximately $5.81 / month for 20 hours of usage with 4 vCPU and 16GB memory configuration, plus $0.50 for DNS zones, totaling nearly $6.31 / month.

## Quick Start

### 1. Route53
The domain must have been acquired (not necessarily AWS) and the host zone must have been created with Route53.

![route53](docs/route53.png)

### 2. AWS Chatbot

![chatbot](docs/chatbot.png)

AWS Chatbot must be fully integrated with existing Slack.
[Get started with Slack]

### 3. Configuration and Deployment
Deployment can be done using AWS CloudShell only.

![cloudshell](docs/cloudshell.png)

Below is the operation with AWS CloudShell

Git Clone
```
git clone https://github.com/coni524/palworld-ondemand.git
```

Edit .env
```
cd palworld-ondemand/cdk/
cp -p .env.sample .env
vi .env
```

**Required field**

- **DOMAIN_NAME**: Domain name 
- **SLACK_WORKSPACE_ID** : AWS Chatbot Workspace ID 
- **SLACK_CHANNEL_ID**: Slack Channel ID, You can refer to it in the View Channel defails of the Slack channel
- **ADMIN_PASSWORD**: RCON Password, Used only inside the container for connection user checks.
- **SERVER_PASSWORD**: Palworld Password, Password required for client connection to Palworld
- **SERVER_REGION**: Region in which to start Palworld Dedicated Server (e.g.choose a region close to you)

**Example .env**
```
# Required
DOMAIN_NAME                   = example.net
SLACK_WORKSPACE_ID            = T07RLAJDF
SLACK_CHANNEL_ID              = C06J8SWSKDJ
ADMIN_PASSWORD                = worldofpalrcon
SERVER_PASSWORD               = worldofpal
SERVER_REGION                 = ap-northeast-1
```

Build & Deploy
```
npm run build && npm run deploy
```

### 4. Set Slack Alias

Invite @aws to join our Slack Channel.

```
/invite @aws
```

Create an alias command in Slack. For "--function-name", enter a Function name named "...LauncherLambda..." set to us-east-1. "--region" is fixed at us-east-1.

```
@aws alias create palworld lambda invoke --function-name palworld-domain-stack-LauncherLambda56F011B7-DDFHHDNH8f3 --region us-east-1 --payload {}
```

![slack alias](docs/slackalias.png)

### 5. Run palworld

Enter command in Slack

```
@aws run palworld
```

You will get a response from Slack, press "[Run] command".

![run palworld](docs/runpalworld.png)


After a few minutes, you will see a message in Slack that the startup is complete and you can connect.

```
e.g. 
palworld.example.net:8211
password: worldofpal
```

- The system automatically stops when there is no connection from a client for 10 minutes immediately after startup.
- After a client connection, the system automatically stops when it detects no connected users for 20 minutes.
- Every 6 hours you will receive a notification in Slack of your current month's AWS usage total.

## Background

By using multiple AWS services, PALWORLD's servers automatically start up when they are ready for use and automatically shut down when they are finished.

## Workflow

The process works as follows:

1. run the command to start Palworld from Slack
2. a **Lambda** function running via **AWS Chatbot** changes the existing **ECS Fargate** service to the desired task count of **1**.
3. **Fargate** starts two containers, **Palworld** and a watchdog, and updates the DNS records to the new IP.
4. watchdog sends a notification via **Slack** when the server is ready.
5. update the server list in **Palworld** and the server will be ready for connection
6. after 10 minutes without a connection or after 20 minutes since the last client disconnected (customizable), the watchdog will set the desired task count to **zero**, shut down, and send a shutdown notification via Slack.

# Installation and Setup

For a quick start, a Cloud Deployment Kit (CDK) implementation is available! Click on the `cdk` folder in the source for the instructions. The documentation will be refined soon to expand on this to help novice users. What follows is a manual walkthrough that anyone should be able to complete.

## Checklist of things to keep track of

To simplify the procedure, your ECS cluster name, service name, and sns topic name need to be defined before you start. This is because we will be referencing them before they are created. In the documentation I use these:

- Cluster name : `palworld`
- Service name : `palworld-server`
- SNS Topic : `palworld-server-stack....`

Things you need to go find because they'll be used in the procedure are:

- AWS Account ID. This is a 12 digit number (at least mine is). [Finding your AWS account ID]. Put this in the IAM policies where I've put `zzzzzzzzzzzz`
- Hosted Zone ID. This is a variable length string tied to your domain name in the Route 53 console.
- VPC IPv4 CIDR. It looks like (and very well may be) `172.31.0.0/16`. Find it by opening the VPC console, tapping on `Your VPCs` and looking in the `IPv4 CIDR` column.

Things you will locate as you go along and will need during IAM policy creation:

- EFS File System ID
- EFS Access Point ID

## Region Selection

While it doesn't matter which region you decide to run your server in, **Route 53 will only ship its logs to us-east-1**, which in turns means that the lambda function also has to be in us-east-1. This lambda function can fire off the server in another region without issue, as long as the destination region is specified within the lambda function code. For the purposes of this documentation, I'm using `us-west-2` to run my server.

Double check the region in anything you're copy/pasting.

## VPC

A VPC with Subnets must exist in order for Fargate tasks to launch and for EFS shares to be mounted. A subnet should exist in each availability zone so that Fargate (and Fargate Spot, if used) can properly launch the tasks in an AZ with plenty of capacity. A security group for our task is required but is easiest configured when setting up the Task Definition below.

A [Default VPC] should do the trick, chances are you've already got one. We'll be modifying the default security group within the EFS setup below.

## Elastic File System

EFS is where the world data and server properties are stored, and persists between runs of the palworld server. By using an "Access Point" the mounted folder is created automatically, so no mounting of the EFS to an external resource is required to get up and running. To make changes to the files like `server.properties` later however, a user can either mount the EFS file system to a Linux host in their account if they're comfortable with that, or I detail another method below using AWS DataSync and S3 that anyone can use without Linux experience.

### Creating the EFS

Open the Elastic File System console and create a new file system. Believe it or not, all the defaults are fine here! It will create an EFS available in each subnet within your VPC.

Select your newly created filesystem, and tap the `Access Points` tab. Create a new access point using the following specifics:

- Details
  - Root directory path : `/palworld`
- POSIX User
  - User ID : `1000`
  - Group ID : `1000`
- Root directory creation permissions (this is required, otherwise our container won't be able to create the folder to store its data the first time)
  - Owner user ID : `1000`
  - Owner group ID : `1000`
  - POSIX Permissions : `0755`

Click `Create access point`. Record the File System ID and the Access Point ID for our checklist. They are in the format `fs-xxxxxxxx` and `fsap-xxxxxxxxxxxxxxxxx` respectively.

### Allow access to EFS from within the VPC

Our EFS by default is assigned the default security group, which allows connections from all members of that default security group. Our ECS Service will not be using the default security group however, because we are opening Palworld to the public internet. So, we need to add EFS access to the default security group (more advanced users may want to create a new dedicated security group with this rule and assign it to the mount points within the EFS console, however that will not be described here).

Open the VPC console, find `Security Groups` on the left hand side. Select the default security group in the list, then click on `Edit inbound rules`. Add a new rule, select `NFS` in the `Type` list and put your VPC IPv4 CIDR from your checklist as the source. After clicking `Save rules` double check that it added successfully by viewing it in the `Security Groups` detail pane.

## Lambda

A lambda function must exist that turns on your palworld service. We do this with a simple python function that change the "Tasks Desired" count from zero to one when it is invoked. We haven't created the ECS service yet, but that's okay, because we decided on the cluster name and service name before we started.

Because we are relying on Route 53+CloudWatch to invoke the Lambda function, it _must_ reside in the N. Virginia (us-east-1) region.

From the Lambda console, create a new function using `Author from scratch`. I've used Python 3.9 but the latest version available should be fine. Call it `palworld-launcher`. The other defaults are fine, it will create an IAM role we will modify afterward. We do not need to specify a VPC.

Once the function has been created and you're in the code editor, replace the contents of the default lambda_function.py with this:

```python
import boto3

REGION = 'us-west-2'
CLUSTER = 'palworld'
SERVICE = 'palworld-server'


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
        return f"Updated desiredCount to 1 for {SERVICE}" # to Slack response.
    else:
        print("desiredCount already at 1")
        return f"desiredCount already at 1 for {SERVICE}" # to Slack response.
```

This file is also in this repository in the `lambda` folder. Change the region, cluster, or service on lines 3-5 if needed. Then, click the `Deploy` button. Switch back to your server region now so that we don't create anything in the wrong region later.

Lambda can be very inexpensive when used sparingly. For example, this lambda function runs in about 1600ms when starting the container, and in about 500ms if the container is already online. This means, running at a 128MB memory allocation, it will cost $0.00000336 the first time the server is launched from an off state, and about $0.00000105 every time someone connects to an online server, because anyone connecting will have to perform a DNS lookup which will trigger your lambda function. If you and four friends played once a day for a month, it would come out to $0.0002583, which is 2.6% of a single penny.

## Route 53

Ensure that a domain name you own is set up in Route 53. If you don't own one, consider registering one. You can use Route 53 for convenience or go to one of the big domain providers. Either way, ensure you've got your nameservers set to host out of Route 53 as it's required for the on-demand functionality.

### Server DNS Record

Add an A record with a 30 second TTL with a unique name that you will use to connect to your palworld server. Something like palworld.yourdomainname.com, or more complex if desired, as every time anyone _in the world_ performs a DNS lookup on this name, your Palworld server will launch. The value of the record is irrelevant because it will be updated every time our container launches. Use 1.1.1.1 or 192.168.1.1 for now if you can't think of anything. The low TTL is so that the DNS clients and non-authoritative DNS servers won't cache the record long and you can connect quicker after the IP updates.

### Query Logging

🚧 In this project, starting from Route53 is disabled. (Commented out)

The magic that allows the on-demand idea to work without any "always on" infrastructure comes in here, with Query logging. Every time someone looks up a DNS record for your domain, it will hit Route 53 as the authoritative DNS server. These queries can be logged and actions performed from them.

From your hosted zone, click `Configure query logging` on the top right. Then, click `Grant Permission` so that it will apply appropriate policies for queries to be logged. Finally, in `Log group` select `Create log group` and use the suggested name with your domain name in the string, `/aws/route53/yourdomainname.com` and click `Create`.

## Optional SNS Notifications

🚧 In this project, SNS Email notifications are changed to Slack notifications.

You can receive a text or email or anything else you want to consume via Amazon SNS, if Twilio isn't your thing. This also allows this to be a 100% AWS solution.

From the SNS console, create a `Standard` topic called `palworld-notifications`. Also at your convenience, create a Subscription to the topic to a destination of your choice. Email is easy and free, SMS is beyond the scope of this documentation but there's plenty of resources out there to help you set it up.

## IAM

The IAM Console is where we configure the roles and policies required to give access to the Task running the Palworld server and the Lambda Function used to start it.

We will be creating four distinct policies and one role. The policies will then be attached to the appropriate roles.

### Policies

#### EFS Policy

This policy will allow for read/write access to our new Elastic File System Access Point. In the policy below, replace the zzz's with your account id and put your file system and access point id in the appropriate places. Change the region if necessary.

Call this policy `efs.rw.palworld-data`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticfilesystem:ClientMount",
        "elasticfilesystem:ClientWrite",
        "elasticfilesystem:DescribeFileSystems"
      ],
      "Resource": "arn:aws:elasticfilesystem:us-west-2:zzzzzzzzzzzz:file-system/fs-xxxxxxxx",
      "Condition": {
        "StringEquals": {
          "elasticfilesystem:AccessPointArn": "arn:aws:elasticfilesystem:us-west-2:zzzzzzzzzzzz:access-point/fsap-xxxxxxxxxxxxxxxxx"
        }
      }
    }
  ]
}
```

#### ECS Policy

This policy will allow for management of the Elastic Container Service tasks and service. This lets the Lambda function start the service, as well as allows the service to turn itself off when not in use. The `ec2:DescribeNetworkInterfaces` section is so that the task can determine what IP address is assigned to it to properly update the DNS record.

Replace the `zzzzzzzzzzzz` below with the appriopriate account ID in your ARN. If you are not using the default cluster name or service name we decided above, change those as well. Change the region if necessary.

Call this policy `ecs.rw.palworld-service`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:*"],
      "Resource": [
        "arn:aws:ecs:us-west-2:zzzzzzzzzzzz:service/palworld/palworld-server",
        "arn:aws:ecs:us-west-2:zzzzzzzzzzzz:task/palworld/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ec2:DescribeNetworkInterfaces"],
      "Resource": ["*"]
    }
  ]
}
```

#### Route 53 Policy

This policy gives permission to our ECS task to update the DNS `A` record associated with our palworld server. Note: This will give your container access to change _all_ records within the hosted zone, and this may not be desirable if you're using this domain for anything else outside of this purpose. If you'd like to increase security, you can create a subdomain zone of the main domain to limit the impact. This is an advanced use case and the setup is described pretty well within the answers to [Delegate Zone Setup].

Place the hosted zone identifier from our checklist and place it in the Resource line within this policy where the XXX's are.

Call this policy `route53.rw.yourdomainname`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetHostedZone",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/XXXXXXXXXXXXXXXXXXXXX"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZones"],
      "Resource": "*"
    }
  ]
}
```

#### SNS policy (optional)

If you have decided to receive SNS notifications, we need a policy that allows publishing to the SNS topic you created.

Replace the zzz's with your account ID, and adjust the topic name or the region if you used something different.

Call this policy `sns.publish.palworld-notifications`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:us-west-2:zzzzzzzzzzzz:palworld-notifications"
    }
  ]
}
```

### Roles

Policies are assigned to roles, and roles are used by services to services to perform the required tasks. We are creating one new role and adjusting an existing role.

#### ECS Role

In the IAM console, select `Roles` and `Create role`. In the wizard, in the first "Choose your use case" dialog click `Elastic Container Service` and then for "Select your use case", click `Elastic Container Service Task` (last one in the list). Click `Next: Permissions`.

In the policy list, you can click `Filter policies` and select `Customer managed` to make this easier. Check the boxes for all of our created policies:

- `efs.rw.palworld-data`
- `ecs.rw.palworld-service`
- `route53.rw.yourdomainname`
- `sns.publish.palworld-notifications`

Click `Next: Tags` then `Next: Review`. Call the role `ecs.task.palworld-server` and click `Create role`.

#### Lambda Role

In the roles list, find the role created by the lambda function earlier. It will be called `palworld-launcher-role-xxxxxxxx`. Click on it, then click `Attach policies`. Give it the `ecs.rw.palworld-service` policy we created earlier.

## Elastic Container Service

The final task we need to do is create the ECS task, cluster, and service.

### Task Definition

Create a new Task Definition of `FARGATE` launch type. In the configuration wizard, use these options:

- Task Definition Name: `palworld-server`
- Task Role: `ecs.task.palworld-server`
- Network Mode: `awsvpc` (default)
- Task Execution Role: `Create new role` (default if you've never created tasks before) or `ecsTaskExecutionRole` (default otherwise). Not to be confused with the `ecs.task.palworld-server` role we used earlier.
- Task Memory: `4GB` (good to start, increase later if needed)
- Task CPU: `2 vCPU` (good to start, increase later if needed)

Skip `Container Definitions` temporarily and scroll further down to Volumes. Click `Add volume`, call it `data`, volume type EFS. Select the filesystem id from the dropdown that we created above, the access point id we created above, and check the box for `Encryption in transit` and click Add.

Scroll back up and click `Add container`. Use defaults except for these specifics:

- Container name: `palworld-server`
- Image: `thijsvanloef/palworld-server-docker`

- Port Mappings:
  - GamePort `8212 UDP`
  - QueryPOrt `27015 UDP`

- InternalPort:
  - RconPort: `25575 TCP`

Under `Advanced container configuration` make these changes:

- Environment
  - UNCHECK `Essential` (the watchdog container handles shutdowns)
  - Environment Variables. One gotcha, you have to select "Value" from the drop down list when defining these.
    - `EULA` : `TRUE`
    - Any additional stuff you want from [Minecraft Java Docker Server Docs] or [Minecraft Bedrock Docker Server Docs]
- Storage and Logging
  - Mount Points
    - Source volume : `palworld/Pal/Saved`
    - Container path: `/palworld/Pal/Saved`

Click `Add` and then click `Add container` again to add a second container to the list. Use defaults except for these specifics:

- Container name: `palworld-ecsfargate-watchdog`
- Image: `coni524/palworld-ecsfargate-watchdog` (source for this container within this project if you want to build/host it yourself)

Under `Advanced container configuration` make these changes:

- Essential: YES checked (default)
- Environmental Variables (required)
  - `CLUSTER` : `palworld`
  - `SERVICE` : `palworld-server`
  - `DNSZONE` : Route 53 hosted zone ID from your checklist
  - `SERVERNAME` : `palworld.yourdomainname.com`
- Environmental Variables (optional)
  - `STARTUPMIN` : Number of minutes to wait for a connection after starting before terminating (default 10)
  - `SHUTDOWNMIN` : Number of minutes to wait after the last client disconnects before terminating (default 20)
  - `SNSTOPIC` : Full ARN of your SNS topic (if using SNS)
  - `TWILIOFROM` : `+1XXXYYYZZZZ` (your twilio number)
  - `TWILIOTO` : `+1XXXYYYZZZZ` (your cell phone to get a text on)
  - `TWILIOAID` : Twilio account ID
  - `TWILIOAUTH` : Twilio auth code
  - `RCONPASSWORD` : RCON Password


If using Twilio to alert you when the server is ready and when it turns off, all four twilio variables must be specified. If publishing to an SNS topic, the `SNSTOPIC` variable must be specified.

Click `Add` and then `Create` to create the task.

### Cluster

Create a new "Networking Only" Cluster. Call it `palworld`. Don't create a dedicated VPC for this, use the default or same one you already created your EFS in. Enabling Container Insights is optional but recommended for troubleshooting later, especially if you expect a lot of people to potentially connect and you want to review CPU or Memory usage.

### Service

Within your `palworld` cluster, create a new Service.

- Configure serivce
  - Launch type: Click `Switch to capacity provider`
  - Capacity provider strategy: `Custom strategy`
  - Click `Add another provider`
  - Provider 1: You've got a choice, details in next paragraph
    - `FARGATE`: 4.9 cents per hour of use with this CPU/Memory configuration
    - `FARGATE_SPOT`: 1.49 cents per hour of use with this CPU/Memory configuration
  - Task Definition
    - Family: `palworld-server`
    - Revision: The latest version (Don't forget to update it here if you revise your task definition later)
  - Platform version: `LATEST`
  - Cluster: `palworld`
  - Service name: `palworld-server` (The service name from our checklist)
  - Number of tasks: `0` (The DNS+Lambda pipeline will change this to 1 on demand)

`FARGATE_SPOT` is significantly cheaper but AWS can terminate your instance at any time if they need the capacity. The watchdog is designed to intercept this termination command and shut down safely, so it's fine to use Spot to save a few pennies, at the extremely low risk of game interruption.

Click `Next step`

- Configure Network
  - Cluster VPC: The VPC that your EFS is in (you probably only have one anyway)
  - Subnets: Pick ALL of them, one at a time (must match the Subnets that EFS was created in, which by default is all of them)
  - Security Group: Click `Edit`
    - Create new security gruop
    - Security group name: Default is fine or call it `palworld-server`
    - Inbound rules for security group (GamePort)
      - Change `HTTP` to `Custom UDP`
      - Port range: `8211`
      - Source: `Anywhere` is fine. Customizing this to specific source IPs is beyond the scope of this document.
      - Click `Save`
    - Inbound rules for security group (QueryPort)
      - Change `HTTP` to `Custom UDP`
      - Port range: `27015`
      - Source: `Anywhere` is fine. Customizing this to specific source IPs is beyond the scope of this document.
      - Click `Save`
    - Auto-assign public IP: `ENABLED` (default)

Tap `Next`, `Next`, and `Create Service`.

## CloudWatch

The final step to link everything together is to configure CloudWatch to start your server when you try to connect to it.

Open the CloudWatch console and change to the `us-east-1` region. Go to `Logs` -> `Log groups` -> and find the `/aws/route53/yourdomainname.com` Log group that we created in the Route 53 Query Log Configuration. Optionally, modify the retention period to delete the logs after a few days so they don't accumulate forever.

Go to the `Subscription filters` tab, click `Create` and then `Create Lambda subscription filter`.

In the `Create Lambda subscription filter` page, use the following values:

- Lambda Function : `palworld-launcher`
- Log format : `Other`
- Subscription filter pattern: `"palworld.yourdomainname.com"` (or just simply `palworld` -- this is what it's looking for to fire off the lambda)
- Subscription filter name: `palworld`

Click `Start streaming`.

# Usage and Customization

Launch your server the first time by visiting your server name in a web browser, which won't load anything but it will trigger the actions. You can watch it start up by refreshing the ECS console page within your `palworld` cluster. Watch the `Desired tasks` change from 0 to 1, then on the `Tasks` tab select our task and refresh until both containers say `RUNNING`. You can also go to the `Logs` tab here and refresh the container logs to see the output of the initial world creation, etc.

To use your new server, open Palworld Multiplayer, add your new server, and join. It will fail at first if the server is not started, but then everything comes online and you can join your new world! You may notice that you don't have many permissions or ability to customize a lot of things yet, so let's dig into how to edit the relevant files!

## Option 1: Mount EFS Directly

This option is the easiest for folks that are comfortable in the Linux command line, so I'm not going to step-by-step it. But basically, launch an AWS Linux v2 AMI in EC2 with bare-minimum specs, log into it, mount the EFS Access Point, and use your favorite command line text editor to change around server.properties, the ops.json, whitelists, whatever, and then re-launch your server with the new configuration.

## Option 2: DataSync and S3

Since EFS doesn't have a convenient way to access the files outside of mounting a share to something within the VPC, we can utilize AWS DataSync to copy files in and out to a more convenient location. These instructions will use S3 as there are countless S3 clients out there you can manage files, including the AWS Console itself.

### Step 1: Create an S3 bucket

Open the S3 console and create a bucket. It must have a unique name (across ALL s3 buckets). `yourdomainname-files` works pretty well. Place it in the same region as your EFS share. I always like to enable Bucket Versioning, in case you need to reference old files or restore to a different version. Also enable Server Side Encryption (why isn't this on by default?).

### Step 2: Create an EFS -> S3 DataSync Task

Open the DataSync console and click `Create task`.

For `Source location options`, select `Create new location` with these options:

- Location type : `Amazon EFS file system`
- Region : The region your EFS is in
- EFS File System : The file system you created earlier (this is the file system itself not the access point)
- Mount path : `/palworld` or wherever your Access Point is pointed to

Click `Next`. For `Destination location options` select `Create new location` with these options:

- Location type : `Amazon S3`
- Region : The region your bucket was created in
- S3 bucket : The bucket you created earlier
- S3 storage class : `Standard` is fine, these are really small files.
- Folder : `/palworld`
- IAM Role : Click `Autogenerate` and it will fill this in for you.

Click `Next`. For `Task Name` consider something like `palworld-efs-to-s3`. For the rest of the options, use these:

- Task execution configuration : Use all defaults
- Data transfer configuration
  - Data to scan : Specific files and folders (Or pick the entire location if you don't want to specify each file below)
  - Transfer mode : Transfer only data that has changed
  - Keep deleted files / Overwrite files : Keep enabled as default
  - Includes for palworld world data: add three:
    - 🚧 Any Files. 
- Schedule : not scheduled, we'll run it on demand
- Task logging
  - Log level : Do not send logs to CloudWatch

Click `Next` and `Create task`.

### Step 3: Create an S3 -> EFS DataSync Task

Open the DataSync console and click `Create task`.

For `Source location options`, select `Choose an existing location` with these options:

- Region : The region your S3 bucket is in
- Existing locations : The S3 location you created in the previous step

Click `Next`. For `Destination location options` select `Choose an existing location` with these options:

- Region : The region your EFS is in
- Existing locations: The EFS location you created in the previous step

Click `Next`. For `Task Name` consider something like `palworld-s3-to-efs`. For the rest of the options, use these:

- Task execution configuration : Use all defaults
- Data transfer configuration
  - Data to scan : Entire source location
  - Transfer mode : Transfer only data that has changed
  - Keep deleted files / Overwrite files : Keep enabled as default
  - Excludes : None necessary this time around
  - Advanced : UNCHECK "Copy Ownership" and "Copy Permissions" -- otherwise it will change/lose them under certain circumstances and you won't be able to play after changes
- Schedule : not scheduled, we'll run it on demand
- Task logging
  - Log level : Do not send logs to CloudWatch

Click `Next` and `Create task`.

### Usage and file editing

🚧 This section has not yet been updated.

After you've launched the palworld server successfully once, it will create files in EFS such as `server.properties`, `ops.json`, `whitelist.json` among others. From the DataSync console, you can launch the `palworld-efs-to-s3` task, which will copy these files from the EFS share to your S3 bucket. Then you can download these files from S3 (using the console or something like [S3 Browser]), edit them on your computer, then use the same client to upload the files back to S3. Afterward, open DataSync and launch the `palworld-s3-to-efs` task to copy the updated files back to your EFS share. Then when you launch the server again, it will see and use the new files.

Best practice would be, any time you want to make a change to always copy the latest files from EFS to S3 first while your server is off before editing them and copying them back. Otherwise you may unintentionally regress some settings.

# Testing and Troubleshooting

The easiest way to trigger your process is to perform a dns lookup, which you can simply do by trying to visit your server name in a web browser. It will fail (duh) but it will also trigger your server to start up.

## Areas of concern, what to watch

### CloudWatch

Are your DNS queries getting logged properly? Check in the log groups, hit refresh. Often takes up to 30 seconds for them to show up.

### Lambda

Is your function running? We didn't design a "test" functionality for it but you could!

### Elastic Container Service

Can you start your server manually by setting desired count to 1? Here's some possible jumping off points for issues:

#### Service won't launch task

Check the execution roles, and that they have the right permissions. Check the container names for typos. Check that you selected multiple subnets in the task definition, and that it's using the LATEST version. If you updated the task definition, did you update the Service to use the new task definition version?

#### Containers won't switch to RUNNING state

Check all of the above, but also ensure you're using an EFS Access Point with the specified auto-create permissions. The palworld container will fail if it can't mount the data volume.

### Can't connect to palworld server

Refresh. Wait a minute, especially the first launch. Check ECS to see that the containers are in the RUNNING state. Open the running task, go to the logs tab, select palworld and see if there are any errors on the logs. Did you make sure you opened the right port (8211 UDP and 27015 UDP) to the world in the task security group?? Security groups can be edited from both the VPC and the EC2 console.

### Not getting text messages

Are your Twilio vars valid? Do you have sufficient funds on your Twilio account? Check the logs on the watchdog container for any curl errors.

## Server starts randomly?

🚧 In this project, invocation from DNS queries is disabled.

Remember, the server starts with a DNS query automatically. So, if you've got buddies you've shared the server with, it may start up if they open their multiplayer screen to play on a different server if yours is in the list! If this is an issue, it could probably be mitigated with a more advanced CloudWatch Subscription Filter that checks against the source IP address in addition to just the domain name, with it limiting to your ISP or location.

# Other Stuff

## README Template

[awesome-README-templates](https://github.com/elangosundar/awesome-README-templates?tab=readme-ov-file)

## Concerned about cost overruns?

Set up a [Billing Alert]! You can get an email if your bill exceeds a certain amount. Set it at $5 maybe?

## Suggestions, comments, concerns?

Open an issue, fork the repo, send me a pull request or a message.

[Get started with Slack]: https://docs.aws.amazon.com/chatbot/latest/adminguide/slack-setup.html
[finding your aws account id]: https://docs.aws.amazon.com/IAM/latest/UserGuide/console_account-alias.html#FindingYourAWSId
[default vpc]: https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html
[aws estimate]: https://calculator.aws/#/estimate?id=ebd1972b24b7d393610389a0017d3e1f8df2ed56
[dns served from route 53]: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring.html
[delegate zone setup]: https://stackoverflow.com/questions/47527575/aws-policy-allow-update-specific-record-in-route53-hosted-zone
[billing alert]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/monitor_estimated_charges_with_cloudwatch.html
[s3 browser]: https://s3browser.com
