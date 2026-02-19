// api/email.js
// Vercel serverless function for sending emails via Gmail OAuth2.
// Uses the Gmail API with a pre-authorized refresh token to send on behalf of the user.
// The user connects their Gmail account once in the preferences, then emails send automatically.

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Set up the Google OAuth2 client using our app's credentials
const googleOAuthClient = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export default async function handler(request, response) {
  // ── Handle Google OAuth callback (GET request from Google) ──
  if (request.method === 'GET' && request.query.code) {
    return await handleOAuthCallback(request, response)
  }

  // ── Handle email send (POST request from frontend) ──
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method not allowed' })
  }

  // Verify the user is authenticated
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ message: 'Unauthorized' })
  }

  const userToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(userToken)

  if (authError || !user) {
    return response.status(401).json({ message: 'Invalid token' })
  }

  const { to, cc, subject, body, applicationId } = request.body

  // Validate required fields
  if (!to || !subject || !body) {
    return response.status(400).json({ message: 'Missing required fields: to, subject, body' })
  }

  try {
    // Get the user's stored Gmail refresh token from the database
    const { data: userGmailToken, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single()

    // If no Gmail token, return a URL to start the OAuth flow
    if (tokenError || !userGmailToken) {
      const authUrl = generateGmailAuthUrl(user.id)
      return response.status(403).json({
        message: 'Gmail not connected',
        authUrl,
        requiresAuth: true
      })
    }

    // Use the stored refresh token to get a fresh access token
    googleOAuthClient.setCredentials({
      refresh_token: userGmailToken.refresh_token
    })

    // Create the Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: googleOAuthClient })

    // Build the email in RFC 2822 format (what Gmail API expects)
    const emailContent = buildEmailContent(to, cc, user.email, subject, body)
    const encodedEmail = Buffer.from(emailContent).toString('base64url')

    // Send the email via Gmail API
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    })

    // Mark the application as email sent in the database
    if (applicationId) {
      await supabase
        .from('applications')
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)
    }

    return response.status(200).json({ message: 'Email sent successfully' })

  } catch (error) {
    console.error('Email sending error:', error)

    // Handle Gmail-specific errors
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return response.status(403).json({
        message: 'Gmail token expired. Please reconnect your Gmail account.',
        requiresReauth: true
      })
    }

    return response.status(500).json({ message: error.message || 'Failed to send email' })
  }
}

// ─── GMAIL OAUTH ──────────────────────────────────────────────────────────────

// Generate the URL the user visits to grant Gmail access
function generateGmailAuthUrl(userId) {
  return googleOAuthClient.generateAuthUrl({
    access_type: 'offline',       // This gets us a refresh token
    prompt: 'consent',            // Force consent screen so we always get a refresh token
    scope: [
      'https://www.googleapis.com/auth/gmail.send'  // Only request send permission
    ],
    state: userId  // Pass the user ID so we know who to save the token for
  })
}

// Handle the redirect back from Google after user grants permission
async function handleOAuthCallback(request, response) {
  const { code, state: userId } = request.query

  try {
    // Exchange the one-time code for permanent refresh token
    const { tokens } = await googleOAuthClient.getToken(code)

    // Save the refresh token to the database for this user
    await supabase
      .from('gmail_tokens')
      .upsert({
        user_id: userId,
        refresh_token: tokens.refresh_token,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    // Redirect back to the app with success
    return response.redirect('/?gmail=connected')

  } catch (error) {
    console.error('OAuth callback error:', error)
    return response.redirect('/?gmail=error')
  }
}

// ─── EMAIL BUILDER ────────────────────────────────────────────────────────────

// Build a properly formatted email string that Gmail API can send
function buildEmailContent(toAddress, ccAddress, fromAddress, subject, body) {
  const lines = []

  lines.push(`From: ${fromAddress}`)
  lines.push(`To: ${toAddress}`)

  if (ccAddress) {
    lines.push(`Cc: ${ccAddress}`)
  }

  lines.push(`Subject: ${subject}`)
  lines.push('MIME-Version: 1.0')
  lines.push('Content-Type: text/plain; charset=utf-8')
  lines.push('')  // Empty line separates headers from body
  lines.push(body)

  return lines.join('\r\n')
}
