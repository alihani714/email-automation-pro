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

function isWithinSendingWindow() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

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

    const pendingClients = campaignState.clients.filter(c => c.status === 'pending');

    if (pendingClients.length === 0) {
        campaignState.active = false;
        console.log('Campaign complete!');
        return;
    }

    if (!isWithinSendingWindow() || !checkDailyLimit()) {
        campaignState.processTimeout = setTimeout(processQueue, 5 * 60 * 1000);
        return;
    }

    const nextClient = pendingClients[0];
    await sendEmail(nextClient);

    const interval = getRandomInterval();
    campaignState.processTimeout = setTimeout(processQueue, interval);
}

function saveState() {
    try {
        fs.writeFileSync('campaign-state.json', JSON.stringify(campaignState, null, 2));
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

// Serve frontend
app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Automation Pro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
        }
        .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            padding: 2rem;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 12px;
            border: 2px solid #e9ecef;
        }
        .stat-card h3 { color: #6c757d; font-size: 0.875rem; margin-bottom: 0.5rem; }
        .stat-card .value { font-size: 2rem; font-weight: bold; color: #667eea; }
        .controls {
            padding: 0 2rem 2rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        button {
            padding: 1rem 2rem;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.2s;
        }
        button:hover { transform: translateY(-2px); }
        .btn-start { background: #10b981; color: white; }
        .btn-stop { background: #ef4444; color: white; }
        .btn-upload { background: #667eea; color: white; cursor: pointer; }
        input[type="file"] { display: none; }
        .section {
            padding: 2rem;
            border-top: 2px solid #e9ecef;
        }
        .section h2 { margin-bottom: 1rem; color: #1f2937; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #e9ecef; }
        th { background: #f8f9fa; font-weight: 600; }
        .status {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 500;
        }
        .status-sent { background: #dcfce7; color: #166534; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-failed { background: #fee2e2; color: #991b1b; }
        .campaign-status { padding: 1rem; border-radius: 8px; margin-top: 1rem; font-weight: 500; }
        .campaign-active { background: #dcfce7; color: #166534; }
        .campaign-inactive { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📧 Email Automation Pro</h1>
            <p>Smart email campaigns with SendGrid</p>
            <div id="campaignStatus" class="campaign-status campaign-inactive">🔴 Campaign Stopped</div>
        </div>
        <div class="stats">
            <div class="stat-card"><h3>TOTAL</h3><div class="value" id="total">0</div></div>
            <div class="stat-card"><h3>SENT</h3><div class="value" id="sent">0</div></div>
            <div class="stat-card"><h3>PENDING</h3><div class="value" id="pending">0</div></div>
            <div class="stat-card"><h3>TODAY</h3><div class="value" id="daily">0/100</div></div>
        </div>
        <div class="controls">
            <button class="btn-start" onclick="start()">▶️ Start</button>
            <button class="btn-stop" onclick="stop()">⏸️ Stop</button>
            <label class="btn-upload">
                📤 Upload CSV
                <input type="file" accept=".csv" onchange="upload(this)">
            </label>
        </div>
        <div class="section">
            <h2>Clients</h2>
            <table>
                <thead><tr><th>Business</th><th>Email</th><th>City</th><th>Status</th><th>Count</th></tr></thead>
                <tbody id="clients"><tr><td colspan="5" style="text-align:center;padding:2rem;color:#6c757d;">No clients loaded</td></tr></tbody>
            </table>
        </div>
    </div>
    <script>
        async function refresh() {
            const s = await (await fetch('/api/status')).json();
            document.getElementById('total').textContent = s.total;
            document.getElementById('sent').textContent = s.sent;
            document.getElementById('pending').textContent = s.pending;
            document.getElementById('daily').textContent = s.dailyCount + '/100';
            const st = document.getElementById('campaignStatus');
            st.className = 'campaign-status ' + (s.active ? 'campaign-active' : 'campaign-inactive');
            st.textContent = s.active ? '🟢 Active' : '🔴 Stopped';
            
            const c = await (await fetch('/api/clients')).json();
            const tb = document.getElementById('clients');
            if (!c.length) {
                tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#6c757d;">No clients</td></tr>';
            } else {
                tb.innerHTML = c.map(x => '<tr><td>' + x.businessName + '</td><td>' + x.email + '</td><td>' + x.city + '</td><td><span class="status status-' + x.status + '">' + x.status + '</span></td><td>' + (x.sentCount||0) + '</td></tr>').join('');
            }
        }
        async function start() {
            const r = await fetch('/api/campaign/start', {method:'POST'});
            const d = await r.json();
            alert(d.success ? '✅ Started!' : '❌ ' + d.error);
            refresh();
        }
        async function stop() {
            await fetch('/api/campaign/stop', {method:'POST'});
            alert('⏸️ Stopped!');
            refresh();
        }
        async function upload(inp) {
            const f = inp.files[0];
            if (!f) return;
            const fd = new FormData();
            fd.append('csvFile', f);
            const r = await fetch('/api/upload-csv', {method:'POST', body:fd});
            const d = await r.json();
            alert(d.success ? '✅ Uploaded ' + d.count + ' clients!' : '❌ ' + d.error);
            refresh();
        }
        setInterval(refresh, 5000);
        refresh();
    </script>
</body>
</html>`;
    res.send(html);
});

loadState();

app.listen(PORT, () => {
    console.log('Email Automation Pro');
    console.log('Server: http://localhost:' + PORT);
});

module.exports = app;
