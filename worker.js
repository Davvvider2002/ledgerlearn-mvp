const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/feedback') {
        return await handleFeedback(request, env);
      }
      if (url.pathname === '/api/generate-scenario') {
        return await handleScenario(request, env);
      }
      if (url.pathname === '/api/cert-text') {
        return await handleCertText(request, env);
      }
      if (url.pathname === '/health') {
        return jsonResponse({ status: 'ok', worker: 'ledgerlearn', ts: Date.now() });
      }
      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

async function handleFeedback(request, env) {
  const { question, selectedAnswer, correctAnswer, isCorrect } = await request.json();

  const prompt = isCorrect
    ? `The student answered correctly. Question: "${question}". Correct answer: "${correctAnswer}". Give a 2-sentence reinforcement explaining WHY this is correct, in plain English for a bookkeeper. No preamble.`
    : `The student answered incorrectly. Question: "${question}". They chose: "${selectedAnswer}". Correct answer: "${correctAnswer}". Give a 2-sentence explanation of why the correct answer is right and where they went wrong. Plain English for a bookkeeper. No preamble.`;

  const data = await callClaude(env.ANTHROPIC_API_KEY, prompt, 250);
  return jsonResponse({ feedback: data.content[0].text });
}

async function handleScenario(request, env) {
  const { track, module, difficulty } = await request.json();

  const prompt = `Generate a realistic accounting scenario MCQ for a ${track} software training course, module: ${module}, difficulty: ${difficulty || 'intermediate'}.

Return ONLY valid JSON in this exact format, no other text:
{
  "context": "2-3 sentence business scenario with a real company name and specific numbers",
  "question": "specific question about what to do in the software",
  "options": ["option A text", "option B text", "option C text", "option D text"],
  "correct_index": 1,
  "explanation": "2 sentence explanation of why the correct answer is right"
}`;

  const data = await callClaude(env.ANTHROPIC_API_KEY, prompt, 500);
  const raw = data.content[0].text.trim().replace(/```json|```/g, '').trim();
  const scenario = JSON.parse(raw);
  return jsonResponse(scenario);
}

async function handleCertText(request, env) {
  const { studentName, track, score } = await request.json();

  const prompt = `Write a 1-sentence personalised congratulations for ${studentName} who passed the ${track} certification with ${score}%. Professional but warm. No emojis. Start with "Congratulations".`;

  const data = await callClaude(env.ANTHROPIC_API_KEY, prompt, 100);
  return jsonResponse({ text: data.content[0].text });
}

async function callClaude(apiKey, prompt, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }
  return response.json();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
