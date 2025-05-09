// server/routes/ytdStats.js
const express = require('express');
const router = express.Router();
const SalesLog = require('../models/SalesLog');

// Define auth middleware functions directly in this file
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log('User not authenticated, denying access.');
  res.status(401).json({ message: 'Unauthorized: You must be logged in.' });
};

const ensureManager = (req, res, next) => {
  if (req.isAuthenticated()) {
    if (req.user?.role === 'manager') {
      return next();
    }
    console.log('Manager Access Denied: User', req.user?.email?.i);
    return res.status(403).json({ message: 'Unauthorized: Manager access required.' });
  }
  return res.status(401).json({ message: 'Unauthorized: You must be logged in.' });
};

// For testing only - remove in production
router.get('/stats-test', async (req, res) => {
  try {
    // Return sample data for testing
    const ytdStats = {
      leads: {
        warm: 5,
        selfGen: 10,
        total: 15
      },
      status: {
        lost: 3,
        pending: 7,
        sold: 5
      },
      sales: {
        totalBidAmount: 100000,
        totalSoldAmount: 50000,
        avgSoldAmount: 10000,
        closingRate: 33.3,
        dollarClosingRate: 50
      },
      salesProcess: {
        ghosted: 2,
        mcOnly: 3,
        mcAndDemo: 4,
        separateMcAndDemo: 2,
        emailedProposal: 4
      },
      pmPerformance: [
        {
          pmName: "Test PM",
          totalLeads: 10,
          warmLeads: 5,
          selfGenLeads: 5,
          soldCount: 3,
          totalSold: 30000,
          closingRate: 30,
          avgSoldAmount: 10000
        }
      ],
      monthlyTrends: [
        {
          _id: { month: 5, year: 2025 },
          leads: 10,
          sold: 3,
          revenue: 30000
        }
      ]
    };
    
    return res.json(ytdStats);
  } catch (err) {
    console.error('Error in test route:', err);
    return res.status(500).json({ error: 'Server error in test route' });
  }
});

// Get YTD stats - protected by auth and manager role
router.get('/stats', ensureAuthenticated, ensureManager, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1); // January 1st of current year
    
    // Base query for the current year
    const yearQuery = {
      createdAt: { $gte: startOfYear }
    };
    
    // Get all sales logs for this year
    const allYearLogs = await SalesLog.find(yearQuery);
    
    // Calculate YTD metrics
    const ytdStats = {
      leads: {
        warm: 0,
        selfGen: 0,
        total: 0
      },
      status: {
        lost: 0,
        pending: 0,
        sold: 0
      },
      sales: {
        totalBidAmount: 0,
        totalSoldAmount: 0,
        avgSoldAmount: 0,
        closingRate: 0,
        dollarClosingRate: 0
      },
      salesProcess: {
        ghosted: 0,
        mcOnly: 0,
        mcAndDemo: 0,
        separateMcAndDemo: 0,
        emailedProposal: 0
      },
      pmPerformance: [] // Will be populated with per-PM stats
    };
    
    // Process all logs to calculate metrics
    allYearLogs.forEach(log => {
      // Count leads by type
      if (log.leadType === 'Warm') ytdStats.leads.warm++;
      if (log.leadType === 'SelfGen') ytdStats.leads.selfGen++;
      
      // Count by status
      if (log.results.status === 'Lost') ytdStats.status.lost++;
      if (log.results.status === 'Pending') ytdStats.status.pending++;
      if (log.results.status === 'Sold') ytdStats.status.sold++;
      
      // Sales totals
      ytdStats.sales.totalBidAmount += log.results.bidAmount || 0;
      if (log.results.status === 'Sold') {
        ytdStats.sales.totalSoldAmount += log.results.soldAmount || 0;
      }
      
      // Sales process counts
      if (log.salesProcess.isGhosted) ytdStats.salesProcess.ghosted++;
      if (log.salesProcess.mcOnly) ytdStats.salesProcess.mcOnly++;
      if (log.salesProcess.mcAndDemo) ytdStats.salesProcess.mcAndDemo++;
      if (log.salesProcess.sepMcAndDemo) ytdStats.salesProcess.separateMcAndDemo++;
      if (log.salesProcess.emailedProposal) ytdStats.salesProcess.emailedProposal++;
    });
    
    // Calculate totals and rates
    ytdStats.leads.total = ytdStats.leads.warm + ytdStats.leads.selfGen;
    ytdStats.sales.closingRate = ytdStats.leads.total > 0 
      ? (ytdStats.status.sold / ytdStats.leads.total) * 100 
      : 0;
    ytdStats.sales.avgSoldAmount = ytdStats.status.sold > 0 
      ? ytdStats.sales.totalSoldAmount / ytdStats.status.sold 
      : 0;
    ytdStats.sales.dollarClosingRate = ytdStats.sales.totalBidAmount > 0 
      ? (ytdStats.sales.totalSoldAmount / ytdStats.sales.totalBidAmount) * 100 
      : 0;
    
    // Get PM-specific stats (grouped by PM name)
    const pmGroups = await SalesLog.aggregate([
      { $match: yearQuery },
      { $group: {
          _id: "$pmName",
          totalLeads: { $sum: 1 },
          warmLeads: { 
            $sum: { $cond: [{ $eq: ["$leadType", "Warm"] }, 1, 0] }
          },
          selfGenLeads: { 
            $sum: { $cond: [{ $eq: ["$leadType", "SelfGen"] }, 1, 0] }
          },
          soldCount: { 
            $sum: { $cond: [{ $eq: ["$results.status", "Sold"] }, 1, 0] }
          },
          totalSold: { 
            $sum: { $cond: [{ $eq: ["$results.status", "Sold"] }, "$results.soldAmount", 0] }
          },
          totalBid: { $sum: "$results.bidAmount" }
        }
      },
      { $project: {
          _id: 0,
          pmName: "$_id",
          totalLeads: 1,
          warmLeads: 1,
          selfGenLeads: 1,
          soldCount: 1,
          totalSold: 1,
          totalBid: 1,
          closingRate: { 
            $cond: [
              { $gt: ["$totalLeads", 0] },
              { $multiply: [{ $divide: ["$soldCount", "$totalLeads"] }, 100] },
              0
            ]
          },
          avgSoldAmount: { 
            $cond: [
              { $gt: ["$soldCount", 0] },
              { $divide: ["$totalSold", "$soldCount"] },
              0
            ]
          },
          dollarClosingRate: { 
            $cond: [
              { $gt: ["$totalBid", 0] },
              { $multiply: [{ $divide: ["$totalSold", "$totalBid"] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { totalSold: -1 } }
    ]);
    
    ytdStats.pmPerformance = pmGroups;
    
    // Get monthly trends
    const monthlyTrends = await SalesLog.aggregate([
      { $match: yearQuery },
      { $group: {
          _id: { 
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          leads: { $sum: 1 },
          sold: { 
            $sum: { $cond: [{ $eq: ["$results.status", "Sold"] }, 1, 0] }
          },
          revenue: { 
            $sum: { $cond: [{ $eq: ["$results.status", "Sold"] }, "$results.soldAmount", 0] }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    ytdStats.monthlyTrends = monthlyTrends;
    
    return res.json(ytdStats);
    
  } catch (err) {
    console.error('Error fetching YTD stats:', err);
    return res.status(500).json({ error: 'Server error fetching YTD stats' });
  }
});

// Get all leads with next steps information
router.get('/leads-with-next-steps', ensureAuthenticated, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1); // January 1st of current year
    
    // Base query for the current year
    const yearQuery = {
      createdAt: { $gte: startOfYear }
    };
    
    // If not a manager, only show leads assigned to this user
    const loggedInUser = req.user;
    const loggedInUserId = loggedInUser?.email?.i;
    const loggedInUserRole = loggedInUser?.role;
    
    if (loggedInUserRole !== 'manager') {
      yearQuery.assignedUserId = loggedInUserId;
    }
    
    // Get leads with status not equal to "Lost" or "Sold" (active leads)
    yearQuery['results.status'] = { $nin: ['Lost', 'Sold'] };
    
    // Find leads and sort by nextFollowUpDate
    const activeLeads = await SalesLog.find(yearQuery)
      .sort({ nextFollowUpDate: 1 })
      .lean();
    
    // Generate next steps for each lead
    const leadsWithNextSteps = activeLeads.map(lead => {
      // Determine where in the sales process this lead is
      let nextStep = '';
      let priority = 0;
      
      // Calculate days until next follow-up
      const today = new Date();
      const nextFollowUp = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
      const daysUntilFollowUp = nextFollowUp ? 
        Math.ceil((nextFollowUp - today) / (1000 * 60 * 60 * 24)) : null;
      
      // Set next steps and priority based on sales process
      if (!lead.salesProcess.mcOnly && !lead.salesProcess.mcAndDemo) {
        nextStep = 'Schedule Measurement Call';
        priority = 5;
      } else if (lead.salesProcess.mcOnly && !lead.salesProcess.mcAndDemo) {
        nextStep = 'Schedule Demo';
        priority = 4;
      } else if (lead.salesProcess.mcAndDemo && !lead.salesProcess.emailedProposal) {
        nextStep = 'Email Proposal';
        priority = 3;
      } else if (lead.salesProcess.emailedProposal && !lead.results.status) {
        nextStep = 'Follow-up on Proposal';
        priority = 2;
      } else {
        nextStep = 'General Follow-up';
        priority = 1;
      }
      
      // Increase priority if follow-up date is today or in the past
      if (daysUntilFollowUp !== null && daysUntilFollowUp <= 0) {
        priority += 3;
      } else if (daysUntilFollowUp !== null && daysUntilFollowUp <= 2) {
        priority += 2;
      }
      
      return {
        ...lead,
        nextStep,
        priority,
        daysUntilFollowUp,
        isOverdue: daysUntilFollowUp !== null && daysUntilFollowUp < 0
      };
    });
    
    // Sort by priority (highest first)
    leadsWithNextSteps.sort((a, b) => b.priority - a.priority);
    
    return res.json({
      leads: leadsWithNextSteps,
      total: leadsWithNextSteps.length
    });
    
  } catch (err) {
    console.error('Error fetching leads with next steps:', err);
    return res.status(500).json({ error: 'Server error fetching leads data' });
  }
});

module.exports = router;