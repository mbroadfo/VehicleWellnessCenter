# Vehicle Wellness Center MongoDB Atlas Guide

End-to-end checklist for standing up the Vehicle Wellness Center MongoDB Atlas project, serverless cluster, and Parameter Store integration with strong security practices.

## 🎯 Overview

This guide covers:

- Creating the `Vehicle Wellness Center` Atlas project (or using an existing one)
- Provisioning the `vehicalwellnesscenter-cluster` serverless instance and base database
- Generating/storing API keys and connection credentials
- Coordinating AWS Parameter Store entries consumed by Terraform and Lambda
- Recommended access control patterns for Atlas users and IP allow lists

## 📋 Prerequisites

- Access to MongoDB Atlas organization
- Organization admin or project creator permissions in Atlas
- AWS account (Parameter Store + IAM access)
- Understanding of connection string formats

## 🏗️ Step 1: Create New Atlas Project

### 1.1 Access Organization

1. **Log into MongoDB Atlas**: Navigate to [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Select Organization**: Click the organization dropdown (top-left)
3. **Verify Organization**: Ensure you're in the correct organization

### 1.2 Create Project

1. **New Project**: Click "New Project" button (top-right)
2. **Project Name**: Enter `Vehicle Wellness Center` (or `Vehicle Wellness Center - Dev`)
3. **Add Members** (Optional): Add team members with appropriate roles
4. **Create Project**: Click "Create Project"

### 1.3 Find Project ID

**After project creation:**

1. **Project Settings**: Go to "Project Settings" in left sidebar
2. **General Tab**: Find "Project ID" in the General section
3. **Copy Project ID**: Save this for API access and Terraform

Record the actual Project ID (for example: `69137eb1b0d4e75e6425205d`).

## 🔑 Step 2: Generate API Keys (Public/Private Key Pair)

### 2.1 Organization-Level API Keys (Recommended)

**For managing multiple projects:**

1. **Organization Settings**: Click organization name → "Organization Settings"
2. **Access Manager**: Go to "Access Manager" tab
3. **API Keys**: Select "API Keys" sub-tab
4. **Create API Key**: Click "Create API Key"

**Key Configuration:**

```text
Description: VehicleWellnessCenter-Terraform
Permissions: Organization Project Creator
             Organization Read Only
             (add Project Owner if required)
```

1. **Generate**: Click "Next" → Copy both public and private keys
2. **Add IP Access**: Add your deployment IP addresses or `0.0.0.0/0` for initial setup
3. **Done**: Save keys securely (private key shown only once!)

### 2.2 Project-Level API Keys (Alternative)

**For single project management:**

1. **Project Settings**: In your project, go to "Project Settings"
2. **Access Manager**: Click "Access Manager" tab
3. **API Keys**: Select "API Keys" sub-tab
4. **Create API Key**: Follow same process as above

**Project-Level Permissions:**

```text
Project Owner (for Terraform bootstrap)
Project Data Access Admin (for Atlas user management)
```

### 2.3 Find Organization ID

1. **Organization Settings**: Organization name → "Organization Settings"
2. **General Tab**: Find "Organization ID"
3. **Copy Organization ID**: Save for API access

Record the actual Organization ID (e.g., `5d5c09149ccf64c5d84a9f0d`).

## 🗄️ Step 3: Create Cluster and Database

### 3.1 Create Cluster

1. **Database**: Go to "Database" in left sidebar
2. **Create**: Click "Create" button
3. **Cluster Configuration**:

```yaml
# Vehicle Wellness Center defaults
Cluster Type: M0 (Free Tier)
Cloud Provider: AWS
Region: us-west-2 (matches Lambda + Parameter Store usage)
Cluster Name: vehicalwellnesscenter-cluster
```

1. **Security Settings**: Configure during setup or skip for now
2. **Create Cluster**: Wait for cluster provisioning (2-10 minutes)

### 3.2 Database Access (Admin User)

**Initial admin user:**

- During project creation Atlas prompts for an admin user. Set the username to `vwc_admin_db_user` (or your preferred admin label) and copy the generated password immediately. Atlas will not show the password again.
- Save the username and password into AWS Parameter Store at `/vwc/dev/secrets` before leaving the setup wizard.
- Use those values to populate the `MONGODB_ATLAS_HOST`, `MONGODB_ATLAS_USERNAME`, and `MONGODB_ATLAS_PASSWORD` fields in Parameter Store.

**Additional users:**

1. **Database Access**: After the project is created, go to "Database Access" in the left sidebar for any extra users.
2. **Add New Database User**: Click the button if you need app- or environment-specific credentials.
3. **User Configuration**: Use strong passwords and scope privileges appropriately (e.g., `vehicle-app-user` with `readWrite` on `vehicle_wellness_center`).

**🔒 Critical Security Practice:**

- **Never hardcode passwords** in code or configuration files
- **Use AWS Parameter Store** for both admin and application credential storage
- **Generate strong passwords** (32+ characters, mixed case, numbers, symbols)
- **Rotate credentials regularly** (every 90 days minimum)

### 3.3 Network Access

1. **Network Access**: Go to "Network Access" in left sidebar
2. **Add IP Address**: Click "Add IP Address"

**Development Setup:**

```text
IP Address: 71.33.151.134/32 (replace with your workstation IP)
Comment: Vehicle Wellness Center - Dev Workstation
```

**Production Setup:**

```text
IP Address: <lambda_vpc_cidr>
Comment: Lambda VPC egress CIDR
```

### 3.4 Create Database

1. **Collections**: Go to "Database" → Browse Collections
2. **Create Database**: Click "Create Database"
3. **Database Configuration**:

```yaml
Database Name: vehicle_wellness_center
Collection Name: vehicles (first collection)
```

## 🔐 Step 4: Connection String and Credentials

### 4.1 Get Connection String

1. **Database**: Go to "Database" in left sidebar
2. **Connect**: Click "Connect" on your cluster
3. **Connect Application**: Select this option
4. **Driver**: Choose "Node.js" and latest version
5. **Connection String**: Copy the connection string

```javascript
// Vehicle Wellness Center example connection string
mongodb+srv://vwc_admin_db_user:<password>@vehicalwellnesscenter-c.shpig7c.mongodb.net/?appName=vehicalwellnesscenter-cluster
```

### 4.2 Secure Credential Management

**🚫 Never Do This:**

```javascript
// ❌ NEVER hardcode credentials
const mongoUri = "mongodb+srv://admin:mypassword123@cluster.mongodb.net/myapp";
```

**✅ AWS Parameter Store Pattern (Recommended):**

```javascript
// ✅ Secure credential retrieval
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

async function getMongoUri() {
  const client = new SSMClient({ region: "us-west-2" });
  const command = new GetParameterCommand({
    Name: "/vwc/dev/secrets",
    WithDecryption: true
  });
  
  const response = await client.send(command);
  const secrets = JSON.parse(response.Parameter.Value);
  return secrets.MONGODB_ATLAS_URI;
}
```

**Create AWS Secret:**

```json
{
  "MONGODB_ATLAS_HOST": "vehicalwellnesscenter-c.shpig7c.mongodb.net",
  "MONGODB_ATLAS_USERNAME": "vwc_admin_db_user",
  "MONGODB_ATLAS_PASSWORD": "ACTUAL_PASSWORD",
  "MONGODB_DATABASE_NAME": "vehicle_wellness_center"
}
```

## 📊 Step 5: Terraform Integration (Advanced)

### 5.1 Provider Configuration

```hcl
# infra/main.tf excerpt
terraform {
  required_providers {
    mongodbatlas = {
      source = "mongodb/mongodbatlas"
      version = "~> 1.21"
    }
  }
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}
```

### 5.2 Variables

```hcl
# infra/main.tf variables excerpt
variable "mongodb_atlas_public_key" {
  description = "MongoDB Atlas API public key"
  type        = string
}

variable "mongodb_atlas_private_key" {
  description = "MongoDB Atlas API private key"
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_project_id" {
  description = "Vehicle Wellness Center Atlas project ID"
  type        = string
}

variable "mongodb_database_user_secret_id" {
  description = "Parameter Store name containing MongoDB app user credentials"
  type        = string
}
```

### 5.3 Project Resource

```hcl
# infra/main.tf resources excerpt
resource "mongodbatlas_serverless_instance" "vehicle" {
  project_id                              = var.mongodb_atlas_project_id
  name                                    = var.mongodb_atlas_serverless_name
  termination_protection_enabled          = true
  provider_settings_backing_provider_name = "AWS"
  provider_settings_provider_name         = "SERVERLESS"
  provider_settings_region_name           = var.mongodb_atlas_region
}

# MongoDB database user is managed manually in Atlas UI
# Credentials stored in Parameter Store at /vwc/dev/secrets
# Username: vwc_admin_db_user (readWriteAnyDatabase@admin)
  project_id         = var.mongodb_atlas_project_id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.mongodb_database_name
  }

  scopes {
    name = mongodbatlas_serverless_instance.vehicle.name
    type = "CLUSTER"
  }
}
```

## 🔍 Step 6: Key Information Reference

### 6.1 Important IDs and Keys

Keep these secure and accessible:

```yaml
# Organization Information
Organization ID: 5d5c09149ccf64c5d84a9f0d (update if different)
Organization Name: Vehicle Wellness Programs (example)

# Project Information
Project ID: 69137eb1b0d4e75e6425205d (Vehicle Wellness Center)
Project Name: Vehicle Wellness Center

# API Keys
Public Key: [Generated in Access Manager → API Keys]
Private Key: [Generated in Access Manager → API Keys - SAVE IMMEDIATELY]

# Connection Information
Cluster Name: vehicalwellnesscenter-cluster
Database Name: vehicle_wellness_center
Connection String: mongodb+srv://vwc_admin_db_user:<password>@vehicalwellnesscenter-c.shpig7c.mongodb.net/?appName=vehicalwellnesscenter-cluster
```

### 6.2 Security Checklist

- [ ] Atlas API keys generated (`VehicleWellnessCenter-Terraform`) and stored securely
- [ ] Private key saved immediately (not shown again!)
- [ ] Workstation and Lambda CIDR blocks added to project network access
- [ ] `vwc_admin_db_user` created with strong password
- [ ] Connection string verified via mongosh/VS Code
- [ ] Credentials stored in AWS Parameter Store (SecureString at /vwc/dev/secrets)
- [ ] Terraform variables updated with secret ARNs/IDs
- [ ] Organization and Project IDs documented in legacy secret (for Terraform Atlas provider)

## 🚨 Security Best Practices

### Admin User Management

**Single Admin User Pattern:**

```yaml
Username: vwc_admin_db_user (admin fallback)
Password: Generated 32+ character password
Privileges: Atlas admin (full access)
Storage: AWS Parameter Store only
Rotation: Every 90 days minimum
```

**Multi-User Pattern (Recommended for teams):**

```yaml
Admin User: `vwc_admin_db_user` (Atlas admin scope)
App User: `vehicle-app-user` (limited to `vehicle_wellness_center` database)
Backup User: Dedicated backup credentials (optional)
Read-Only User: Analytics/reporting account (optional)
```

### Credential Rotation

**Monthly Rotation Process:**

1. Generate new password in Atlas
2. Update AWS Parameter Store
3. Deploy applications with new credentials
4. Verify connectivity
5. Remove old credentials

### Monitoring and Alerts

**Set up Atlas alerts for:**

- Connection failures
- High CPU/memory usage
- Disk space warnings
- Security events (failed logins)
- Backup failures

## 📚 Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Atlas API Reference](https://docs.atlas.mongodb.com/reference/api/)
- [Terraform MongoDB Atlas Provider](https://registry.terraform.io/providers/mongodb/mongodbatlas/latest/docs)
- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)

## 🔧 Troubleshooting

### Common Issues

**Connection Failures:**

- Verify IP whitelist includes your source IP
- Check username/password accuracy
- Ensure cluster is running (not paused)
- Validate connection string format

**API Key Issues:**

- Verify public/private key pair accuracy
- Check API key permissions for required operations
- Ensure IP access list includes API caller IP
- Confirm organization/project ID accuracy

**Authentication Errors:**

- Verify database user exists and has correct privileges
- Check password accuracy (no special character encoding issues)
- Ensure user has access to specified database
- Confirm authentication database is correct (usually admin)

---

**Created**: November 11, 2025
**Version**: 1.1
**Author**: Vehicle Wellness Center Engineering
