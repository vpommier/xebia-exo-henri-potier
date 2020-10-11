# Cloud henri potier

## Project structure
```
.
├── README.md
├── docker-compose.yml
├── env
├── ci
|    ├── artifacts
|    └── infra
└── stack
    ├── api
    ├── dispatcher
    └── infra
```
| Tree element | Description |
|-|-|
| [docker-compose.yml](docker-compose.yml) | Docker compose file provide you a reproducible execution context. |
| env | Env files directory that store params and secrets for the entire stack. |
| ci | CI/CD scripts and factory. |
| ci/artifacts | CI scripts related to artifacts repository provisionning. |
| ci/infra | CD scripts related to deploy environments. |
| stack | Each components that compose the stack. |
| stack/api | The book store API. |
| stack/dispatcher | The middleware that dispatch events to S3 and SQS. |
| stack/infra | Provision the infrastructure that glue together others components of the stack. |

## Requirements
* docker >= 18.09.6
* docker-compose >= 1.27.4
* bash >= 4.4.20

## Provision infra
### 1. Provision repositories:
```bash
docker-compose run --rm factory \
env $(<env/repositories.env) \
$(<env/infra/test.env) \
$(<env/aws_credentials.env) \
INFRA_DIR=./stack/infra \
./ci/artifacts/repositories.sh
```

### 2. Provision infra:
```bash
docker-compose run --rm factory \
env $(<env/repositories.env) \
$(<env/infra/test.env) \
$(<env/aws_credentials.env) \
INFRA_DIR=./stack/infra \
ci/infra/deploy.sh
```

## Teardown infra:
```bash
docker-compose run --rm factory \
env $(<env/infra/test.env) \
$(<env/aws_credentials.env) \
INFRA_DIR=./stack/infra \
ci/infra/teardown.sh
```
