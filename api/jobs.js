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

// Build Indeed search URLs from preferences and fetch job listings
async function discoverJobsFromIndeed(preferences) {
  const allJobs = []

  // Split roles by comma so we can search for each one
  const roles = (preferences.roles || '').split(',').map(role => role.trim()).filter(Boolean)

  // Default to a generic search if no roles specified
  const rolesToSearch = roles.length > 0 ? roles.slice(0, 3) : ['Software Engineer']

  for (const role of rolesToSearch) {
    try {
      const jobs = await scrapeIndeedJobs(role, preferences.location, preferences.keywords)
      allJobs.push(...jobs)
    } catch (error) {
      console.error(`Error scraping for role "${role}":`, error)
    }
  }

  // Remove duplicates by job link
  const uniqueJobs = allJobs.filter((job, index, self) =>
    index === self.findIndex(otherJob => otherJob.link === job.link)
  )

  return uniqueJobs
}

// Scrape Indeed for jobs matching a specific role and location
async function scrapeIndeedJobs(role, location, keywords) {
  // Build the Indeed search URL
  const searchQuery = keywords ? `${role} ${keywords}` : role
  const encodedQuery = encodeURIComponent(searchQuery)
  const encodedLocation = encodeURIComponent(location || '')

  const indeedUrl = `https://www.indeed.com/jobs?q=${encodedQuery}&l=${encodedLocation}&fromage=14&sort=date`

  const pageResponse = await fetch(indeedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    }
  })

  if (!pageResponse.ok) {
    throw new Error(`Indeed returned status ${pageResponse.status}`)
  }

  const htmlContent = await pageResponse.text()
  const parsedJobs = parseIndeedHTML(htmlContent)

  return parsedJobs
}

// Parse the HTML from Indeed to extract job listings
function parseIndeedHTML(htmlContent) {
  const jobs = []

  // Extract job cards from Indeed's HTML structure
  // Indeed uses <div class="job_seen_beacon"> for each job card
  const jobCardPattern = /<div[^>]*class="[^"]*job_seen_beacon[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*job_seen_beacon[^"]*"|$)/gi
  const jobCardMatches = htmlContent.match(jobCardPattern) || []

  for (const jobCard of jobCardMatches.slice(0, 20)) {
    try {
      const parsedJob = extractJobDataFromCard(jobCard)
      if (parsedJob && parsedJob.title && parsedJob.company) {
        jobs.push(parsedJob)
      }
    } catch (error) {
      // Skip malformed job cards
      continue
    }
  }

  // If the regex approach didn't find jobs, try alternative parsing
  if (jobs.length === 0) {
    return parseIndeedAlternative(htmlContent)
  }

  return jobs
}

// Extract specific fields from a single job card's HTML
function extractJobDataFromCard(cardHtml) {
  // Extract job title
  const titleMatch = cardHtml.match(/class="jobTitle[^"]*"[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/i)
  const title = cleanText(titleMatch?.[1] || '')

  // Extract company name
  const companyMatch = cardHtml.match(/class="companyName"[^>]*>([\s\S]*?)<\/[a-z]+>/i)
  const company = cleanText(companyMatch?.[1] || '')

  // Extract location
  const locationMatch = cardHtml.match(/class="companyLocation"[^>]*>([\s\S]*?)<\/div>/i)
  const location = cleanText(locationMatch?.[1] || '')

  // Extract job link
  const linkMatch = cardHtml.match(/href="(\/rc\/clk[^"]+)"/i)
  const relativeLink = linkMatch?.[1] || ''
  const link = relativeLink ? `https://www.indeed.com${relativeLink}` : ''

  // Extract description snippet
  const snippetMatch = cardHtml.match(/class="[^"]*job-snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  const descriptionSnippet = cleanText(snippetMatch?.[1] || '')

  // Extract posted date
  const dateMatch = cardHtml.match(/class="date[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  const postedDateText = cleanText(dateMatch?.[1] || '')
  const postedDate = parseRelativeDate(postedDateText)

  return {
    title,
    company,
    location,
    link,
    descriptionSnippet,
    postedDate,
    source: 'Indeed'
  }
}

// Alternative HTML parsing if the main approach fails
function parseIndeedAlternative(htmlContent) {
  const jobs = []

  // Try to find JSON data embedded in the page (Indeed sometimes includes this)
  const jsonPattern = /window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{[\s\S]*?\});/
  const jsonMatch = htmlContent.match(jsonPattern)

  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[1])
      const jobResults = jsonData?.metaData?.mosaicProviderJobCardsModel?.results || []

      for (const result of jobResults.slice(0, 20)) {
        jobs.push({
          title: result.displayTitle || result.title || '',
          company: result.company || '',
          location: result.formattedLocation || result.location || '',
          link: result.thirdPartyApplyUrl || `https://www.indeed.com/viewjob?jk=${result.jobkey}`,
          descriptionSnippet: result.snippet || result.displaySnippet || '',
          postedDate: result.pubDate ? new Date(result.pubDate).toISOString() : new Date().toISOString(),
          source: 'Indeed'
        })
      }
    } catch (parseError) {
      console.error('Could not parse embedded JSON:', parseError)
    }
  }

  return jobs
}

// Clean HTML tags and extra whitespace from text
function cleanText(rawText) {
  return rawText
    .replace(/<[^>]+>/g, '')      // Remove HTML tags
    .replace(/&amp;/g, '&')       // Decode HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')         // Collapse whitespace
    .trim()
}

// Convert "Posted X days ago" text to an ISO date string
function parseRelativeDate(dateText) {
  const today = new Date()
  const lowerText = dateText.toLowerCase()

  if (lowerText.includes('today') || lowerText.includes('just posted') || lowerText.includes('active')) {
    return today.toISOString()
  }

  const daysMatch = lowerText.match(/(\d+)\s*day/)
  if (daysMatch) {
    const daysAgo = parseInt(daysMatch[1])
    today.setDate(today.getDate() - daysAgo)
    return today.toISOString()
  }

  const hoursMatch = lowerText.match(/(\d+)\s*hour/)
  if (hoursMatch) {
    today.setHours(today.getHours() - parseInt(hoursMatch[1]))
    return today.toISOString()
  }

  return new Date().toISOString()
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
