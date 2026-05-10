const express = require("express");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai");

// =====================
// Validation: التحقق من الـ API Key قبل أي حاجة
// =====================
if (!process.env.OPENROUTER_API_KEY) {
  console.error("❌ خطأ: OPENROUTER_API_KEY مش موجود في .env");
  console.error("   افتح ملف .env وحط الـ API Key بتاعك");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// =====================
// Middleware
// =====================
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Logger بسيط
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =====================
// OpenRouter Client
// =====================
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// =====================
// Helper: تحليل المحتوى (مشترك بين النص والـ PDF)
// =====================
async function analyzeContent(text) {
  const systemPrompt = `أنت معلم متخصص في إنشاء ملاحظات دراسية ذكية.
حلل النص التالي وأرجع JSON فقط بالشكل ده بالظبط بدون أي كلام خارج الـ JSON:
{
  "summary": "تلخيص النص في 3-4 جمل واضحة",
  "keyPoints": ["نقطة مهمة 1", "نقطة مهمة 2", "نقطة مهمة 3", "نقطة مهمة 4", "نقطة مهمة 5"],
  "mindMap": [
    {
      "label": "الموضوع الرئيسي",
      "children": [
        { "label": "فكرة فرعية 1", "children": ["تفصيل أ", "تفصيل ب"] },
        { "label": "فكرة فرعية 2", "children": ["تفصيل أ"] }
      ]
    }
  ],
  "questions": [
    { "q": "سؤال مراجعة 1؟", "a": "الإجابة" },
    { "q": "سؤال مراجعة 2؟", "a": "الإجابة" },
    { "q": "سؤال مراجعة 3؟", "a": "الإجابة" }
  ]
}`;

  const aiResponse = await askAI(systemPrompt, text);

  try {
    const clean = aiResponse.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { raw: aiResponse };
  }
}


async function askAI(systemPrompt, userMessage) {
  const response = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

// =====================
// Analyze Text Endpoint (Smart Notes - textarea)
// =====================
app.post("/analyze-text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return res.status(400).json({ error: "النص قصير جداً أو فاضي" });
    }
    if (text.length > 10000) {
      return res.status(400).json({ error: "النص طويل جداً (أقصاه 10,000 حرف)" });
    }

    const result = await analyzeContent(text.trim());
    res.json({ result });
  } catch (err) {
    console.error("Analyze text error:", err.message);
    res.status(500).json({ error: "فشل التحليل، حاول مرة ثانية" });
  }
});


app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "EduVision AI Server 🚀",
    version: "2.0",
    endpoints: ["/chat", "/analyze-text"],
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Validation
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "الرسالة مش موجودة أو غلط نوعها" });
    }
    if (message.trim().length === 0) {
      return res.status(400).json({ error: "الرسالة فاضية" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "الرسالة طويلة جداً (أقصاها 2000 حرف)" });
    }

    const systemPrompt = `أنت معلم ذكي ومتخصص في مساعدة الطلاب.
قواعد الإجابة:
- اشرح بشكل بسيط وواضح مناسب لطالب في المرحلة الثانوية أو الجامعية
- لو السؤال علمي، ابدأ بتعريف قصير ثم الشرح
- استخدم أمثلة عملية من الحياة اليومية
- لو السؤال رياضيات، اشرح الخطوات بالتسلسل
- اكتب بالعربي لو السؤال بالعربي، وبالإنجليزي لو السؤال بالإنجليزي
- كن ودوداً ومشجعاً
- الإجابة في 3-5 أسطر كحد أقصى ما لم يطلب تفصيل أكثر`;

    const reply = await askAI(systemPrompt, message.trim());
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "حصل خطأ في الـ AI، حاول تاني" });
  }
});

// =====================
// Error Handler العام
// =====================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "خطأ داخلي في السيرفر" });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "الـ endpoint ده مش موجود" });
});

// =====================
// Start Server
// =====================
app.listen(PORT, () => {
  console.log(`\n✅ EduVision AI Server شغّال على port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`🤖 OpenRouter API Key: ${process.env.OPENROUTER_API_KEY.slice(0, 8)}...`);
  console.log("━".repeat(40) + "\n");
});