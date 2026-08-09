# Frequently asked questions

**Do I need to open a firewall port?**
No, and you never will. Your deployment initiates every connection. A request to
open inbound access did not come from this platform.

**Where is my test data stored?**
In your tenancy. The platform stores none of it, and its absence is verified on
every build rather than promised.

**What happens if I lose my certificate?**
Rotate. It needs no redeploy and registration is idempotent, so you will not end up
with a second identity.

**Can I reuse the registration credential?**
No. It is consumed on first use. Registering again with it returns the grant you
already hold rather than failing — which is what makes retried deployments safe.

**Does upgrading the platform force me to redeploy?**
No. The platform and your Execution Plane upgrade independently, and contracts are
accepted across a supported window. The current contract is 1.0.0.

**Why was my profile refused when every field looked valid?**
Each field can be valid while the combination is not buildable. The compatibility
matrix lists what is supported; the refusal names which part is the problem.

**My token stopped working after rotating certificates.**
Tokens are bound to the certificate they were issued against. Fetch a token for the
new certificate. This is the binding working, not a fault.

**Can DBiz see my screenshots?**
No. They stay in your tenancy unless you explicitly scrub and share them, and
support bundles are scrubbed on the way out.

**How long does onboarding take?**
The automated path is measured on every release, and the figure for this release is in `MANIFEST.json`. The rest is your decisions and your review process — which is the part that actually takes the time.

**Is there an API key?**
No, and there will not be. Static keys are prohibited by the platform's own
constitution. Identity is a certificate; authorisation is a short-lived token bound
to it.

---

*Generated from validation output · contract 1.0.0 · generator 1.0.0 · templates 1.0.0*
*Not hand-maintained. Regenerated on every release from the run that validated it.*
