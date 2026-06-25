const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-labtrak-ai-key',
  ].join(', '),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type LabTrakAiRequest = {
  prompt?: string;
  model?: string;
  max_tokens?: number;
  image?: {
    data?: string;
    media_type?: string;
  };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredProductKey() {
  return Deno.env.get('LABTRAK_AI_PRODUCT_KEY') || Deno.env.get('AI_PRODUCT_KEY') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY is not configured for labtrak-ai' }, 500);
    }

    const requiredProductKey = getRequiredProductKey();
    if (requiredProductKey) {
      const supplied = req.headers.get('x-labtrak-ai-key') || '';
      if (supplied !== requiredProductKey) {
        return jsonResponse({ error: 'Invalid AI product key' }, 401);
      }
    }

    const payload = await req.json() as LabTrakAiRequest;
    const prompt = (payload.prompt || '').trim();
    if (!prompt) {
      return jsonResponse({ error: 'prompt is required' }, 400);
    }

    const content: Array<Record<string, unknown>> = [];
    if (payload.image?.data) {
      const mediaType = payload.image.media_type || 'image/jpeg';
      if (!/^image\/(png|jpe?g|webp)$/i.test(mediaType)) {
        return jsonResponse({ error: 'Unsupported image media type' }, 400);
      }
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: payload.image.data,
        },
      });
    }

    content.push({ type: 'text', text: prompt });

    const maxTokens = Math.min(Math.max(Number(payload.max_tokens || 1000), 1), 2000);
    const model = payload.model || 'claude-sonnet-4-20250514';

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await anthropicResp.json().catch(() => null);
    if (!anthropicResp.ok) {
      return jsonResponse({
        error: data?.error?.message || data?.error || 'Anthropic request failed',
      }, anthropicResp.status);
    }

    const text = Array.isArray(data?.content)
      ? data.content.map((part: { text?: string }) => part.text || '').join('')
      : '';

    return jsonResponse({
      text,
      id: data?.id,
      model: data?.model,
      usage: data?.usage,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unknown labtrak-ai error',
    }, 500);
  }
});
