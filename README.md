# Email Automation Pro

Automated email campaign system with SendGrid integration for sending personalized emails to clients.

## Features

- 📧 Automated email sending with customizable intervals (3-25 minutes)
- ⏰ Time-based sending windows (9:00 AM - 12:30 PM)
- 🔄 Rotating between multiple Gmail accounts
- 📊 Real-time dashboard with campaign statistics
- 📁 CSV file upload for client data
- 🎯 Personalized email templates with dynamic placeholders
- 📈 Daily sending limits and tracking

## Setup Instructions

### 1. Environment Variables

You need to set the following environment variable:

- `SENDGRID_API_KEY` - Your SendGrid API key

**For Render deployment:**
1. Go to your Render dashboard
2. Select your web service
3. Go to "Environment" tab
4. Add environment variable:
   - Key: `SENDGRID_API_KEY`
   - Value: Your SendGrid API key (starts with `SG.`)

### 2. SendGrid Setup

1. Create a SendGrid account at https://sendgrid.com
2. Verify your sender email address (alihanideveloper@gmail.com)
3. Create an API key with "Mail Send" permissions
4. Copy the API key and add it to your environment variables

### 3. Deploy to Render

1. Push your code to GitHub
2. Connect your GitHub repository to Render
3. Set the environment variable `SENDGRID_API_KEY`
4. Deploy!

## CSV Format

Your CSV file should have the following columns:

```
Business Name,Email Address,Website URL,What Stood Out,city,status
```

Example:
```
ABC Garage Doors,contact@abcgarage.com,https://abcgarage.com,Great reviews on Google,Los Angeles,pending
```

## Usage

1. Upload your CSV file with client data
2. The app will automatically use the configured settings
3. Click "Start" to begin the campaign
4. Monitor progress in real-time on the dashboard
5. Click "Stop" to pause the campaign

## Settings

- **Email Interval**: 3-25 minutes (randomized)
- **Sending Window**: 9:00 AM - 12:30 PM
- **Emails per Account**: 50 emails before switching
- **Daily Limit**: 100 emails per day
- **Gmail Accounts**: Rotates between configured accounts

## Local Development

```bash
# Install dependencies
npm install

# Set environment variable
export SENDGRID_API_KEY=your_api_key_here

# Run the app
npm start

# Access at http://localhost:3000
```

## Important Notes

⚠️ **SendGrid Sender Verification**: You must verify your sender email address in SendGrid before you can send emails.

⚠️ **API Key Security**: Never commit your API key to GitHub. Always use environment variables.

⚠️ **Email Limits**: Respect SendGrid's sending limits and your recipients' preferences.
