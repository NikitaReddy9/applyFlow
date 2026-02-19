// api/jobs.js
// Vercel serverless function that scrapes Indeed for jobs matching user preferences.
// Called when the user clicks "Find New Jobs" on the dashboard.
// Rate limited and cached to avoid hammering Indeed.

import { createClient } from '@supabase/supabase-js'

// We use the service role key here (server-side only) so we can write to the DB
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Simple in-memory cache to prevent duplicate scraping within 10 minutes
const requestCache = new Map()

export default async function handler(request, response) {
  // Only allow POST requests
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

  // Rate limit: don't allow more than 1 job fetch per 5 minutes per user
  const cacheKey = `jobs_${user.id}`
  const lastFetch = requestCache.get(cacheKey)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

  if (lastFetch && lastFetch > fiveMinutesAgo) {
    const secondsToWait = Math.ceil((lastFetch - fiveMinutesAgo) / 1000)
    return response.status(429).json({
      message: `Please wait ${secondsToWait} seconds before fetching more jobs.`
    })
  }

  try {
    const { preferences } = request.body

    if (!preferences) {
      return response.status(400).json({ message: 'Preferences are required' })
    }

    // Build the search parameters from user preferences
    const searchJobs = await discoverJobsFromIndeed(preferences)

    // Save new jobs to the database (skip duplicates based on URL)
    let newJobsCount = 0

    for (const job of searchJobs) {
      // Check if this job URL already exists for this user
      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('user_id', user.id)
        .eq('link', job.link)
        .single()

      if (!existingJob) {
        // Score how well this job matches the user's preferences
        const matchScore = calculateMatchScore(job, preferences)

        await supabase.from('jobs').insert({
          user_id: user.id,
          title: job.title,
          company: job.company,
          location: job.location,
          link: job.link,
          posted_date: job.postedDate,
          description_snippet: job.descriptionSnippet,
          source: job.source,
          match_score: matchScore
        })

        newJobsCount++
      }
    }

    // Update the cache timestamp
    requestCache.set(cacheKey, Date.now())

    return response.status(200).json({
      message: 'Jobs discovered successfully',
      count: newJobsCount,
      total: searchJobs.length
    })

  } catch (error) {
    console.error('Error in jobs API:', error)
    return response.status(500).json({ message: error.message || 'Internal server error' })
  }
}

// ─── JOB DISCOVERY ────────────────────────────────────────────────────────────

// Fetch jobs from JSearch API (RapidAPI)
// JSearch aggregates jobs from Indeed, LinkedIn, and other job boards
async function discoverJobsFromIndeed(preferences) {
  const allJobs = []

  // Split roles by comma so we can search for each one
  const roles = (preferences.roles || '').split(',').map(role => role.trim()).filter(Boolean)

  // Default to a generic search if no roles specified
  const rolesToSearch = roles.length > 0 ? roles.slice(0, 3) : ['Software Engineer']

  for (const role of rolesToSearch) {
    try {
      const jobs = await searchJobsWithJSearch(role, preferences.location, preferences.keywords)
      allJobs.push(...jobs)
    } catch (error) {
      console.error(`Error searching for role "${role}":`, error)
    }
  }

  // Remove duplicates by job link
  const uniqueJobs = allJobs.filter((job, index, self) =>
    index === self.findIndex(otherJob => otherJob.link === job.link)
  )

  return uniqueJobs
}

// Search for jobs using JSearch API from RapidAPI
async function searchJobsWithJSearch(role, location, keywords) {
  const rapidApiKey = process.env.JSEARCH_API_KEY
  const rapidApiHost = 'jsearch.p.rapidapi.com'

  if (!rapidApiKey) {
    throw new Error('JSEARCH_API_KEY environment variable is not set')
  }

  // Build the search query
  const searchQuery = keywords ? `${role} ${keywords}` : role

  // Build search parameters
  const params = new URLSearchParams({
    query: searchQuery,
    page: '1',
    num_pages: '1'
  })

  if (location) {
    params.append('location', location)
  }

  const url = `https://${rapidApiHost}/search?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': rapidApiHost
    }
  })

  if (!response.ok) {
    throw new Error(`JSearch API returned status ${response.status}`)
  }

  const data = await response.json()

  // Transform JSearch API response to our job format
  const jobs = (data.data || []).map(job => ({
    title: job.job_title || '',
    company: job.employer_name || '',
    location: job.job_location || '',
    link: job.job_apply_link || job.job_apply_url || '',
    descriptionSnippet: job.job_description ? job.job_description.substring(0, 300) : '',
    postedDate: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc).toISOString() : new Date().toISOString(),
    source: 'JSearch (Indeed, LinkedIn, etc)'
  })).filter(job => job.title && job.company && job.link)

  return jobs
}

// ─── MATCH SCORING ────────────────────────────────────────────────────────────

// Score how well a job matches the user's preferences (0-100)
function calculateMatchScore(job, preferences) {
  let score = 50 // Start at 50 as baseline

  const jobText = `${job.title} ${job.company} ${job.descriptionSnippet}`.toLowerCase()

  // Check if role keywords match
  const roles = (preferences.roles || '').toLowerCase().split(',').map(role => role.trim())
  for (const role of roles) {
    if (role && jobText.includes(role)) {
      score += 20
      break // Only count once
    }
  }

  // Check if tech stack keywords match
  const techStack = (preferences.techStack || '').toLowerCase().split(',').map(tech => tech.trim())
  let techMatches = 0
  for (const tech of techStack) {
    if (tech && jobText.includes(tech)) {
      techMatches++
    }
  }
  score += Math.min(techMatches * 5, 20)

  // Check if keywords match
  const keywords = (preferences.keywords || '').toLowerCase().split(',').map(keyword => keyword.trim())
  for (const keyword of keywords) {
    if (keyword && jobText.includes(keyword)) {
      score += 5
    }
  }

  // Location match
  if (preferences.location && job.location) {
    if (job.location.toLowerCase().includes(preferences.location.toLowerCase().split(',')[0])) {
      score += 10
    }
    if (job.location.toLowerCase().includes('remote')) {
      score += 5
    }
  }

  // Clamp between 0 and 100
  return Math.min(100, Math.max(0, score))
}
