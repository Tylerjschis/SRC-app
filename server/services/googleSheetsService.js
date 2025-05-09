// Import the Google APIs client library
const { google } = require('googleapis');
// Import the path module for handling file paths
const path = require('path');

// Load environment variables (Sheet ID and Key File path)
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
// Construct the absolute path to the key file, assuming it's in the parent ('server') directory
const KEY_FILE_PATH = path.join(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);

// Configure the authentication client using the service account key file
const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    // Define the scope(s) needed - read/write access to spreadsheets
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Variable to hold the initialized Sheets API client
let sheets;

/**
 * Initializes the Google Sheets API client if it hasn't been already.
 * Uses the authenticated client credentials.
 * @returns {Promise<object>} The initialized Sheets API client instance.
 */
const initializeSheetsClient = async () => {
    // Only initialize if the 'sheets' variable is not already set
    if (!sheets) {
        try {
            // Get the authenticated client object
            const authClient = await auth.getClient();
            // Create the Sheets API client instance
            sheets = google.sheets({ version: 'v4', auth: authClient });
            console.log('Google Sheets API client initialized successfully.');
        } catch (err) {
            // Log and throw an error if initialization fails
            console.error('Error initializing Google Sheets client:', err);
            throw new Error('Could not initialize Google Sheets client');
        }
    }
    // Return the initialized client
    return sheets;
};

/**
 * Appends rows of data to a specific sheet within the spreadsheet.
 * Finds the first empty row after the specified range and appends the data there.
 * @param {string} range - The A1 notation of a range (e.g., 'Sheet1!A1' or just 'Sheet1'). Data will be appended after the last row of the table found within this range.
 * @param {Array<Array<any>>} values - The data to append. An array of arrays, where each inner array represents a row.
 * @returns {Promise<object>} - The response object from the Google Sheets API.
 * @throws {Error} If appending data fails.
 */
const appendData = async (range, values) => {
    // Ensure the Sheets client is initialized before proceeding
    await initializeSheetsClient();
    try {
        // Call the Sheets API to append the values
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, // The ID of the spreadsheet
            range: range,                  // The range to append after
            valueInputOption: 'USER_ENTERED', // Interpret values as if typed by a user (handles formulas, dates, etc.)
            insertDataOption: 'INSERT_ROWS',  // Insert new rows for the data, don't overwrite
            resource: {                    // The data to be written
                values: values,
            },
        });
        console.log(`Appended data to range: ${range}`);
        // Return the data part of the API response
        return response.data;
    } catch (err) {
        // Log detailed error information if appending fails
        console.error(`Error appending data to ${range}:`, err.message || err);
        if (err.response && err.response.data && err.response.data.error) {
          console.error('API Error Details:', JSON.stringify(err.response.data.error, null, 2));
        }
        // Throw a new error to be caught by the calling function
        throw new Error(`Failed to append data to sheet: ${err.message}`);
    }
};

/**
 * Retrieves data from a specified range in the spreadsheet.
 * @param {string} range - The A1 notation of the range to retrieve (e.g., 'Sheet1!A1:C5' or 'Sheet1!A:N').
 * @returns {Promise<Array<Array<any>>>} - A 2D array containing the data from the sheet. Returns an empty array if the range is empty or an error occurs.
 */
const getData = async (range) => {
    // Ensure the Sheets client is initialized
    await initializeSheetsClient();
    try {
        // Call the Sheets API to get values from the specified range
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        console.log(`Retrieved data from range: ${range}`);
        // Return the values from the response, or an empty array if no values exist
        return response.data.values || [];
    } catch (err) {
        // Log detailed error information if getting data fails
        console.error(`Error getting data from ${range}:`, err.message || err);
        if (err.response && err.response.data && err.response.data.error) {
          console.error('API Error Details:', JSON.stringify(err.response.data.error, null, 2));
        }
        // Return an empty array in case of error to prevent crashes in calling code
        return [];
    }
};

// Export the functions so they can be imported and used in other files (like server.js)
module.exports = {
    appendData,
    getData,
    initializeSheetsClient // Exporting init might be useful for explicit connection checks
};