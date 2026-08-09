# Pre-Deployment Checklist — Intelligence Plane

Complete **before** the deployment run. Owner in brackets.

## Tooling & access
- [ ] A build host with **Docker Engine** running, or use `az acr build` (no local Docker needed). *(Cloud)*
- [ ] **Azure CLI** installed and `az login` completed under an identity with deploy rights. *(Cloud)*
- [ ] Deploy identity holds `Contributor` (or scoped Container Apps + ACR + KV + Files roles) on the target Resource Group. *(Cloud)*

## Infrastructure provisioned (the six approved services only)
- [ ] **ACR** created; push enabled. *(Cloud)*
- [ ] **Container Apps environment** created, with the **Azure Files share registered** as a storage on the environment. *(Cloud)*
- [ ] **Key Vault** created; secret **`session-secret`** set (`openssl rand -base64 32`). *(Cloud)*
- [ ] **Azure Files** storage account + share created. *(Cloud)*
- [ ] **Cache for Redis** provisioned; endpoint/port recorded; network reachability from Container Apps confirmed. *(Cloud — consumed at M-b)*
- [ ] **Application Gateway** available (HTTPS listener + TLS cert). *(Cloud)*

## Identity & RBAC
- [ ] **User-assigned managed identity** created and granted `AcrPull`, `Key Vault Secrets User`, `Storage File Data SMB Share Contributor`. *(Cloud — see AZURE_CONFIGURATION_GUIDE)*

## Application readiness (from the dev team)
- [ ] Milestone (ADR-0060 + M-a adoption) **committed and tagged** — see RELEASE_NOTES. *(Dev)*
- [ ] Entra app registration exists; `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `IP_ADMIN_ALLOWLIST` values agreed. *(Shared)*
- [ ] `DBIZ_DEV_AUTH` confirmed **absent** from the Azure env. *(Cloud)*

## Values to record (fill before deploy — see the placeholder table in the handover)
- [ ] Subscription, Tenant ID, Resource Group, ACR name, Container Apps env id, Managed identity id, Key Vault URI, Storage account + share, Redis endpoint/port, App Gateway hostname.
