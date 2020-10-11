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
  INFRA_DIR
)
checkEnv "${envs[@]}"

cd "$INFRA_DIR"
cdk destroy \
  --require-approval never
