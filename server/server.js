// ==============================================================
//                      IMPORTS
// ==============================================================
require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables FIRST
const mongoose = require('mongoose'); // Import Mongoose
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// Import Google Sheets service (we might phase this out later)
const { appendData, getData, initializeSheetsClient } = require('./services/googleSheetsService');
// *** Import the Mongoose Lead Model ***
const Lead = require('./models/Lead');

// ==============================================================
//                  CONFIGURATION & SETUP
// ==============================================================
const MANAGER_EMAILS = [
    'tyler@shumakerroofing.com', // Example: Ensure your manager emails are here
    // Add other manager emails if needed
];
const app = express();
// Parse JSON middleware - add this right after you create the app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ==============================================================
//                  DATABASE CONNECTION (MongoDB)
// ==============================================================
const connectDB = async () => {
    try {
      if (!process.env.MONGODB_URI) {
          throw new Error('MONGODB_URI not found in .env file');
      }
      
      console.log('Attempting to connect to MongoDB with URI:', 
                  process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//\$1:****@')); // Logs URI with hidden password
                  
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('MongoDB Connected Successfully.');
      return true; // Return true to indicate successful connection
    } catch (err) {
      console.error('MongoDB Connection Error:', err.message);
      if (err.name) console.error('Error name:', err.name);
      if (err.code) console.error('Error code:', err.code);
      if (err.stack) console.error('Error stack:', err.stack);
      return false; // Return false to indicate failed connection
    }
  };
connectDB(); // Connect to MongoDB

// ==============================================================
//                  SESSION CONFIGURATION
// ==============================================================
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        // secure: process.env.NODE_ENV === 'production', // Enable in production with HTTPS
    }
}));

// ==============================================================
//                  PASSPORT CONFIGURATION
// ==============================================================
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.SERVER_BASE_URL}/auth/google/callback`
  },
  (accessToken, refreshToken, profile, done) => {
    const userEmail = profile.emails?.[0]?.value;
    const userRole = MANAGER_EMAILS.some(managerEmail => managerEmail.toLowerCase() === userEmail?.toLowerCase())
                     ? 'manager'
                     : 'salesperson';
    const userProfile = { ...profile, role: userRole };
    console.log('Google Profile Received:', profile.displayName, 'Assigned Role:', userRole);
    return done(null, userProfile);
  }
));

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user.displayName || user.id, 'Role:', user.role);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log('Deserializing user:', user.displayName || user.id, 'Role:', user.role);
  done(null, user);
});

// ==============================================================
//                  CORE MIDDLEWARE
// ==============================================================




app.use(cors({
    origin: process.env.CLIENT_BASE_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// Middleware Logger
app.use((req, res, next) => {
    console.log(`Request Received: ${req.method} ${req.path}`);
    next();
});

// ==============================================================
//                  HELPER FUNCTIONS
// ==============================================================
const safeDivide = (numerator, denominator) => { /* ... same as before ... */
    const num = parseFloat(numerator);
    const den = parseFloat(denominator);
    if (isNaN(num) || isNaN(den) || den === 0) return 0;
    return num / den;
};
function ensureAuthenticated(req, res, next) { /* ... same as before ... */
  if (req.isAuthenticated()) {
    console.log(`User Authenticated: ${req.user?.emails?.[0]?.value || req.user?.id} (Role: ${req.user?.role})`);
    return next();
  }
  console.log('User not authenticated, denying access.');
  res.status(401).json({ message: 'Unauthorized: You must be logged in.' });
}
function ensureManager(req, res, next) { /* ... same as before ... */
    if (!req.isAuthenticated()) {
         console.log('Manager Check Failed: User not authenticated.');
         return res.status(401).json({ message: 'Unauthorized: You must be logged in.' });
    }
    if (req.user?.role === 'manager') {
        console.log(`Manager Access Granted: ${req.user?.emails?.[0]?.value}`);
        return next();
    }
    console.log(`Manager Access Denied: User ${req.user?.emails?.[0]?.value} is not a manager.`);
    res.status(403).json({ message: 'Forbidden: Manager access required.' });
}

// ==============================================================
//                  AUTHENTICATION ROUTES
// ==============================================================
// ... (Auth routes /auth/google, /auth/google/callback, /auth/user, /auth/logout remain the same) ...
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: `${process.env.CLIENT_BASE_URL}/login?error=true` }), (req, res) => { res.redirect(`${process.env.CLIENT_BASE_URL}/dashboard`); });
app.get('/auth/user', (req, res) => { /* ... same as before ... */
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: { id: req.user.id, displayName: req.user.displayName, email: req.user.emails?.[0]?.value, photo: req.user.photos?.[0]?.value, role: req.user.role } });
    } else {
        res.json({ loggedIn: false, user: null });
    }
});
app.get('/auth/logout', (req, res, next) => { /* ... same as before ... */
    req.logout((err) => { if (err) { return next(err); } req.session.destroy((err) => { if (err) { console.error("Error destroying session:", err); } res.clearCookie('connect.sid'); console.log('User logged out, session destroyed.'); res.status(200).json({ message: "Logged out successfully." }); }); });
});


// ==============================================================
//      API ROUTES (KPI - Still using Google Sheets for now)
// ==============================================================
app.post('/api/kpi', ensureAuthenticated, async (req, res) => { /* ... existing sheets code ... */
    const userId = req.user?.emails?.[0]?.value;
    if (!userId) return res.status(401).json({ message: 'User email not found in session.' });
    console.log(`Saving KPI data for user: ${userId}`); console.log('Received KPI data:', req.body);
    const { entryDate, doorsKnocked, flyersLeftBehind, interactionsSelfGen, inspectionsRanSelfGen, dealsSignedSelfGen, leadsAssigned, initialCallsMade, inspectionsRanWarmLead, presentationsMadeWarmLead, followUpsPostPresentation, dealsSignedWarmLead, notes } = req.body;
    if (!entryDate) return res.status(400).json({ message: 'Entry date is required.' });
    const newRow = [ userId, entryDate, '', '', doorsKnocked || 0, flyersLeftBehind || 0, interactionsSelfGen || 0, inspectionsRanSelfGen || 0, dealsSignedSelfGen || 0, leadsAssigned || 0, initialCallsMade || 0, inspectionsRanWarmLead || 0, presentationsMadeWarmLead || 0, followUpsPostPresentation || 0, dealsSignedWarmLead || 0, notes || '' ];
    try { const sheetName = 'daily tracker'; const range = `${sheetName}!A1`; const result = await appendData(range, [newRow]); res.status(201).json({ message: 'KPI data saved successfully!', data: result }); } catch (error) { console.error('Error saving KPI data to Google Sheets:', error); res.status(500).json({ message: 'Failed to save KPI data.', error: error.message }); }
});
app.get('/api/kpi', ensureAuthenticated, async (req, res) => { /* ... existing sheets code with manager logic ... */
    const loggedInUser = req.user; const loggedInUserId = loggedInUser?.emails?.[0]?.value; const loggedInUserRole = loggedInUser?.role; if (!loggedInUserId) return res.status(401).json({ message: 'User email not found in session.' }); const targetUserIdQuery = req.query.targetUserId; const { startDate, endDate } = req.query; if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate query parameters are required.' }); let userIdToFetch = loggedInUserId; if (loggedInUserRole === 'manager' && targetUserIdQuery && targetUserIdQuery !== loggedInUserId) { userIdToFetch = targetUserIdQuery; console.log(`Manager ${loggedInUserId} requesting data for target user: ${userIdToFetch}`); } else { userIdToFetch = loggedInUserId; console.log(`User ${loggedInUserId} requesting own data.`); } console.log(`Fetching KPI data for user: ${userIdToFetch} from ${startDate} to ${endDate}`);
    try { const sheetName = 'daily tracker'; const readRange = `${sheetName}!A:P`; const allData = await getData(readRange); if (!allData || allData.length <= 1) { console.log('No data found in sheet or only header row exists.'); return res.status(200).json({ message: 'No data found for the period.', data: { startDate, endDate, userId: userIdToFetch, rowCount: 0, totals: { selfGenTotals: {}, warmLeadTotals: {} }, rates: { selfGenRates: {}, warmLeadRates: {} } } }); }
    console.log(`Filtering ${allData.length - 1} rows...`); const filteredData = allData.slice(1).filter(row => { const rowUserId = row?.[0]; const rowDate = row?.[1]; return rowDate && rowUserId && rowDate >= startDate && rowDate <= endDate && rowUserId.toLowerCase() === userIdToFetch.toLowerCase(); }); console.log(`Found ${filteredData.length} matching rows for user ${userIdToFetch}.`);
    const COL_IDX = { DK: 4, FLB: 5, INT_SG: 6, INSP_SG: 7, DEAL_SG: 8, LA: 9, IC: 10, INSP_WL: 11, PRES_WL: 12, FU: 13, DEAL_WL: 14 }; let selfGenTotals = { doorsKnocked: 0, interactions: 0, inspections: 0, deals: 0, flyersLeftBehind: 0 }; let warmLeadTotals = { leadsAssigned: 0, initialCalls: 0, inspections: 0, presentations: 0, followUps: 0, deals: 0 }; filteredData.forEach(row => { const parseNum = (index) => parseInt(row?.[index], 10) || 0; selfGenTotals.doorsKnocked += parseNum(COL_IDX.DK); selfGenTotals.flyersLeftBehind += parseNum(COL_IDX.FLB); selfGenTotals.interactions += parseNum(COL_IDX.INT_SG); selfGenTotals.inspections += parseNum(COL_IDX.INSP_SG); selfGenTotals.deals += parseNum(COL_IDX.DEAL_SG); warmLeadTotals.leadsAssigned += parseNum(COL_IDX.LA); warmLeadTotals.initialCalls += parseNum(COL_IDX.IC); warmLeadTotals.inspections += parseNum(COL_IDX.INSP_WL); warmLeadTotals.presentations += parseNum(COL_IDX.PRES_WL); warmLeadTotals.followUps += parseNum(COL_IDX.FU); warmLeadTotals.deals += parseNum(COL_IDX.DEAL_WL); }); console.log("Calculated Totals:", { selfGenTotals, warmLeadTotals });
    const selfGenRates = { interactionRate: safeDivide(selfGenTotals.interactions, selfGenTotals.doorsKnocked), inspectionRate: safeDivide(selfGenTotals.inspections, selfGenTotals.interactions), dealRate: safeDivide(selfGenTotals.deals, selfGenTotals.inspections), overallDoorsPerDeal: safeDivide(selfGenTotals.doorsKnocked, selfGenTotals.deals) }; const warmLeadRates = { callRate: safeDivide(warmLeadTotals.initialCalls, warmLeadTotals.leadsAssigned), inspectionRate: safeDivide(warmLeadTotals.inspections, warmLeadTotals.initialCalls), presentationRate: safeDivide(warmLeadTotals.presentations, warmLeadTotals.inspections), dealRate: safeDivide(warmLeadTotals.deals, warmLeadTotals.presentations), overallLeadsPerDeal: safeDivide(warmLeadTotals.leadsAssigned, warmLeadTotals.deals) }; console.log("Calculated Rates:", { selfGenRates, warmLeadRates });
    res.status(200).json({ message: 'KPI data fetched successfully!', data: { startDate, endDate, userId: userIdToFetch, rowCount: filteredData.length, totals: { selfGenTotals, warmLeadTotals }, rates: { selfGenRates, warmLeadRates } } });
    } catch (error) { console.error('Error fetching/calculating KPI data:', error); res.status(500).json({ message: 'Failed to fetch KPI data.', error: error.message }); }
});
app.get('/api/users', ensureAuthenticated, ensureManager, async (req, res) => { /* ... existing sheets code ... */
    console.log(`Manager ${req.user?.emails?.[0]?.value} requesting user list.`); try { const sheetName = 'daily tracker'; const range = `${sheetName}!A2:A`; const data = await getData(range); if (!data) return res.status(200).json({ users: [] }); const emails = [...new Set( data.flat().filter(email => email && typeof email === 'string' && email.includes('@')).map(email => email.toLowerCase()) )]; console.log(`Found users: ${emails.join(', ')}`); res.status(200).json({ users: emails.sort() }); } catch (error) { console.error('Error fetching user list:', error); res.status(500).json({ message: 'Failed to fetch user list.', error: error.message }); }
});

// ==============================================================
//                  NEW API ROUTES (MongoDB - For Leads)
// ==============================================================
// ==============================================================
//                  NEW API ROUTES (MongoDB - For Leads)
// ==============================================================

// ==============================================================
//                  NEW API ROUTES (MongoDB - For Leads)
// ==============================================================
// Import the AI insights routes
const aiInsightsRoutes = require('./routes/aiInsights');

// Use the routes
app.use('/api/ai', aiInsightsRoutes);
// --- POST /api/leads - Create a new lead ---

// Add this near the end of your server.js file, before app.listen()
app.post('/api/ai/leads/prioritize', (req, res) => {
    console.log('Direct route hit with body:', req.body);
    
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



app.post('/api/leads', ensureAuthenticated, async (req, res) => {
    const assignedUserId = req.user?.emails?.[0]?.value; // Get logged-in user's email
    if (!assignedUserId) {
        return res.status(401).json({ message: 'User email not found in session.' });
    }
    
    // Extract lead data from request body
    const {
        name, email, phone, address, status, source, nextFollowUpDate, initialNote
    } = req.body;


// Test route - Add this near the end of your file, before app.listen()
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is working' });
  });
  
  // Test the specific route we're having trouble with
  app.post('/api/ai/leads/prioritize-test', (req, res) => {
    console.log('Test priority route hit with body:', req.body);
    res.json({ message: 'Priority test working', body: req.body });
  });


// Import the AI lead prioritization routes
const aiLeadPriorityRoutes = require('./aiLeadPriority');

// Set up AI lead prioritization routes
app.use('/api/ai/leads', aiLeadPriorityRoutes);

    // Basic validation (Mongoose schema validation will also apply)
    if (!name) {
        return res.status(400).json({ message: 'Lead name is required.' });
    }

    console.log(`Attempting to create lead for user: ${assignedUserId}`);

    try {
        // Prepare lead data, including the assigned user ID
        const leadData = {
            name,
            email, // email will be lowercased by schema
            phone,
            address, // address should be an object { street, city, state, zip } or undefined
            status: status || 'New', // Default to 'New' if not provided
            source,
            assignedUserId, // Assign to the logged-in user
            // Parse date string into Date object if provided, otherwise null
            nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
            followUpNotes: [] // Initialize notes array
        };

        // Add initial note if provided
        if (initialNote && typeof initialNote === 'string' && initialNote.trim() !== '') {
            leadData.followUpNotes.push({
                note: initialNote.trim(),
                userId: assignedUserId
                // date defaults to now via schema
            });
        }

const ytdStatsRoutes = require('./server/routes/ytdStats');
app.use('/api/ytd', ytdStatsRoutes);



        // Create a new Lead document using the Mongoose model
        const newLead = new Lead(leadData);

        // Save the new lead to the database
        const savedLead = await newLead.save();

        console.log('Lead created successfully:', savedLead._id);
        // Send back the created lead data with a 201 status
        res.status(201).json({ message: 'Lead created successfully!', lead: savedLead });

    } catch (error) {
        console.error('Error creating lead:', error);
        // Handle potential validation errors from Mongoose
        if (error.name === 'ValidationError') {
            // Extract validation messages
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: 'Validation failed.', errors: messages });
        }
        // Handle other potential errors (e.g., database connection issue)
        res.status(500).json({ message: 'Failed to create lead.', error: error.message });
    }
});

// --- GET /api/leads - Get all leads for the current user (or all for managers) ---
app.get('/api/leads', ensureAuthenticated, async (req, res) => {
    console.log('GET /api/leads endpoint hit');
    const loggedInUser = req.user;
    const loggedInUserId = loggedInUser?.emails?.[0]?.value;
    const loggedInUserRole = loggedInUser?.role;
    
    if (!loggedInUserId) {
        return res.status(401).json({ message: 'User email not found in session.' });
    }
    
    try {
        let query = {};
        
        // If not a manager, only show leads assigned to this user
        if (loggedInUserRole !== 'manager') {
            query.assignedUserId = loggedInUserId;
        }
        
        console.log('Fetching leads with query:', query);
        const leads = await Lead.find(query).sort({ createdAt: -1 });
        console.log(`Found ${leads.length} leads`);
        
        res.status(200).json({ 
            message: 'Leads fetched successfully',
            count: leads.length,
            data: leads
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
    }
});

// --- GET /api/leads/:id - Get a specific lead ---
app.get('/api/leads/:id', ensureAuthenticated, async (req, res) => {
    const leadId = req.params.id;
    console.log('GET specific lead endpoint hit. Lead ID:', leadId);
    
    const loggedInUser = req.user;
    const loggedInUserId = loggedInUser?.emails?.[0]?.value;
    const loggedInUserRole = loggedInUser?.role;
    
    if (!leadId) {
        return res.status(400).json({ message: 'Lead ID is required' });
    }
    
    if (!loggedInUserId) {
        return res.status(401).json({ message: 'User email not found in session.' });
    }
    
    try {
        // Check if ID is valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            console.error('Invalid MongoDB ObjectId format:', leadId);
            return res.status(400).json({ message: 'Invalid lead ID format' });
        }
        
        const lead = await Lead.findById(leadId);
        
        if (!lead) {
            console.log('Lead not found with ID:', leadId);
            return res.status(404).json({ message: 'Lead not found' });
        }
        
        // Check if user has permission to view this lead
        if (loggedInUserRole !== 'manager' && lead.assignedUserId !== loggedInUserId) {
            console.log('User not authorized to view this lead. User:', loggedInUserId, 'Lead assigned to:', lead.assignedUserId);
            return res.status(403).json({ message: 'Not authorized to view this lead' });
        }
        
        console.log('Lead found successfully:', lead._id);
        res.status(200).json({ 
            message: 'Lead fetched successfully',
            data: lead
        });
    } catch (error) {
        console.error('Error fetching lead:', error);
        res.status(500).json({ message: 'Failed to fetch lead', error: error.message });
    }
});

// --- PUT /api/leads/:id - Update a lead ---
app.put('/api/leads/:id', ensureAuthenticated, async (req, res) => {
    const leadId = req.params.id;
    console.log('PUT update lead endpoint hit. Lead ID:', leadId);
    
    const loggedInUser = req.user;
    const loggedInUserId = loggedInUser?.emails?.[0]?.value;
    const loggedInUserRole = loggedInUser?.role;
    
    if (!leadId) {
        return res.status(400).json({ message: 'Lead ID is required' });
    }
    
    if (!loggedInUserId) {
        return res.status(401).json({ message: 'User email not found in session.' });
    }
    
    try {
        // Check if ID is valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            console.error('Invalid MongoDB ObjectId format:', leadId);
            return res.status(400).json({ message: 'Invalid lead ID format' });
        }
        
        const lead = await Lead.findById(leadId);
        
        if (!lead) {
            console.log('Lead not found with ID:', leadId);
            return res.status(404).json({ message: 'Lead not found' });
        }
        
        // Check if user has permission to update this lead
        if (loggedInUserRole !== 'manager' && lead.assignedUserId !== loggedInUserId) {
            console.log('User not authorized to update this lead. User:', loggedInUserId, 'Lead assigned to:', lead.assignedUserId);
            return res.status(403).json({ message: 'Not authorized to update this lead' });
        }
        
        // Extract fields to update
        const {
            name, email, phone, address, status, source, nextFollowUpDate, addNote
        } = req.body;
        
        console.log('Updating lead fields:', { name, email, phone, status, source });
        
        // Update the lead fields
        if (name) lead.name = name;
        if (email) lead.email = email;
        if (phone) lead.phone = phone;
        if (address) lead.address = address;
        if (status) lead.status = status;
        if (source) lead.source = source;
        if (nextFollowUpDate) lead.nextFollowUpDate = new Date(nextFollowUpDate);
        
        // Add a new note if provided
        if (addNote) {
            // Make sure followUpNotes exists and is an array
            if (!lead.followUpNotes) {
                lead.followUpNotes = [];
            }
            
            lead.followUpNotes.push({
                note: addNote,
                userId: loggedInUserId,
                date: new Date()
            });
            
            console.log('Added new note to lead');
        }
        
        // Save the updated lead
        const updatedLead = await lead.save();
        
        console.log('Lead updated successfully:', updatedLead._id);
        res.status(200).json({ 
            message: 'Lead updated successfully',
            data: updatedLead
        });
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({ message: 'Failed to update lead', error: error.message });
    }
});

// --- Test endpoint - no authentication required ---
app.get('/api/test', (req, res) => {
    console.log('Test endpoint hit');
    res.json({ message: 'API test endpoint working' });
});
// TODO: Add GET /api/leads (to fetch leads)
// TODO: Add PUT /api/leads/:id (to update leads)
// TODO: Add DELETE /api/leads/:id (to delete leads)

// Create a new lead
app.post('/api/leads', ensureAuthenticated, async (req, res) => {
    try {
      const { 
        name, 
        email, 
        phone, 
        source, 
        address,
        leadType,
        pmName, 
        nextFollowUpDate 
      } = req.body;
      
      // Validate required fields
      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }
      
      // Get the logged-in user
      const loggedInUser = req.user;
      const loggedInUserId = loggedInUser?.email?.i;
      
      // Create initial sales process object
      const salesProcess = {
        isGhosted: false,
        mcOnly: false,
        mcAndDemo: false,
        sepMcAndDemo: false,
        emailedProposal: false
      };
      
      // Create initial results object
      const results = {
        status: 'Pending',  // Default status
        bidAmount: 0,
        soldAmount: 0
      };
      
      // Create the new lead
      const newLead = new SalesLog({
        name,
        email,
        phone,
        source,
        address,
        leadType: leadType || 'SelfGen',  // Default to SelfGen if not provided
        pmName: pmName || loggedInUser?.displayName || loggedInUser?.email?.i,
        assignedUserId: loggedInUserId,
        nextFollowUpDate: nextFollowUpDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
        salesProcess,
        results,
        notes: []
      });
      
      // Save the lead to the database
      const savedLead = await newLead.save();
      
      // Return the created lead
      res.status(201).json(savedLead);
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ message: 'Failed to create lead', error: error.message });
    }
  });


// ==============================================================
//                  BASIC TEST ROUTE
// ==============================================================
app.get('/', (req, res) => {
  res.send('KPI Tracker Backend is running!');
});
// Test MongoDB connection separately
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connection test successful!');
    // Start server here if needed
  })
  .catch(err => {
    console.error('MongoDB connection test failed:', err.message);
    if (err.name) console.error('Error name:', err.name);
    if (err.code) console.error('Error code:', err.code);
  });

// ==============================================================
//                  YTD STATS ROUTES
// ==============================================================
console.log('Registering YTD Stats routes...');
const ytdStatsRoutes = require('./routes/ytdStats');
app.use('/api/ytd', ytdStatsRoutes);
console.log('YTD Stats routes registered!');

  // Add this right before where your server starts
console.log('Mongoose connection state:', mongoose.connection.readyState);
/* 
  Mongoose connection states:
  0 = disconnected
  1 = connected
  2 = connecting
  3 = disconnecting
*/
// ==============================================================
//                  START THE SERVER
// ==============================================================
// Wait for mongoose connection to be established before starting server
const PORT = process.env.PORT || 3001;

const startServer = async () => {
  // Initialize Google Sheets (which seems to be working fine already)
  try {
    await initializeSheetsClient();
    console.log('Google Sheets API client initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Google Sheets API client:', error);
  }
  
  // First try to connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected Successfully.');
    
    app.get('/direct-test', (req, res) => {
        console.log('Direct test route hit!');
        res.json({ message: 'Direct test route works!' });
      });

    // Start server only after MongoDB is connected
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    console.log('MongoDB not connected. Server not started.');
    process.exit(1);  // Exit with error
  }
};

// Start the server
startServer();