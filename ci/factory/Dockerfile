FROM library/ubuntu:20.04

RUN apt-get update

# Install tools dependencies.
RUN apt-get install -y \
  curl \
  unzip

# Install python 3 and pip.
RUN apt-get install -y \
  python3 \
  python3-pip

# Install awscli.
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y \
  less \
  groff \
  && curl -sSL 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o '/tmp/awscli.zip' \
  && unzip '/tmp/awscli.zip' -d '/tmp' \
  && '/tmp/aws/install' \
  && rm -rf '/tmp/awscli.zip' '/tmp/aws'

# Install sam cli.
RUN pip3 install aws-sam-cli

# Install nodejs.
RUN curl -sSL \
  https://nodejs.org/dist/v14.13.0/node-v14.13.0-linux-x64.tar.gz \
  | tar -C /usr/local --strip-components 1 -xz

# Install aws CDK.
RUN npm install -g aws-cdk

# Install Typescript.
RUN npm install -g typescript tslint
