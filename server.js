
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SCHEMA = `{
  "summary": "2-3 sentence overview of the trip",
  "budgetVerdict": "Is the budget realistic? One sentence",
  "budgetBreakdown": {
    "transport": 0,
    "stay": 0,
    "food": 0,
    "activities": 0,
    "misc": 0
  },
  "transport": [
    {
      "mode": "Train",
      "name": "Transport service name",
      "number": "",
      "departure": "HH:MM",
      "arrival": "HH:MM",
      "duration": "6h 30m",
      "farePerPerson": 0,
      "notes": "Details and verification status"
    }
  ],
  "hotels": [
    {
      "name": "",
      "area": "",
      "pricePerNight": 0,
      "rating": 0,
      "highlight": ""
    }
  ],
  "restaurants": [
    {
      "name": "",
      "cuisine": "",
      "mustTry": "",
      "priceForTwo": 0,
      "area": ""
    }
  ],
  "spots": [
    {
      "name": "",
      "type": "",
      "description": "",
      "hidden": false,
      "bestTime": "",
      "entryFee": "free or amount"
    }
  ],
  "itinerary": [
    {
      "day": 1,
      "title": "",
      "morning": "",
      "afternoon": "",
      "evening": "",
      "estCost": 0
    }
  ],
  "tips": ["Short practical tip"]
}`;

function isObject(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value);
}

function validatePlan(plan, days) {
  if (!isObject(plan)) {
    return 'The response must be a JSON object.';
  }

  const requiredArrays = [
    'transport',
    'hotels',
    'restaurants',
    'spots',
    'itinerary',
    'tips'
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(plan[key])) {
      return `Missing or invalid array: ${key}`;
    }
  }

  if (
    typeof plan.summary !== 'string' ||
    typeof plan.budgetVerdict !== 'string'
  ) {
    return 'Missing summary or budget verdict.';
  }

  if (!isObject(plan.budgetBreakdown)) {
    return 'Missing or invalid budget breakdown.';
  }

  const budgetKeys = [
    'transport',
    'stay',
    'food',
    'activities',
    'misc'
  ];

  for (const key of budgetKeys) {
    if (
      typeof plan.budgetBreakdown[key] !== 'number' ||
      !Number.isFinite(plan.budgetBreakdown[key]) ||
      plan.budgetBreakdown[key] < 0
    ) {
      return `Invalid budgetBreakdown.${key}`;
    }
  }

  if (plan.itinerary.length !== days) {
    return `Expected ${days} itinerary days, received ${plan.itinerary.length}.`;
  }

  for (const [index, day] of plan.itinerary.entries()) {
    if (!isObject(day)) {
      return `Invalid itinerary entry at index ${index}.`;
    }

    if (
      typeof day.morning !== 'string' ||
      typeof day.afternoon !== 'string' ||
      typeof day.evening !== 'string' ||
      typeof day.estCost !== 'number' ||
      !Number.isFinite(day.estCost) ||
      day.estCost < 0
    ) {
      return `Invalid itinerary details for day ${index + 1}.`;
    }
  }

  return null;
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MODEL
  });
});

app.post('/api/plan', async (req, res) => {
  const { source, destination, days, persons, budget } = req.body || {};

  if (
    typeof source !== 'string' ||
    typeof destination !== 'string' ||
    !source.trim() ||
    !destination.trim() ||
    source.length > 150 ||
    destination.length > 150
  ) {
    return res.status(400).json({
      error: 'Please enter a valid source and destination.'
    });
  }

  const numberOfDays = Number(days);
  const numberOfPersons = Number(persons);
  const totalBudget = Number(budget);

  if (
    !Number.isInteger(numberOfDays) ||
    numberOfDays < 1 ||
    numberOfDays > 14 ||
    !Number.isInteger(numberOfPersons) ||
    numberOfPersons < 1 ||
    numberOfPersons > 50 ||
    !Number.isFinite(totalBudget) ||
    totalBudget <= 0 ||
    totalBudget > 100000000
  ) {
    return res.status(400).json({
      error: 'Days must be 1-14, travellers 1-50, and budget must be positive.'
    });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is missing. Add it to your .env file and restart the server.'
    });
  }

  const prompt = `
Create a practical India-focused travel plan.

From: ${source.trim()}
To: ${destination.trim()}
Days: ${numberOfDays}
Travellers: ${numberOfPersons}
Total budget: INR ${totalBudget} for all travellers for the whole trip.

Return one JSON object matching this structure:
${SCHEMA}

Requirements:
- Include 3-5 transport options where relevant.
- Include exactly 10 hotel suggestions.
- Include 8 restaurant suggestions.
- Include 8-10 tourist spots, with at least 4 lesser-known places if reliable options exist.
- Include exactly ${numberOfDays} itinerary entries numbered from 1 to ${numberOfDays}.
- Each itinerary day must include morning, afternoon and evening activities.
- All costs must be numeric INR amounts, not strings.
- budgetBreakdown must contain transport, stay, food, activities and misc.
- Estimate costs for the entire group unless a field explicitly says per person.
- transport.farePerPerson must be a per-person fare.
- hotel pricePerNight must be for the group's required rooms.
- Use empty strings or reasonable numeric defaults when details are unknown.
- Do not invent train numbers, departure times, ratings, prices or review counts.
- If live information cannot be verified, clearly say so in the relevant notes.
- Do not claim you searched the web or verified live information unless you actually did.
- Return JSON only. No Markdown, comments or text outside the JSON object.
`;

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 90000);

    let response;

    try {
      response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.2,
            max_completion_tokens: 12000,
            response_format: {
              type: 'json_object'
            },
            messages: [
              {
                role: 'system',
                content:
                  'You are VoyageBuddy, an Indian travel-planning assistant. Return a single valid JSON object. Never invent live transport schedules or claim unverified details are confirmed.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        'Groq API error:',
        response.status,
        data.error?.message || 'Unknown API error'
      );

      return res.status(502).json({
        error:
          data.error?.message ||
          `The AI provider returned HTTP ${response.status}. Check the model ID and API limits.`
      });
    }

    const choice = data.choices?.[0];
    const text = choice?.message?.content;

    if (typeof text !== 'string' || !text.trim()) {
      console.error('Empty AI response:', JSON.stringify(data).slice(0, 1500));

      return res.status(502).json({
        error: 'The AI returned an empty response. Please try again.'
      });
    }

    if (choice.finish_reason === 'length') {
      console.error('AI response was truncated.');

      return res.status(502).json({
        error: 'The plan was too long for one response. Try fewer travel days.'
      });
    }

    let plan;

    try {
      // JSON mode should return JSON directly.
      // Do not slice from the first { to the last }.
      plan = JSON.parse(text);
    } catch (parseError) {
      console.error('Invalid JSON from Groq:', parseError.message);
      console.error('Response excerpt:', text.slice(0, 1200));

      return res.status(502).json({
        error: 'The AI returned invalid JSON. Please try again.'
      });
    }

    const validationError = validatePlan(plan, numberOfDays);

    if (validationError) {
      console.error('Invalid travel plan:', validationError);

      return res.status(502).json({
        error: 'The AI returned an incomplete travel plan. Please try again.'
      });
    }

    return res.json(plan);
  } catch (error) {
    console.error('Plan generation failed:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'The plan generation timed out. Please try again.'
      });
    }

    return res.status(500).json({
      error: 'Could not build the plan. Check your server connection and try again.'
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`VoyageBuddy running at http://localhost:${PORT}`);
  console.log(`Using Groq model: ${MODEL}`);
});
