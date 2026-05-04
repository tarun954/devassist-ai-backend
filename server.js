import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

import { connectDB } from "./config/db.js";
import Analysis from "./models/Analysis.js";

dotenv.config();

const app = express();

connectDB();

const allowedOrigins = [
  "http://localhost:5173",
  "https://devassist-ai-frontend.vercel.app",
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS not allowed for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

function cleanAiText(text) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: "AI returned a response, but it was not valid JSON.",
      rawResponse: text,
    };
  }
}

function handleApiError(error, res) {
  console.error("Groq API error:", error);

  if (error.status === 401 || error.status === 403) {
    return res.status(error.status).json({
      error: "Groq authentication error. Check your GROQ_API_KEY.",
      details: error.message,
    });
  }

  if (error.status === 429) {
    return res.status(429).json({
      error: "Groq rate limit reached.",
      solution: "Wait and retry, or reduce request size.",
      details: error.message,
    });
  }

  if (error.status === 400) {
    return res.status(400).json({
      error: "Bad request to Groq. Check model name or prompt.",
      details: error.message,
    });
  }

  return res.status(500).json({
    error: "AI request failed.",
    details: error.message,
  });
}

async function callGroq(prompt) {
  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a senior software engineer. Always return valid JSON only. Do not use markdown or backticks.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 1400,
  });

  return completion.choices[0]?.message?.content || "";
}

app.get("/", (req, res) => {
  res.json({
    message: "DevAssist AI Backend is running with Groq",
    model,
  });
});

app.post("/api/analyze-log", async (req, res) => {
  try {
    const { logText } = req.body;

    if (!logText || logText.trim().length < 10) {
      return res.status(400).json({
        error: "Please provide valid log text.",
      });
    }

    const prompt = `
Analyze the following application logs.

Return ONLY valid JSON with this exact structure:

{
  "summary": "short summary of the issue",
  "severity": "Low | Medium | High | Critical",
  "rootCause": "main reason for the error",
  "errorType": "category of error",
  "possibleFixes": ["fix 1", "fix 2", "fix 3"],
  "recommendedCodeChange": "short technical recommendation",
  "preventionTips": ["tip 1", "tip 2"]
}

Logs:
${logText}
`;

    const aiText = await callGroq(prompt);
    const cleanedText = cleanAiText(aiText);
    const data = safeJsonParse(cleanedText);

    await Analysis.create({
      type: "logs",
      input: logText,
      result: data,
    });

    return res.json(data);
  } catch (error) {
    return handleApiError(error, res);
  }
});

app.post("/api/optimize-api", async (req, res) => {
  try {
    const { apiResponse } = req.body;

    if (!apiResponse || apiResponse.trim().length < 5) {
      return res.status(400).json({
        error: "Please provide a valid API/JSON response.",
      });
    }

    const prompt = `
Analyze and optimize this API/JSON response.

Return ONLY valid JSON with this exact structure:

{
  "summary": "short explanation of API response quality",
  "issuesFound": ["issue 1", "issue 2"],
  "optimizedJson": {},
  "typescriptInterface": "TypeScript interface as plain text",
  "mongodbSchemaSuggestion": "MongoDB schema suggestion as plain text",
  "apiDesignTips": ["tip 1", "tip 2", "tip 3"]
}

API Response:
${apiResponse}
`;

    const aiText = await callGroq(prompt);
    const cleanedText = cleanAiText(aiText);
    const data = safeJsonParse(cleanedText);

    await Analysis.create({
      type: "api",
      input: apiResponse,
      result: data,
    });

    return res.json(data);
  } catch (error) {
    return handleApiError(error, res);
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const history = await Analysis.find().sort({ createdAt: -1 }).limit(20);

    return res.json(history);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch history.",
      details: error.message,
    });
  }
});

app.delete("/api/history", async (req, res) => {
  try {
    await Analysis.deleteMany({});

    return res.json({
      message: "History cleared successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to clear history.",
      details: error.message,
    });
  }
});

app.listen(process.env.PORT || 5001, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 5001}`);
});
