#!/bin/bash

function checkEnv(){
  for e in $@; do
    if [ ! -n "${!e}" ] ; then
      echo "$e variable must be set."
      exit 1
    fi
  done
}

set -e

envs=(
  REPOSITORIES_STACK_NAME
  REPOSITORIES_STACK_ACCOUNT
  REPOSITORIES_STACK_NAME
  INFRA_DIR
)
checkEnv "${envs[@]}"

cd "$INFRA_DIR"
cdk bootstrap \
  "aws://${REPOSITORIES_STACK_ACCOUNT}/${REPOSITORIES_STACK_REGION}" \
  --toolkit-stack-name "$REPOSITORIES_STACK_NAME"
