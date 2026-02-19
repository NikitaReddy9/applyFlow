// api.js
// This file contains all the functions that call our serverless API endpoints.
// Every feature that needs a backend (AI, job fetching, email) goes through here.

import { supabase } from './auth.js'

// Base URL for our Vercel serverless functions
const API_BASE = '/api'

// Helper to get the current user's auth token for authenticated requests
async function getAuthToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

// Helper to make authenticated API calls
async function apiCall(endpoint, options = {}) {
  const token = await getAuthToken()
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(errorData.message || `API error: ${response.status}`)
  }

  return response.json()
}

// ─── JOBS ───────────────────────────────────────────────────────────────────

// Trigger job discovery based on user preferences
export async function fetchJobs(preferences) {
  return apiCall('/jobs', {
    method: 'POST',
    body: JSON.stringify({ preferences })
  })
}

// Get all saved jobs from the database for the current user
export async function getSavedJobs(userId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('posted_date', { ascending: false })

  if (error) throw error
  return data
}

// ─── AI FEATURES ────────────────────────────────────────────────────────────

// Use AI to find recruiter/manager contacts for a job
export async function findContacts(job) {
  return apiCall('/ai', {
    method: 'POST',
    body: JSON.stringify({ action: 'find_contacts', job })
  })
}

// Use AI to generate a personalized outreach email
export async function generateEmail(job, contact, resumeText, emailType = 'cold') {
  return apiCall('/ai', {
    method: 'POST',
    body: JSON.stringify({ action: 'generate_email', job, contact, resumeText, emailType })
  })
}

// ─── EMAIL SENDING ──────────────────────────────────────────────────────────

// Send an email via Gmail OAuth
export async function sendEmail(emailData) {
  return apiCall('/email', {
    method: 'POST',
    body: JSON.stringify(emailData)
  })
}

// ─── APPLICATIONS ───────────────────────────────────────────────────────────

// Get all applications for the current user
export async function getApplications(userId) {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('applied_date', { ascending: false })

  if (error) throw error
  return data
}

// Create a new application entry when user clicks "Applied"
export async function createApplication(userId, job) {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      job_id: job.id,
      company: job.company,
      role: job.title,
      location: job.location,
      apply_url: job.link,
      posted_date: job.posted_date,
      applied_date: new Date().toISOString(),
      status: 'Applied',
      email_sent: false
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Update the status of an application
export async function updateApplicationStatus(applicationId, status) {
  const { data, error } = await supabase
    .from('applications')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update the email_sent status of an application
export async function updateEmailSentStatus(applicationId, emailSent) {
  const { data, error } = await supabase
    .from('applications')
    .update({ email_sent: emailSent, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Update notes on an application
export async function updateApplicationNotes(applicationId, notes) {
  const { data, error } = await supabase
    .from('applications')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .select()
    .single()

  if (error) throw error
  return data
}
