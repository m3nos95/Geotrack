# LabTrak AI Edge Function

This function proxies LabTrak image-analysis requests to Anthropic so the
provider API key is never stored in or sent from the browser.

## Required secret

Set this in Supabase Edge Function secrets:

```text
ANTHROPIC_API_KEY=<your Anthropic API key>
```

## Optional product key gate

Set one of these if you want the browser's LabTrak product key to be verified
before AI requests are accepted:

```text
LABTRAK_AI_PRODUCT_KEY=<shared LabTrak product key>
```

`AI_PRODUCT_KEY` is also accepted as a fallback secret name.

## Deploy

```bash
supabase functions deploy labtrak-ai
supabase secrets set ANTHROPIC_API_KEY=...
supabase secrets set LABTRAK_AI_PRODUCT_KEY=...
```
