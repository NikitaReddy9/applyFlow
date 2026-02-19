// api/ai.js
// Vercel serverless function that handles all AI-powered features:
// 1. Finding recruiter/contact information for a job
// 2. Generating personalized outreach emails
// Uses OpenAI GPT-4 for all AI operations.

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ─── ALL PROMPTS IN ONE PLACE (EASY TO EDIT) ─────────────────────────────────

const AI_PROMPTS = {
  // Prompt for finding recruiter contacts at a company
  findContacts: (jobTitle, companyName, jobLocation) => `
You are a professional recruiter assistant. Your job is to identify likely recruiter or hiring manager contacts for a specific job posting.

Job Details:
- Title: ${jobTitle}
- Company: ${companyName}
- Location: ${jobLocation}

Based on common corporate structures and publicly available information:
1. Identify 2-3 likely contacts (recruiters, HR managers, or hiring managers) for this type of role at this company
2. For each contact, infer a likely email based on common corporate email patterns (firstname.lastname@company.com, first@company.com, etc.)
3. Provide a confidence score (0-100) for each contact

Return ONLY valid JSON in this exact format:
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "email": "email@company.com",
      "emailPattern": "firstname.lastname",
      "confidenceScore": 75,
      "linkedinUrl": "https://linkedin.com/in/username"
    }
  ]
}`,

  // Prompt for generating a cold outreach email
  generateColdEmail: (jobTitle, companyName, jobDescription, resumeText, contactName) => `
You are an expert career coach writing a cold outreach email for a job application.

Job Information:
- Role: ${jobTitle}
- Company: ${companyName}
- Job Description: ${jobDescription || 'Not provided'}

Candidate Resume Summary:
${resumeText || 'Experienced professional looking for new opportunities'}

Recipient: ${contactName || 'Hiring Manager'}

Write a concise, personalized cold outreach email. The email should:
1. Be professional but friendly
2. Reference the specific role
3. Highlight 2-3 relevant qualifications
4. Include a clear call-to-action
5. Be under 200 words

Return ONLY valid JSON in this exact format:
{
  "subject": "Email subject line here",
  "body": "Full email body here with \\n for new lines",
  "contactEmail": ""
}`,

  // Prompt for generating a follow-up email
  generateFollowUpEmail: (jobTitle, companyName, originalSentDate) => `
You are an expert career coach writing a follow-up email for a job application.

Context:
- Applied for: ${jobTitle} at ${companyName}
- Originally sent: ${originalSentDate || '2 weeks ago'}

Write a brief, professional follow-up email that:
1. References the original application
2. Reaffirms interest
3. Asks about timeline
4. Is under 100 words

Return ONLY valid JSON in this exact format:
{
  "subject": "Follow-up subject line",
  "body": "Email body with \\n for new lines"
}`,

  // Prompt for scoring how well a resume matches a job description
  scoreResume: (resumeText, jobDescription) => `
You are an ATS (Applicant Tracking System) expert. Analyze how well this resume matches the job description.

Job Description:
${jobDescription}

Resume:
${resumeText}

Provide a detailed match analysis. Return ONLY valid JSON:
{
  "overallScore": 75,
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3", "skill4"],
  "recommendation": "Brief recommendation for improving the application"
}`
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method not allowed' })
  }

  // Verify authentication
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ message: 'Unauthorized' })
  }

  const userToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(userToken)

  if (authError || !user) {
    return response.status(401).json({ message: 'Invalid token' })
  }

  const { action, job, contact, resumeText, emailType } = request.body

  try {
    switch (action) {
      case 'find_contacts':
        return await handleFindContacts(job, response)

      case 'generate_email':
        return await handleGenerateEmail(job, contact, resumeText, emailType, response)

      case 'score_resume':
        return await handleScoreResume(resumeText, job?.description, response)

      default:
        return response.status(400).json({ message: `Unknown action: ${action}` })
    }
  } catch (error) {
    console.error(`Error in AI API (action: ${action}):`, error)
    return response.status(500).json({ message: error.message || 'AI processing failed' })
  }
}

// ─── AI FEATURE HANDLERS ──────────────────────────────────────────────────────

// Find recruiter contacts for a specific job
async function handleFindContacts(job, response) {
  if (!job) {
    return response.status(400).json({ message: 'Job data is required' })
  }

  const prompt = AI_PROMPTS.findContacts(
    job.title || 'Unknown Role',
    job.company || 'Unknown Company',
    job.location || ''
  )

  const aiResponse = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 800
  })

  const responseText = aiResponse.choices[0].message.content || '{}'
  const parsedData = safeJsonParse(responseText, { contacts: [] })

  return response.status(200).json(parsedData)
}

// Generate a personalized outreach email
async function handleGenerateEmail(job, contact, resumeText, emailType, response) {
  const promptFunction = emailType === 'follow_up'
    ? AI_PROMPTS.generateFollowUpEmail
    : AI_PROMPTS.generateColdEmail

  const prompt = emailType === 'follow_up'
    ? promptFunction(job?.title, job?.company, null)
    : promptFunction(
        job?.title || 'the position',
        job?.company || 'your company',
        job?.description_snippet || job?.descriptionSnippet || '',
        resumeText || '',
        contact?.name || 'Hiring Manager'
      )

  const aiResponse = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 600
  })

  const responseText = aiResponse.choices[0].message.content || '{}'
  const parsedEmail = safeJsonParse(responseText, {
    subject: `Application: ${job?.title} at ${job?.company}`,
    body: 'Hi,\n\nI am interested in this position.\n\nBest regards',
    contactEmail: contact?.email || ''
  })

  return response.status(200).json(parsedEmail)
}

// Score how well a resume matches a job description
async function handleScoreResume(resumeText, jobDescription, response) {
  if (!resumeText || !jobDescription) {
    return response.status(400).json({ message: 'Resume and job description are required' })
  }

  const prompt = AI_PROMPTS.scoreResume(resumeText, jobDescription)

  const aiResponse = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 500
  })

  const responseText = aiResponse.choices[0].message.content || '{}'
  const parsedScore = safeJsonParse(responseText, { overallScore: 0, matchedSkills: [], missingSkills: [] })

  return response.status(200).json(parsedScore)
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Safely parse JSON without crashing if the AI returns malformed JSON
function safeJsonParse(text, fallbackValue) {
  try {
    // Sometimes the AI wraps JSON in markdown code blocks, so strip those first
    const cleanText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    return JSON.parse(cleanText)
  } catch (error) {
    console.error('JSON parse error:', error, 'Raw text:', text)
    return fallbackValue
  }
}
