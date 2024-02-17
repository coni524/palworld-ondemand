import json
import boto3
import datetime
import os

# Initialization of AWS Cost Explorer Client
cost_explorer = boto3.client('ce')
sns = boto3.client('sns')
# Get ARN of SNS topic from environment variable
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

def get_cost_and_usage():
    now = datetime.datetime.utcnow()
    start_of_month = datetime.datetime(now.year, now.month, 1)
    start = start_of_month.strftime('%Y-%m-%d')
    end = now.strftime('%Y-%m-%d')

    try:
        response = cost_explorer.get_cost_and_usage(
            TimePeriod={
                'Start': start,
                'End': end
            },
            Granularity='MONTHLY',
            Metrics=["UnblendedCost"]
        )
        
        results_by_time = response.get('ResultsByTime')
        if results_by_time:
            total_cost = results_by_time[0].get('Total', {}).get('UnblendedCost', {}).get('Amount', 0)
            return float(total_cost)
        else:
            return 0.0
    except Exception as e:
        print(f"Error fetching cost data: {str(e)}")
        return None

def publish_to_sns(cost):
    message = {
        "version": "1.0",
        "source": "custom",
        "content": {
            "description": f":moneybag: AWS cumulative cost for the month: ${cost:.2f} USD"
        }
    }
    
    try:
        response = sns.publish(
            TopicArn=sns_topic_arn,
            Message=json.dumps(message)
        )
        print(f"Message sent to SNS: {response}")
    except Exception as e:
        print(f"Error sending message to SNS: {str(e)}")

def lambda_handler(event, context):
    total_cost = get_cost_and_usage()
    if total_cost is not None:
        publish_to_sns(total_cost)
    else:
        print("Failed to get cost data.")