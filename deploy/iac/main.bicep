// ─────────────────────────────────────────────────────────────────────────────
// DBiz Intelligence Plane — E-2 production infrastructure (Azure, Bicep).
//
// Provisions the runtime the Independent GA Certification requires to move
// "Deployment: NOT MEASURED" toward measured: Container Apps host, User-Assigned
// Managed Identity, Key Vault (secrets by reference — closes B-1 at the platform
// level), Log Analytics (logs+metrics), health/readiness probes, and autoscale.
//
// AUTHORED, NOT APPLIED here (no Azure CLI/runtime in the build environment).
// Deploy with:  az deployment group create -g <rg> -f deploy/iac/main.bicep -p @params.json
// Governance/certification is rendered by the IP suite: node governance/verification/run-all.js
// ─────────────────────────────────────────────────────────────────────────────

@description('Deployment region')
param location string = resourceGroup().location
@description('Environment name (dev|staging|prod)')
param env string = 'prod'
@description('Container image, e.g. <acr>.azurecr.io/dbiz/intelligence-plane:<tag>')
param image string
@description('ACR login server for pull identity')
param acrLoginServer string
@description('Min/Max replicas for autoscale')
param minReplicas int = 1
param maxReplicas int = 10

var prefix = 'dbiz-ip-${env}'

// ── Observability: logs + metrics ───────────────────────────────────────────
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: { retentionInDays: 90, sku: { name: 'PerGB2018' } }
}

// ── Identity: workload pulls image + reads Key Vault as itself (no static keys) ─
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-id'
  location: location
}

// ── Secret store: DBiz-tenancy secrets, customer-tenancy secrets never here ──
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${take(replace(prefix, '-', ''), 20)}kv'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true          // RBAC, not access policies
    enableSoftDelete: true
    enablePurgeProtection: true
    networkAcls: { defaultAction: 'Deny', bypass: 'AzureServices' }  // private by default
  }
}

// Grant the workload identity least-privilege secret read (Key Vault Secrets User).
resource kvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, identity.id, 'kv-secrets-user')
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Compute host ─────────────────────────────────────────────────────────────
resource caEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: prefix
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'auto', allowInsecure: false }
      registries: [ { server: acrLoginServer, identity: identity.id } ]
      // Secrets are Key Vault REFERENCES resolved by the managed identity — no
      // secret value appears in this template (B-1 posture at the platform level).
      // `package-signing-key` is REQUIRED alongside `session-secret` (ADR-0083): there is no
      // create-if-missing, so the container refuses to start without it.
      secrets: [
        { name: 'session-secret', keyVaultUrl: '${kv.properties.vaultUri}secrets/session-secret', identity: identity.id }
        { name: 'package-signing-key', keyVaultUrl: '${kv.properties.vaultUri}secrets/package-signing-key', identity: identity.id }
      ]
    }
    template: {
      containers: [ {
        name: 'intelligence-plane'
        image: image
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: [
          { name: 'PORT', value: '8080' }
          { name: 'DBIZ_STORAGE_BACKEND', value: 'filesystem' }
          { name: 'DBIZ_SECRET_BACKEND', value: 'keyvault' }
          { name: 'SESSION_SECRET', secretRef: 'session-secret' }
          { name: 'PACKAGE_SIGNING_KEY', secretRef: 'package-signing-key' }
        ]
        probes: [
          { type: 'Liveness',  httpGet: { path: '/api/health', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 30 }
          { type: 'Readiness', httpGet: { path: '/api/ready',  port: 8080 }, initialDelaySeconds: 5,  periodSeconds: 10 }
          { type: 'Startup',   httpGet: { path: '/api/health', port: 8080 }, failureThreshold: 30, periodSeconds: 5 }
        ]
      } ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [ { name: 'http', http: { metadata: { concurrentRequests: '50' } } } ]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
