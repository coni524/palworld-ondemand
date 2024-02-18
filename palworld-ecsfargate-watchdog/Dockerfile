# version 1.2.0

FROM public.ecr.aws/amazonlinux/amazonlinux:latest

# Set environment variables for Go installation
ENV GO_VERSION=1.22.0
ENV RCON_VERSION=0.10.3
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH
ENV GO111MODULE on

# Set environment variables for the RCON client
ENV RCONPORT=25575

# Set the working directory in the container
WORKDIR /app

# Install required packages
RUN yum install -y net-tools jq nmap-ncat go tar aws-cli && \
    yum clean all

# Install the RCON package
RUN curl -sL https://github.com/gorcon/rcon-cli/archive/refs/tags/v${RCON_VERSION}.tar.gz -o rcon.tar.gz \
    && tar -xzvf rcon.tar.gz \
    && rm rcon.tar.gz \
    && mv rcon-cli-${RCON_VERSION}/* ./ \
    && rm -rf rcon-cli-${RCON_VERSION} \
    && go build -v -o rcon ./cmd/gorcon \
    && chmod +x rcon \
    && mv rcon /usr/local/bin/

# Copy the `watchdog.sh` script to the container and make it executable
COPY ./watchdog.sh .
RUN chmod +x ./watchdog.sh

# Set the entrypoint to the `watchdog.sh` script
ENTRYPOINT ["./watchdog.sh"]
