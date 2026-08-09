# Cloud Team Deployment Checklist (single page)

Repository: `…/AI SDLC/_git/DBizIntelligencePlane` · Branch `main` · Tag `v0.1.0-rc1` (after commit) · Region **Australia Southeast**

Execute in order. Each box requires **execution evidence** (command output / portal screenshot). Detail: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) · [POST_DEPLOYMENT_VALIDATION.md](POST_DEPLOYMENT_VALIDATION.md).

```
□ Docker Build           az acr build -r <acr> -t dbiz-intelligence-plane:<tag> -f deploy/Dockerfile .   (= E-2)
□ ACR Push               image + digest recorded
□ Container Apps Deploy  az containerapp create -g <rg> --yaml deploy/azure/containerapp.yaml
□ Key Vault              app boots (refuses without SESSION_SECRET) → secretRef resolved
□ Azure Files            /state mounted; tenants/registration/signing created; survives restart
□ Redis                  infra connectivity only (app backend = memory until M-b)
□ Managed Identity       AcrPull + Key Vault Secrets User + Storage File Data SMB Share Contributor effective
□ Application Gateway     backend Healthy; host-name-from-backend-pool=Yes; /api/health 200-399
□ Health Check           curl https://<fqdn>/api/health → 200 {"status":"ok"}
□ Readiness Check        probe on /api/health → revision Healthy
□ Workflow Execution     POST /api/auth/session → POST /api/tenants → tenant persisted
□ Logs                   az containerapp logs show → startup + request logs captured
□ Restart                revision restart → health returns, tenant data intact
□ Scaling                confirm single replica (minReplicas=maxReplicas=1)
□ Deployment Complete    return the POST_DEPLOYMENT_VALIDATION evidence package to the dev team
```

Classify any failure as **infrastructure** or **application** ([SUPPORT_AND_OWNERSHIP.md](SUPPORT_AND_OWNERSHIP.md)).
