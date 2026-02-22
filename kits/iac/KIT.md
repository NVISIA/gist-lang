# GIST Kit: Infrastructure as Code

*Generates Terraform HCL, Pulumi, or CDK from GIST resource declarations.*

---

## Overview

The IaC kit lets you describe infrastructure resources in GIST and have the LLM generate Terraform HCL (or Pulumi/CDK depending on `gist.yaml`). The same GIST principles apply: write intent, the LLM writes the implementation.

**Activate:** `kit: iac` in your project header.

**Requires `gist.yaml` sections:** `iac`, `providers`, `backend` (all defined by this kit).

---

## Keywords

### `resource` — Infrastructure Resources

```gist
resource Vpc {
  provider: aws
  cidr_block: "10.0.0.0/16"
  enable_dns_support: true
  enable_dns_hostnames: true
  tags: auto
}
```

**`resource Name { }`** declares an infrastructure resource. It's not a data model — it's something that gets provisioned in a cloud provider. The LLM generates the corresponding Terraform resource block.

**Fields inside `resource`** are passed through to HCL as arguments. GIST doesn't enforce a schema for resource fields — the LLM maps them to the correct Terraform resource type based on `provider` and context.

**`tags: auto`** — inherits tags from the provider's `default_tags` in `gist.yaml`.

### Dependencies with `needs:`

```gist
resource PrivateSubnets {
  provider: aws
  needs: Vpc
  count: 3
  cidr_blocks: ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
  availability_zones: spread across all available AZs
  map_public_ip: false
  tags: auto
}

resource Database {
  provider: aws
  needs: PrivateSubnets, DbSecurityGroup
  type: RDS PostgreSQL 16
  instance_class: "db.r6g.large"
  storage: 100gb, encrypted
  multi_az: true
  backup_retention: 30 days
  deletion_protection: true

  must:
    not publicly accessible
    encrypted at rest with KMS
    automated backups enabled
}
```

`needs:` creates Terraform dependency references. The LLM generates `depends_on` or implicit references via attribute interpolation — whichever is idiomatic HCL.

### `group` — Related Resources

```gist
group networking {
  > VPC, subnets, and security groups for the platform.

  resource Vpc {
    provider: aws
    cidr_block: "10.0.0.0/16"
    enable_dns_support: true
    tags: auto
  }

  resource PublicSubnets {
    needs: Vpc
    count: 3
    cidr_blocks: ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
    map_public_ip: true
    tags: auto
  }

  resource PrivateSubnets {
    needs: Vpc
    count: 3
    cidr_blocks: ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
    map_public_ip: false
    tags: auto
  }
}
```

**`group name { }`** organizes related resources — maps to a Terraform module or a logical grouping in the generated HCL. Resources within a group can reference each other by name. Cross-group references use dot notation: `networking.Vpc`, `security.DbSecurityGroup`.

### `variable` and `output`

```gist
variable environment {
  type: string
  values: ["dev", "staging", "production"]
  default: "dev"
}

resource Database {
  provider: aws
  needs: PrivateSubnets
  type: RDS PostgreSQL 16
  instance_class: var.instance_class
  tags: auto
}

output database_endpoint {
  value: Database.endpoint
  sensitive: false
}

output database_password {
  value: Database.password
  sensitive: true
}
```

**`variable name { }`** maps to Terraform `variable` blocks. **`output name { }`** maps to Terraform `output` blocks. `var.name` references work inside resource fields.

### `data` — Data Sources

```gist
data CurrentRegion {
  provider: aws
  type: region
}

data AmazonLinuxAmi {
  provider: aws
  type: ami
  most_recent: true
  owners: ["amazon"]
  filter:
    name: "amzn2-ami-hvm-*-x86_64-gp2"
}
```

**`data Name { }`** maps to Terraform `data` blocks — read-only references to existing infrastructure.

---

## Prose in Resources

Unlike raw HCL, GIST lets you use prose for complex configurations:

```gist
resource ApiService {
  provider: aws
  needs: Cluster, ApiTaskDefinition, LoadBalancer
  type: ECS Service

  desired_count: 2
  deployment:
    minimum_healthy: 50%
    maximum: 200%
    circuit_breaker: enabled with rollback

  scaling:
    min: 2, max: 10
    scale up when cpu > 70% for 5 minutes
    scale down when cpu < 30% for 15 minutes
    cooldown: 5 minutes

  health_check:
    path: /health
    interval: 30s
    healthy_threshold: 2
    unhealthy_threshold: 3
}
```

The LLM interprets prose like "scale up when cpu > 70% for 5 minutes" and generates the corresponding `aws_appautoscaling_policy` and `aws_cloudwatch_metric_alarm` resources. This is where GIST shines over raw HCL — you describe the intent, the LLM generates the 30+ lines of alarm/policy boilerplate.

---

## Core Construct Extensions

### `always:` for Compliance

```gist
project platform-infra
  kit: iac
  stack: gist.yaml

  always:
    all S3 buckets have encryption enabled
    all S3 buckets block public access
    all RDS instances are encrypted at rest
    all security groups deny unrestricted ingress on port 22
    all resources tagged with: project, environment, team, cost_center
    no IAM policies use wildcard (*) actions
```

Project-level `always:` invariants apply to every resource. The LLM ensures all generated HCL satisfies these constraints — adding encryption, tagging, and access controls even when the individual `resource` block doesn't mention them.

### `rules:` for Environment Config

```gist
rules environments:
  dev:        { instance: "t3.small",  db: "db.t3.micro",  replicas: 1, multi_az: false }
  staging:    { instance: "t3.medium", db: "db.r6g.large",  replicas: 2, multi_az: false }
  production: { instance: "c5.xlarge", db: "db.r6g.xlarge", replicas: 3, multi_az: true }

resource Database {
  provider: aws
  type: RDS PostgreSQL 16
  instance_class: from rules environments[var.environment].db
  multi_az: from rules environments[var.environment].multi_az
}
```

`from rules` references look up values from rules tables. The LLM generates Terraform `locals` or variable lookups.

---

## Grammar Productions

```ebnf
ResourceDecl       = 'resource' <type_name> '{' INDENT
                     [ 'provider:' <identifier> ]
                     [ 'needs:' <type_name> { ',' <type_name> } ]
                     [ 'type:' <prose> ]
                     { ContextLine }
                     { ResourceField }
                     [ MustBlock ]
                     DEDENT '}' ;

ResourceField      = <identifier> ':' ResourceValue ;
ResourceValue      = Literal | <prose> | 'var.' <identifier>
                   | 'from' 'rules' <dotted_name>
                   | ResourceRef | 'auto' ;
ResourceRef        = [ <identifier> '.' ] <type_name> [ '.' <identifier> ] ;

GroupDecl          = 'group' <identifier> '{' INDENT
                     { ContextLine }
                     { ResourceDecl | DataDecl }
                     DEDENT '}' ;

VariableDecl       = 'variable' <identifier> '{' INDENT
                     'type:' <identifier>
                     [ 'default:' Literal ]
                     [ 'values:' InlineList ]
                     [ 'sensitive:' ( 'true' | 'false' ) ]
                     DEDENT '}' ;

OutputDecl         = 'output' <identifier> '{' INDENT
                     'value:' ( <dotted_name> | <string_literal> )
                     [ 'sensitive:' ( 'true' | 'false' ) ]
                     DEDENT '}' ;

DataDecl           = 'data' <type_name> '{' INDENT
                     [ 'provider:' <identifier> ]
                     [ 'type:' <identifier> ]
                     { ResourceField }
                     DEDENT '}' ;
```

---

## Interpretation Rules

When the directive is `generate terraform` (or `generate hcl`) — determined by `iac.tool` in `gist.yaml` — the LLM:

1. Maps each `resource` to the appropriate Terraform resource type (e.g., `resource Vpc` → `aws_vpc`, `resource Database` with type "RDS PostgreSQL" → `aws_db_instance`)
2. Maps `group` blocks to Terraform modules or logical file grouping
3. Generates `variable`, `output`, `data` blocks as direct Terraform equivalents
4. Converts prose fields to concrete HCL arguments (e.g., "spread across availability zones" → `availability_zone` with data source lookup)
5. Resolves `needs:` into `depends_on` or attribute references
6. Resolves `from rules` into locals or variable lookups
7. Applies `always:` constraints to every resource (adding tags, encryption, access controls)
8. Generates `provider` blocks from `gist.yaml` `providers:` section
9. Generates backend configuration from `gist.yaml` `backend:` section
10. Produces standard Terraform file structure: `main.tf`, `variables.tf`, `outputs.tf`, `providers.tf`, `backend.tf`, plus one `.tf` file per `group`

---

## Code Generation Expectations

The LLM produces:

- `main.tf` — top-level resources and data sources
- `variables.tf` — all `variable` declarations
- `outputs.tf` — all `output` declarations
- `providers.tf` — provider blocks from `gist.yaml` `providers:` section
- `backend.tf` — backend config from `gist.yaml` `backend:` section
- One `.tf` file per `group` (e.g., `networking.tf`, `security.tf`)
- `locals.tf` — when `rules:` tables are used

Plus, as needed: module structure, IAM policies, security groups, and any resources implied by `always:` constraints.

---

## Full Example

```gist
project shopfront-infra
  > AWS infrastructure for the shopfront e-commerce platform.
  > Generates Terraform HCL.

  kit: iac
  stack: gist.yaml

  rules environments:
    dev:        { db_class: "db.t3.micro",  app_count: 1, cache_type: "cache.t3.micro" }
    staging:    { db_class: "db.r6g.large",  app_count: 2, cache_type: "cache.r6g.large" }
    production: { db_class: "db.r6g.xlarge", app_count: 3, cache_type: "cache.r6g.xlarge" }

  always:
    all storage encrypted at rest
    all traffic encrypted in transit
    no public database access
    all resources tagged with project, environment, managed_by = "terraform"

variable environment {
  type: string
  values: ["dev", "staging", "production"]
}

variable domain {
  type: string
}


group networking {
  resource Vpc {
    provider: aws
    cidr_block: "10.0.0.0/16"
    tags: auto
  }

  resource PublicSubnets {
    needs: Vpc
    count: 3
    spread across availability zones
    map_public_ip: true
  }

  resource PrivateSubnets {
    needs: Vpc
    count: 3
    spread across availability zones
    map_public_ip: false
  }

  resource InternetGateway { needs: Vpc }
  resource NatGateway { needs: PublicSubnets, count: 1 }

  resource PublicRouteTable {
    needs: Vpc, InternetGateway
    routes: "0.0.0.0/0" -> InternetGateway
    associate: PublicSubnets
  }

  resource PrivateRouteTable {
    needs: Vpc, NatGateway
    routes: "0.0.0.0/0" -> NatGateway
    associate: PrivateSubnets
  }
}


group security {
  resource AppSecurityGroup {
    needs: networking.Vpc
    ingress:
      port 443 from anywhere (HTTPS)
      port 80 from anywhere (HTTP, redirect to HTTPS)
    egress: all traffic
  }

  resource DbSecurityGroup {
    needs: networking.Vpc
    ingress:
      port 5432 from AppSecurityGroup only
    egress: none
  }

  resource CacheSecurityGroup {
    needs: networking.Vpc
    ingress:
      port 6379 from AppSecurityGroup only
    egress: none
  }
}


group database {
  resource DbSubnetGroup {
    needs: networking.PrivateSubnets
    subnets: networking.PrivateSubnets
  }

  resource Database {
    needs: DbSubnetGroup, security.DbSecurityGroup
    provider: aws
    type: RDS PostgreSQL 16
    instance_class: from rules environments[var.environment].db_class
    storage: 50gb, gp3, encrypted
    multi_az: var.environment == "production"
    backup_retention: 30 days
    deletion_protection: var.environment == "production"
    performance_insights: enabled

    must: automated backups to separate region for production
  }
}


group cache {
  resource Redis {
    needs: networking.PrivateSubnets, security.CacheSecurityGroup
    provider: aws
    type: ElastiCache Redis 7
    node_type: from rules environments[var.environment].cache_type
    num_cache_nodes: 1
    at_rest_encryption: true
    transit_encryption: true
  }
}


group application {
  resource EcrRepository {
    provider: aws
    name: "shopfront"
    image_scanning: enabled
    lifecycle: keep last 10 images
  }

  resource Cluster {
    provider: aws
    type: ECS Fargate
  }

  resource TaskDefinition {
    needs: database.Database, cache.Redis
    provider: aws
    type: ECS Task
    cpu: 512
    memory: 1024
    container:
      image: EcrRepository.url
      port: 3000
      environment:
        DATABASE_URL: database.Database.endpoint
        REDIS_URL: cache.Redis.endpoint
        NODE_ENV: var.environment
      secrets:
        STRIPE_SECRET_KEY: from SSM parameter
        JWT_SECRET: from SSM parameter
      health_check: GET /health every 30s
      logging: CloudWatch
  }

  resource Service {
    needs: Cluster, TaskDefinition, LoadBalancer
    provider: aws
    type: ECS Service
    desired_count: from rules environments[var.environment].app_count

    scaling:
      min: 1, max: 10
      scale up when cpu > 70% for 5 minutes
      scale down when cpu < 30% for 15 minutes
  }

  resource LoadBalancer {
    needs: networking.PublicSubnets, security.AppSecurityGroup
    provider: aws
    type: ALB
    scheme: internet-facing

    listener port 443:
      certificate: Certificate
      forward to: Service
    listener port 80:
      redirect to: port 443
  }

  resource Certificate {
    provider: aws
    type: ACM
    domain: var.domain
    validation: DNS
  }
}


output app_url {
  value: "https://${var.domain}"
}

output database_endpoint {
  value: database.Database.endpoint
  sensitive: true
}

output redis_endpoint {
  value: cache.Redis.endpoint
  sensitive: true
}

output load_balancer_dns {
  value: application.LoadBalancer.dns_name
}
```

---

## gist.yaml Example

```yaml
project: shopfront-infra
version: 0.1.0
description: AWS infrastructure for shopfront e-commerce platform

iac:
  tool: terraform
  version: ">= 1.7"
  output_dir: infrastructure

providers:
  aws:
    region_env: AWS_REGION
    default_region: us-east-1
    default_tags:
      project: shopfront
      managed_by: terraform
      environment: ${var.environment}

backend:
  type: s3
  bucket_env: TF_STATE_BUCKET
  key: "shopfront/terraform.tfstate"
  region_env: AWS_REGION
  dynamodb_table_env: TF_LOCK_TABLE
  encrypt: true

env:
  AWS_REGION:
    type: string
    default: us-east-1
  TF_STATE_BUCKET:
    type: string
    required: true
  TF_LOCK_TABLE:
    type: string
    required: true
```

---

*GIST Kit: IaC v1.0.0*
