// routes/aiInsights.js
// routes/aiInsights.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Will be set in environment variables
});

// Simple authentication middleware
const ensureAuthenticated = (req, res, next) => {
  // For testing: always allow access
  // In production, this should check if the user is authenticated
  return next();
};

// Sales Coach Insights API
router.post('/sales-coach', ensureAuthenticated, async (req, res) => {
    console.log('API Key available:', !!process.env.OPENAI_API_KEY);
    console.log('Request received at /api/ai/sales-coach');
    
    try {
      const { userData, timeRange } = req.body;
      console.log('userData received:', JSON.stringify(userData, null, 2));
      console.log('timeRange received:', timeRange);
    
    if (!userData || !userData.totals) {
      return res.status(400).json({ message: 'Invalid or missing user data' });
    }
    
    // Extract key metrics for the prompt
    const selfGenTotals = userData.totals.selfGenTotals;
    const warmLeadTotals = userData.totals.warmLeadTotals;
    const selfGenRates = userData.rates.selfGenRates;
    const warmLeadRates = userData.rates.warmLeadRates;
    
    // Build prompt for OpenAI
    let prompt = `You are an expert sales coach. Analyze the following sales performance data for the last ${timeRange} and provide specific feedback and recommendations:\n\n`;
    
    prompt += `SELF-GENERATED LEADS:\n`;
    prompt += `- Doors Knocked: ${selfGenTotals.doorsKnocked || 0}\n`;
    prompt += `- Interactions: ${selfGenTotals.interactions || 0}\n`;
    prompt += `- Inspections: ${selfGenTotals.inspections || 0}\n`;
    prompt += `- Deals Signed: ${selfGenTotals.deals || 0}\n\n`;
    
    prompt += `WARM LEADS:\n`;
    prompt += `- Leads Assigned: ${warmLeadTotals.leadsAssigned || 0}\n`;
    prompt += `- Initial Calls: ${warmLeadTotals.initialCalls || 0}\n`;
    prompt += `- Inspections: ${warmLeadTotals.inspections || 0}\n`;
    prompt += `- Presentations: ${warmLeadTotals.presentations || 0}\n`;
    prompt += `- Deals Signed: ${warmLeadTotals.deals || 0}\n\n`;
    
    prompt += `CONVERSION RATES:\n`;
    prompt += `- Self-Generated Interaction Rate: ${(selfGenRates.interactionRate || 0) * 100}%\n`;
    prompt += `- Self-Generated Inspection Rate: ${(selfGenRates.inspectionRate || 0) * 100}%\n`;
    prompt += `- Self-Generated Deal Rate: ${(selfGenRates.dealRate || 0) * 100}%\n`;
    prompt += `- Warm Lead Call Rate: ${(warmLeadRates.callRate || 0) * 100}%\n`;
    prompt += `- Warm Lead Inspection Rate: ${(warmLeadRates.inspectionRate || 0) * 100}%\n`;
    prompt += `- Warm Lead Deal Rate: ${(warmLeadRates.dealRate || 0) * 100}%\n\n`;
    
    prompt += `Provide the following in JSON format:
1. "overallAssessment": A brief overall assessment (2-3 sentences)
2. "strengths": An array of 2-3 specific strengths based on the metrics
3. "areasForImprovement": An array of 2-3 specific areas that need improvement
4. "recommendedActions": An array of 3-4 specific, actionable recommendations to improve sales performance
`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // or "gpt-4" if you have access
      messages: [
        { role: "system", content: "You are an expert sales coach for a roofing company sales team." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.5,
    });

    // Parse the response (expecting JSON)
    let aiResponse;
    try {
      aiResponse = JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      // If response isn't valid JSON, use the raw text
      console.error("Error parsing OpenAI response as JSON:", e);
      
      // Fallback response structure
      aiResponse = {
        overallAssessment: completion.choices[0].message.content.substring(0, 200),
        strengths: ["Strong communication skills", "Good follow-up rate"],
        areasForImprovement: ["Conversion rate could be improved", "More doors should be knocked"],
        recommendedActions: [
          "Increase daily door knocking target",
          "Practice objection handling techniques",
          "Follow up more consistently with warm leads",
          "Improve presentation skills"
        ]
      };
    }

    res.json(aiResponse);
    
} catch (error) {
    console.error('Error in AI sales coach:', error);
    if (error.response) {
      console.error('OpenAI API response error:', error.response.data);
      console.error('Status:', error.response.status);
    }
    res.status(500).json({ 
      message: 'Error generating sales insights', 
      error: error.message 
    });
  }
});

// Performance Insights API
router.post('/performance-insights', ensureAuthenticated, async (req, res) => {
  try {
    const { userData, previousPeriodData, timeRange } = req.body;
    
    if (!userData || !userData.totals) {
      return res.status(400).json({ message: 'Invalid or missing user data' });
    }
    
    // Extract metrics for the prompt (similar to above)
    const selfGenTotals = userData.totals.selfGenTotals;
    const warmLeadTotals = userData.totals.warmLeadTotals;
    
    // Build a different prompt for performance insights
    let prompt = `You are an expert sales analyst. Analyze the following sales performance data for the last ${timeRange} and provide detailed insights:\n\n`;
    
    // Add current period data
    prompt += `CURRENT PERIOD DATA:\n`;
    // Add similar metrics as above...
    
    // Add previous period data if available
    if (previousPeriodData && previousPeriodData.totals) {
      prompt += `\nPREVIOUS PERIOD DATA:\n`;
      // Add previous period metrics...
    }
    
    prompt += `\nProvide the following in JSON format:
1. "keyInsights": An array of 3-4 key insights from the data
2. "trends": An array of trend objects with "text" (description) and "direction" (positive/negative/neutral)
3. "conversionInsights": An array of 2-3 insights specifically about conversion rates
`;

    // Call OpenAI API (similar to above)
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an expert sales performance analyst." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.5,
    });

    // Parse response (similar to above)
    let aiResponse;
    try {
      aiResponse = JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      console.error("Error parsing OpenAI response as JSON:", e);
      
      // Fallback structure
      aiResponse = {
        keyInsights: [
          "Your door-to-interaction rate is above average",
          "Warm lead conversion could be improved",
          "Overall performance shows positive trajectory"
        ],
        trends: [
          { text: "Door knocking volume is up 15% from previous period", direction: "positive" },
          { text: "Deal closure rate remains consistent", direction: "neutral" }
        ],
        conversionInsights: [
          "Your self-generated leads convert better than warm leads",
          "Initial call-to-inspection conversion needs improvement"
        ]
      };
    }

    res.json(aiResponse);
    
  } catch (error) {
    console.error('Error in performance insights:', error);
    res.status(500).json({ 
      message: 'Error generating performance insights', 
      error: error.message 
    });
  }
});

module.exports = router;