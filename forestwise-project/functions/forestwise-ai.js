// functions/forestwise-ai.js

// 1. Handle Preflight Options (CORS)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// 2. The Main Handler
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { message, conversationHistory = [], speciesSnippet } = body;

    // --- SYSTEM PROMPT ---
    const systemPrompt = `
      You are Onyx, a forestry expert for SilviQ.
      Tone: Professional, concise, scientific.
      
      CRITICAL INSTRUCTION:
      You have access to a specific database snippet below. 
      ONLY use the information in this snippet to answer questions about specific trees.
      If the user asks about a tree not in the snippet, answer using your general knowledge but mention you are doing so.
      
      DATABASE SNIPPET:
      ${speciesSnippet || "No database matches for this query."}
    `;

    // Prepare messages for OpenAI-compatible format
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map(msg => ({ 
        role: msg.role, 
        content: msg.content 
      })),
      { role: "user", content: message }
    ];

    // --- THE PROVIDER LIST (THE HYDRA) ---
    // We try them in this order.
    const providers = [
      {
        name: "Cerebras (Fastest)",
        url: "https://api.cerebras.ai/v1/chat/completions",
        key: context.env.CEREBRAS_API_KEY,
        model: "llama3.1-8b",
      },
      {
        name: "Groq (Low Latency)",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: context.env.GROQ_API_KEY,
        model: "llama-3.1-8b-instant",
      },
      {
        name: "SambaNova (Backup)",
        url: "https://api.sambanova.ai/v1/chat/completions",
        key: context.env.SAMBANOVA_API_KEY,
        model: "Meta-Llama-3.1-8B-Instruct",
      },
      {
        name: "GitHub Models (Stable)",
        url: "https://models.github.ai/inference/chat/completions",
        key: context.env.GITHUB_TOKEN,
        model: "Meta-Llama-3.1-8B-Instruct", // ✅ Updated based on your test
      },
      {
        name: "Cohere (Smartest)",
        // Using Cohere's OpenAI-compatible endpoint
        url: "https://api.cohere.ai/compatibility/v1/chat/completions",
        key: context.env.COHERE_API_KEY,
        model: "command-r-plus-08-2024", // ✅ Updated based on your test
      }
    ];

    // --- ROUND ROBIN LOGIC ---
    let lastError = null;

    for (const provider of providers) {
      if (!provider.key) {
        console.warn(`Skipping ${provider.name}: No API Key set.`);
        continue;
      }

      try {
        console.log(`Attempting connection to: ${provider.name}`);
        
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${provider.key}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: messages,
            temperature: 0.3,
            max_tokens: 500
          }),
          // 👇 TIMEOUT: If provider hangs for >6s, kill it and switch instantly.
          signal: AbortSignal.timeout(6000) 
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`${provider.name} Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;

        // SUCCESS! Return immediately.
        return new Response(JSON.stringify({ response: reply }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        console.error(`❌ ${provider.name} Failed: ${err.message}`);
        lastError = err;
        // Loop continues to the next provider...
      }
    }

    // If we get here, ALL providers failed.
    return new Response(JSON.stringify({ 
      error: "System Overload: All AI models are currently busy. Please try again in 30 seconds." 
    }), { status: 503 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
