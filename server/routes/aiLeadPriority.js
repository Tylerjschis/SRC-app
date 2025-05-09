/**
 * Simplified AI Lead Prioritization Route for testing
 */

const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
  console.log('Test route hit');
  res.json({ message: 'AI Lead Priority route is working' });
});

// Simplified prioritize route (no authentication, no OpenAI)
router.post('/prioritize', (req, res) => {
  console.log('Prioritize route hit with body:', req.body);
  
  // Return mock data for testing
  const mockLeads = [
    {
      leadId: "12345",
      priorityScore: 9,
      explanation: "High priority lead with recent activity",
      suggestedAction: "Call immediately to follow up"
    },
    {
      leadId: "67890",
      priorityScore: 5,
      explanation: "Medium priority lead with some potential",
      suggestedAction: "Schedule meeting next week"
    },
    {
      leadId: "54321",
      priorityScore: 3,
      explanation: "Lower priority lead, not active recently",
      suggestedAction: "Send follow-up email to gauge interest"
    }
  ];
  
  res.json({ leads: mockLeads, totalCount: mockLeads.length });
});

module.exports = router;