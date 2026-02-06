// Complete Web Application - Email Automation Pro
// Run with: node app.js
// Access at: http://localhost:3000

const express = require('express');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// SendGrid Configuration - MUST set SENDGRID_API_KEY environment variable
if (!process.env.SENDGRID_API_KEY) {
    console.error('ERROR: SENDGRID_API_KEY environment variable is not set!');
    console.error('Please set it in your Render dashboard or .env file');
}
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Campaign State
let campaignState = {
    clients: [],
    settings: {
        minInterval: 3,
        maxInterval: 25,
        startTime: '09:00',
        endTime: '12:30',
        emailsPerAccount: 50,
        gmailAccounts: ['alihanideveloper@gmail.com'],
        subjectLines: [
            "A question about {{Business Name}}'s mobile site?",
            "Missing mobile calls for {{Business Name}}?"
        ],
        emailTemplate: `Noticed your mobile site might be missing you calls around {{city}}

Hey, I was looking up garage door companies in {{city}} and {{Business Name}} came up. {{What Stood Out}}. 

I clicked through to your site and noticed it doesn't quite fit right on my phone screen. I noticed the "Call" button was quite small and it wasn't immediately clear if you serve {{city}} isn't obvious. Most "garage door repair" searches happen on a phone. 

If the site isn't easy to use right away, you're likely missing those calls. I build mobile-friendly sites for local businesses like yours. 

Would you be open to a quick 10-minute chat this week, no-pressure to see how a more mobile-friendly site could help {{Business Name}} capture more of those on-the-go customers? 

I'm offering a free, custom website demo. I'll create a live preview of what a faster, mobile-optimized site could look like for {{Business Name}} No cost, no obligation just a clear look at what's possible.

Ali

P.S. Just helped a garage door co. in New South Wales get 40% more calls by fixing their mobile site. The before/after is pretty eye-opening.`
    },
    active: false,
    currentAccountIndex: 0,
    emailsSentFromCurrentAccount: 0,
    currentSubjectIndex: 0,
    sentLog: [],
    dailyEmailCount: 0,
    lastResetDate: new Date().toDateString(),
    processTimeout: null
};

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Helper Functions
function fillTemplate(template, client) {
    return template
        .replace(/\{\{Business Name\}\}/g, client.businessName)
        .replace(/\{\{city\}\}/g, client.city)
        .replace(/\{\{What Stood Out\}\}/g, client.whatStoodOut);
}

function checkDailyLimit() {
    const today = new Date().toDateString();
    const DAILY_LIMIT = 100;

    if (today !== campaignState.lastResetDate) {
        campaignState.dailyEmailCount = 0;
        campaignState.lastResetDate = today;
    }

    return campaignState.dailyEmailCount < DAILY_LIMIT;
}

// City to timezone mapping
const cityTimezones = {
    'Los Angeles': 'America/Los_Angeles',
    'San Francisco': 'America/Los_Angeles',
    'Chicago': 'America/Chicago',
    'New York': 'America/New_York',
    'Houston': 'America/Chicago',
    'Phoenix': 'America/Phoenix',
    'Philadelphia': 'America/New_York',
    'San Antonio': 'America/Chicago',
    'San Diego': 'America/Los_Angeles',
    'Dallas': 'America/Chicago',
    'Austin': 'America/Chicago',
    'Seattle': 'America/Los_Angeles',
    'Denver': 'America/Denver',
    'Boston': 'America/New_York',
    'Miami': 'America/New_York',
    'Atlanta': 'America/New_York',
    'Detroit': 'America/Detroit',
    'Portland': 'America/Los_Angeles',
    'Las Vegas': 'America/Los_Angeles',
    // Add more cities as needed
};

function isWithinSendingWindow(city) {
    const timezone = cityTimezones[city] || 'America/New_York'; // Default to EST

    // Get current time in the city's timezone
    const now = new Date();
    const cityTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    const currentHour = cityTime.getHours();
    const currentMinute = cityTime.getMinutes();

    const [startHour, startMinute] = campaignState.settings.startTime.split(':').map(Number);
    const [endHour, endMinute] = campaignState.settings.endTime.split(':').map(Number);

    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
}

async function sendEmail(client) {
    if (!checkDailyLimit()) {
        return { success: false, error: 'Daily limit reached' };
    }

    const fromEmail = campaignState.settings.gmailAccounts[campaignState.currentAccountIndex];
    const subject = fillTemplate(campaignState.settings.subjectLines[campaignState.currentSubjectIndex], client);
    const body = fillTemplate(campaignState.settings.emailTemplate, client);

    const msg = {
        to: client.email,
        from: fromEmail,
        subject: subject,
        text: body,
        html: body.replace(/\n/g, '<br>')
    };

    try {
        await sgMail.send(msg);

        const logEntry = {
            timestamp: new Date().toISOString(),
            to: client.email,
            from: fromEmail,
            subject: subject,
            status: 'sent'
        };

        client.status = 'sent';
        client.sentCount = (client.sentCount || 0) + 1;
        client.lastSent = new Date().toISOString();

        campaignState.emailsSentFromCurrentAccount++;
        campaignState.dailyEmailCount++;
        campaignState.sentLog.push(logEntry);

        campaignState.currentSubjectIndex =
            (campaignState.currentSubjectIndex + 1) % campaignState.settings.subjectLines.length;

        if (campaignState.emailsSentFromCurrentAccount >= campaignState.settings.emailsPerAccount) {
            campaignState.currentAccountIndex =
                (campaignState.currentAccountIndex + 1) % campaignState.settings.gmailAccounts.length;
            campaignState.emailsSentFromCurrentAccount = 0;
        }

        saveState();
        return { success: true, logEntry };

    } catch (error) {
        client.status = 'failed';
        const logEntry = {
            timestamp: new Date().toISOString(),
            to: client.email,
            from: fromEmail,
            subject: subject,
            status: 'failed',
            error: error.message
        };
        campaignState.sentLog.push(logEntry);
        saveState();
        return { success: false, error: error.message };
    }
}

function getRandomInterval() {
    const min = campaignState.settings.minInterval * 60 * 1000;
    const max = campaignState.settings.maxInterval * 60 * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function processQueue() {
    if (!campaignState.active) return;

    // Only get clients that have NEVER been sent to (status is 'pending' and sentCount is 0)
    const pendingClients = campaignState.clients.filter(c =>
        c.status === 'pending' && (c.sentCount === 0 || !c.sentCount)
    );

    console.log(`[Campaign] Processing queue - ${pendingClients.length} pending clients (never sent)`);

    if (pendingClients.length === 0) {
        campaignState.active = false;
        console.log('[Campaign] Complete! All emails sent.');
        return;
    }

    // Find the next client whose city is within sending window
    let nextClient = null;
    for (const client of pendingClients) {
        if (isWithinSendingWindow(client.city)) {
            nextClient = client;
            break;
        }
    }

    if (!nextClient) {
        console.log('[Campaign] No clients in their sending window right now. Checking again in 5 minutes...');
        campaignState.processTimeout = setTimeout(processQueue, 5 * 60 * 1000);
        return;
    }

    if (!checkDailyLimit()) {
        console.log('[Campaign] Daily limit reached. Waiting until tomorrow...');
        campaignState.processTimeout = setTimeout(processQueue, 5 * 60 * 1000);
        return;
    }

    console.log(`[Campaign] Sending email to: ${nextClient.email} (${nextClient.businessName}) in ${nextClient.city}`);

    const result = await sendEmail(nextClient);

    if (result.success) {
        console.log(`[Campaign] ✅ Email sent successfully to ${nextClient.email}`);
    } else {
        console.log(`[Campaign] ❌ Failed to send to ${nextClient.email}: ${result.error}`);
    }

    const interval = getRandomInterval();
    console.log(`[Campaign] Next email in ${Math.round(interval / 1000 / 60)} minutes`);
    campaignState.processTimeout = setTimeout(processQueue, interval);
}

function saveState() {
    try {
        // Create a copy without the timeout object to avoid circular reference
        const stateToSave = {
            ...campaignState,
            processTimeout: null
        };
        fs.writeFileSync('campaign-state.json', JSON.stringify(stateToSave, null, 2));
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

function loadState() {
    try {
        if (fs.existsSync('campaign-state.json')) {
            const saved = JSON.parse(fs.readFileSync('campaign-state.json', 'utf8'));
            Object.assign(campaignState, saved);
            campaignState.processTimeout = null;
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
}

// API Routes
app.get('/api/status', (req, res) => {
    const stats = {
        active: campaignState.active,
        total: campaignState.clients.length,
        sent: campaignState.clients.filter(c => c.status === 'sent').length,
        pending: campaignState.clients.filter(c => c.status === 'pending').length,
        failed: campaignState.clients.filter(c => c.status === 'failed').length,
        dailyCount: campaignState.dailyEmailCount,
        dailyLimit: 100,
        currentAccount: campaignState.settings.gmailAccounts[campaignState.currentAccountIndex],
        recentSends: campaignState.sentLog.slice(-10).reverse()
    };
    res.json(stats);
});

app.get('/api/clients', (req, res) => {
    res.json(campaignState.clients);
});

app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
    try {
        const results = [];

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (row) => {
                results.push({
                    businessName: row['Business Name'],
                    email: row['Email Address'],
                    websiteUrl: row['Website URL'],
                    whatStoodOut: row['What Stood Out'],
                    city: row['city'],
                    status: row['status'] || 'pending',
                    sentCount: 0,
                    lastSent: null
                });
            })
            .on('end', () => {
                campaignState.clients = results;
                saveState();
                fs.unlinkSync(req.file.path);
                res.json({ success: true, count: results.length });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/campaign/start', (req, res) => {
    if (campaignState.clients.length === 0) {
        return res.status(400).json({ success: false, error: 'No clients loaded' });
    }

    campaignState.active = true;
    processQueue();
    saveState();
    res.json({ success: true, message: 'Campaign started' });
});

app.post('/api/campaign/stop', (req, res) => {
    campaignState.active = false;
    if (campaignState.processTimeout) {
        clearTimeout(campaignState.processTimeout);
        campaignState.processTimeout = null;
    }
    saveState();
    res.json({ success: true, message: 'Campaign stopped' });
});

// Get current settings
app.get('/api/settings', (req, res) => {
    res.json(campaignState.settings);
});

// Update settings
app.post('/api/settings', (req, res) => {
    try {
        const { startTime, endTime, minInterval, maxInterval, emailsPerAccount, gmailAccounts, subjectLines, emailTemplate } = req.body;

        if (startTime) campaignState.settings.startTime = startTime;
        if (endTime) campaignState.settings.endTime = endTime;
        if (minInterval) campaignState.settings.minInterval = parseInt(minInterval);
        if (maxInterval) campaignState.settings.maxInterval = parseInt(maxInterval);
        if (emailsPerAccount) campaignState.settings.emailsPerAccount = parseInt(emailsPerAccount);
        if (gmailAccounts) campaignState.settings.gmailAccounts = gmailAccounts;
        if (subjectLines) campaignState.settings.subjectLines = subjectLines;
        if (emailTemplate) campaignState.settings.emailTemplate = emailTemplate;

        saveState();
        res.json({ success: true, settings: campaignState.settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

loadState();

app.listen(PORT, () => {
    console.log('Email Automation Pro');
    console.log('Server: http://localhost:' + PORT);
});

module.exports = app;

