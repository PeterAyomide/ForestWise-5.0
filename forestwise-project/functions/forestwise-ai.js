// functions/forestwise-ai.js

// 1. Handle CORS Preflight (OPTIONS requests)
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

// 2. Handle POST requests (The Main Logic)
export async function onRequestPost(context) {
  try {
    // Parse incoming data
    const body = await context.request.json();
    const { message, conversationHistory = [], imageData, context: userContext, speciesData } = body;

    // Access Environment Variable
    const API_KEY = context.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "Server Error: Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }

    // --- MODEL CONFIGURATION ---
    // gemini-1.5-flash is the current standard for speed and efficiency.
    const MODEL_NAME = "gemini-1.5-flash-002"; 
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    // --- DATA CONTEXT PREPARATION ---
    const speciesContext = speciesData 
      ? `REAL-TIME DATABASE ACCESS: You have access to the following trusted species database: ${JSON.stringify(speciesData)}.`
      : "DATABASE STATUS: Species database not provided for this request.";

    // --- SYSTEM PROMPT (TONE ADJUSTMENT) ---
    const systemInstruction = `
      You are ForestWise AI (refer to yourself as "Onyx"), a professional forestry consultant and data analyst for the SilviQ platform.
      
      YOUR PERSONALITY & TONE:
      - Role: Expert Consultant.
      - Tone: Professional, objective, precise, and concise. 
      - Avoid: Excessive enthusiasm, exclamation marks, emojis, or casual slang. Do not sound like a cheerleader.
      - Focus: Prioritize accuracy, scientific context, and practical utility.
      
      FORMATTING RULES:
      1. Use standard Markdown for structure (bolding for key terms, bullet points for lists).
      2. Do NOT use large headers (hashtags like ##) unless organizing a complex report.
      3. Keep paragraphs short and scannable.
      
      YOUR DATA USAGE:
      1. You have access to a species database: ${speciesContext}
      2. DATA SYNTHESIS: When asked about trees, provide specific data points (height, soil needs) woven into clear sentences. Dont just dump the ecological data of tree species when asked about general knowledge concerning a tree.
      3. MISSING DATA: If the database lacks info, use general forestry knowledge but state clearly that it is a general estimate.
      
      CONTEXT FROM USER SESSION:
      ${userContext || "The user is exploring tree options."}
      
      Goal: Provide accurate, actionable forestry data to assist the user's decision-making.
    `.trim();

    // Format History for Gemini
    const contents = conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Add the New Message (Text + Image support)
    const currentParts = [];
    if (message) currentParts.push({ text: message });
    
    if (imageData) {
      // Clean base64 string
      const base64Data = imageData.split(',')[1];
      const mimeType = imageData.substring(imageData.indexOf(':') + 1, imageData.indexOf(';'));
      
      currentParts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    contents.push({ role: 'user', parts: currentParts });

    // Call Google Gemini API
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: contents,
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          temperature: 0.3, // Lowered temperature for more deterministic/professional results
          maxOutputTokens: 2048, // High token limit to prevent cutoff
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

    // Return Success Response
    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (error) {
    console.error("Backend Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }
}






