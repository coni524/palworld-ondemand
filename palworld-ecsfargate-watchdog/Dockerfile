# version 3.0.0

FROM public.ecr.aws/amazonlinux/amazonlinux:2023

# Port of the Palworld REST API the watchdog polls for player counts
ENV RESTAPIPORT=8212

# Set the working directory in the container
WORKDIR /app

# Install required packages (curl-minimal is preinstalled and enough for the
# REST API calls; netstat is provided by net-tools, the AWS CLI v2 by awscli-2)
RUN dnf install -y net-tools jq awscli-2 && \
    dnf clean all

# Copy the `watchdog.sh` script to the container and make it executable
COPY ./watchdog.sh .
RUN chmod +x ./watchdog.sh

# Set the entrypoint to the `watchdog.sh` script
ENTRYPOINT ["./watchdog.sh"]
