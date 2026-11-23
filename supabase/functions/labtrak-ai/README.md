# labtrak-ai

Reads a photographed Field Control or concrete handwritten sheet. The browser sends the image and the sheet prompt. This function calls Anthropic with the `ANTHROPIC_API_KEY` secret. It does not store that key in the page.

Optional gate: set `LABTRAK_AI_PRODUCT_KEY` (or `AI_PRODUCT_KEY`). The page sends the same value in `x-labtrak-ai-key`. Techs enter that product key in LabTrak Settings. It is saved in this browser as `ai_key`.

Deploy:

```
supabase functions deploy labtrak-ai
supabase secrets set ANTHROPIC_API_KEY=...
```
