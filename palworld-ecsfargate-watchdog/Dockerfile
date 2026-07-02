# version 2.0.0

# Build the rcon CLI from source so the image works on both amd64 and arm64.
FROM public.ecr.aws/docker/library/golang:1.26-alpine AS rcon-build

ENV RCON_VERSION=0.10.3

WORKDIR /src
RUN wget -qO- https://github.com/gorcon/rcon-cli/archive/refs/tags/v${RCON_VERSION}.tar.gz \
    | tar -xz --strip-components=1 \
    && CGO_ENABLED=0 go build -o /rcon ./cmd/gorcon

FROM public.ecr.aws/amazonlinux/amazonlinux:2023

# Set environment variables for the RCON client
ENV RCONPORT=25575

# Set the working directory in the container
WORKDIR /app

# Install required packages (curl-minimal and jq come with the watchdog's needs;
# netstat is provided by net-tools, the AWS CLI v2 by awscli-2)
RUN dnf install -y net-tools jq awscli-2 && \
    dnf clean all

COPY --from=rcon-build /rcon /usr/local/bin/rcon

# Copy the `watchdog.sh` script to the container and make it executable
COPY ./watchdog.sh .
RUN chmod +x ./watchdog.sh

# Set the entrypoint to the `watchdog.sh` script
ENTRYPOINT ["./watchdog.sh"]
