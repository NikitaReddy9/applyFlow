// App.jsx
// The entire single-page application lives here.
// Views: Auth (Login/Signup) → Preferences Setup → Home Dashboard → (modals for email)
// Navigation between sections is done by scrolling on the same page after login.

import React, { useState, useEffect, useRef } from 'react'
import { supabase, signIn, signUp, signOut, savePreferences, getPreferences } from './auth.js'
import {
  getSavedJobs, fetchJobs, findContacts, generateEmail,
  sendEmail, getApplications, createApplication,
  updateApplicationStatus, updateEmailSentStatus
} from './api.js'

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState('auth') // 'auth' | 'preferences' | 'home'
  const [user, setUser] = useState(null)
  const [preferences, setPreferences] = useState(null)

  // Listen for auth state changes (login/logout)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // When user logs in, check if they have preferences saved
  useEffect(() => {
    if (user) {
      getPreferences(user.id).then(prefs => {
        if (prefs) {
          setPreferences(prefs)
          setCurrentView('home')
        } else {
          setCurrentView('preferences')
        }
      }).catch(() => {
        setCurrentView('preferences')
      })
    } else if (!loading) {
      setCurrentView('auth')
    }
  }, [user, loading])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading ApplyFlow AI...</p>
      </div>
    )
  }

  if (currentView === 'auth') {
    return <AuthScreen onSuccess={() => {}} />
  }

  if (currentView === 'preferences') {
    return (
      <PreferencesScreen
        user={user}
        onComplete={(prefs) => {
          setPreferences(prefs)
          setCurrentView('home')
        }}
      />
    )
  }

  return (
    <HomeScreen
      user={user}
      preferences={preferences}
      onPreferencesUpdate={(prefs) => setPreferences(prefs)}
    />
  )
}

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (isLogin) {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="brand-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563EB"/>
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>ApplyFlow AI</span>
          </div>
          <h1>Land your dream job,<br />on autopilot.</h1>
          <p>AI-powered job discovery, personalized outreach emails, and smart application tracking — all in one place.</p>

          <div className="auth-features">
            <div className="auth-feature-item">
              <div className="feature-icon">🔍</div>
              <div>
                <strong>Auto Job Discovery</strong>
                <p>Finds matching jobs from Indeed automatically</p>
              </div>
            </div>
            <div className="auth-feature-item">
              <div className="feature-icon">✉️</div>
              <div>
                <strong>AI-Written Emails</strong>
                <p>Personalized cold emails to recruiters</p>
              </div>
            </div>
            <div className="auth-feature-item">
              <div className="feature-icon">📊</div>
              <div>
                <strong>Application Tracker</strong>
                <p>Track every application with status updates</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-subtitle">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button className="auth-toggle-btn" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? 'Sign up free' : 'Log in'}
            </button>
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <button type="submit" className="btn-primary btn-full" disabled={isLoading}>
              {isLoading ? 'Please wait...' : (isLogin ? 'Sign in' : 'Create account')}
            </button>
          </form>

          <p className="auth-disclaimer">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── PREFERENCES SCREEN ───────────────────────────────────────────────────────

function PreferencesScreen({ user, onComplete }) {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    roles: '',
    keywords: '',
    location: '',
    experienceLevel: 'Mid-level',
    techStack: ''
  })

  function updateField(field, value) {
    setFormData(previous => ({ ...previous, [field]: value }))
  }

  async function handleComplete() {
    setIsLoading(true)
    setError('')
    try {
      await savePreferences(user.id, formData)
      onComplete(formData)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="preferences-container">
      <div className="preferences-card">
        <div className="preferences-header">
          <div className="brand-logo small">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563EB"/>
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>ApplyFlow AI</span>
          </div>
          <div className="preferences-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: step === 1 ? '50%' : '100%' }}></div>
            </div>
            <span>Step {step} of 2</span>
          </div>
        </div>

        {step === 1 && (
          <div className="preferences-step">
            <h2>What kind of roles are you looking for?</h2>
            <p>We'll use this to automatically find matching jobs for you.</p>

            <div className="form-group">
              <label>Job Titles / Roles</label>
              <input
                type="text"
                value={formData.roles}
                onChange={(e) => updateField('roles', e.target.value)}
                placeholder="e.g. Software Engineer, Frontend Developer, Product Manager"
              />
              <span className="form-hint">Separate multiple roles with commas</span>
            </div>

            <div className="form-group">
              <label>Keywords</label>
              <input
                type="text"
                value={formData.keywords}
                onChange={(e) => updateField('keywords', e.target.value)}
                placeholder="e.g. React, TypeScript, remote, startup"
              />
            </div>

            <div className="form-group">
              <label>Preferred Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="e.g. San Francisco, CA or Remote"
              />
            </div>

            <button className="btn-primary" onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="preferences-step">
            <h2>Tell us about your experience</h2>
            <p>This helps us match you with the right level roles.</p>

            <div className="form-group">
              <label>Experience Level</label>
              <div className="radio-group">
                {['Entry-level', 'Mid-level', 'Senior', 'Lead / Manager', 'Executive'].map(level => (
                  <button
                    key={level}
                    className={`radio-option ${formData.experienceLevel === level ? 'selected' : ''}`}
                    onClick={() => updateField('experienceLevel', level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Tech Stack / Skills</label>
              <input
                type="text"
                value={formData.techStack}
                onChange={(e) => updateField('techStack', e.target.value)}
                placeholder="e.g. React, Node.js, Python, AWS, Figma"
              />
              <span className="form-hint">List your main skills separated by commas</span>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div className="pref-btn-row">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary" onClick={handleComplete} disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Start Finding Jobs 🚀'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── HOME SCREEN (MAIN DASHBOARD) ────────────────────────────────────────────

function HomeScreen({ user, preferences, onPreferencesUpdate }) {
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [visibleJobCount, setVisibleJobCount] = useState(5)
  const [isFetchingJobs, setIsFetchingJobs] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [showPrefsModal, setShowPrefsModal] = useState(false)
  const [emailModal, setEmailModal] = useState(null) // { application, job }
  const [appliedJobIds, setAppliedJobIds] = useState(new Set())
  const [notification, setNotification] = useState(null)

  const jobsSectionRef = useRef(null)
  const trackerSectionRef = useRef(null)

  // Load jobs and applications when the component mounts
  useEffect(() => {
    loadAllData()
  }, [user.id])

  async function loadAllData() {
    setIsLoadingData(true)
    try {
      const [savedJobs, savedApplications] = await Promise.all([
        getSavedJobs(user.id),
        getApplications(user.id)
      ])
      setJobs(savedJobs || [])
      setApplications(savedApplications || [])

      // Track which jobs already have applications so we can show "Applied" state
      const appliedSet = new Set((savedApplications || []).map(app => app.job_id))
      setAppliedJobIds(appliedSet)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setIsLoadingData(false)
    }
  }

  // Trigger AI job discovery
  async function handleFetchJobs() {
    setIsFetchingJobs(true)
    try {
      const result = await fetchJobs(preferences)
      showNotification(`Found ${result.count || 0} new jobs!`, 'success')
      await loadAllData()
    } catch (error) {
      showNotification('Error fetching jobs. Please try again.', 'error')
    } finally {
      setIsFetchingJobs(false)
    }
  }

  // When user clicks "Applied" on a job card
  async function handleMarkApplied(job) {
    if (appliedJobIds.has(job.id)) return // Already applied

    try {
      const newApplication = await createApplication(user.id, job)
      setApplications(previous => [newApplication, ...previous])
      setAppliedJobIds(previous => new Set([...previous, job.id]))
      showNotification(`Application tracked for ${job.company}!`, 'success')

      // Scroll to tracker section
      setTimeout(() => {
        trackerSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 500)
    } catch (error) {
      showNotification('Error tracking application.', 'error')
    }
  }

  // Update application status in the tracker
  async function handleStatusUpdate(applicationId, newStatus) {
    try {
      const updated = await updateApplicationStatus(applicationId, newStatus)
      setApplications(previous =>
        previous.map(app => app.id === applicationId ? updated : app)
      )
    } catch (error) {
      showNotification('Error updating status.', 'error')
    }
  }

  // Update email sent status
  async function handleEmailSentUpdate(applicationId, sent) {
    try {
      const updated = await updateEmailSentStatus(applicationId, sent)
      setApplications(previous =>
        previous.map(app => app.id === applicationId ? updated : app)
      )
    } catch (error) {
      showNotification('Error updating email status.', 'error')
    }
  }

  function showNotification(message, type = 'info') {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const visibleJobs = jobs.slice(0, visibleJobCount)
  const hasMoreJobs = visibleJobCount < jobs.length

  return (
    <div className="home-container">
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563EB"/>
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>ApplyFlow AI</span>
          </div>
        </div>
        <nav className="header-nav">
          <button onClick={() => jobsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Jobs
          </button>
          <button onClick={() => trackerSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Applications
          </button>
        </nav>
        <div className="header-right">
          <div className="user-menu-wrapper">
            <button className="user-avatar-btn" onClick={() => setShowPrefsModal(true)}>
              <div className="user-avatar">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* ── NOTIFICATION TOAST ── */}
      {notification && (
        <div className={`toast toast-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <main className="main-content">

        {/* ── HERO STATS SECTION ── */}
        <section className="hero-section">
          <div className="hero-text">
            <h1>Your Job Dashboard</h1>
            <p>AI-powered job discovery and application tracking</p>
          </div>
          <div className="hero-stats">
            <div className="stat-chip">
              <span className="stat-number">{jobs.length}</span>
              <span className="stat-label">Jobs Found</span>
            </div>
            <div className="stat-chip">
              <span className="stat-number">{applications.length}</span>
              <span className="stat-label">Applications</span>
            </div>
            <div className="stat-chip">
              <span className="stat-number">
                {applications.filter(app => app.email_sent).length}
              </span>
              <span className="stat-label">Emails Sent</span>
            </div>
            <div className="stat-chip">
              <span className="stat-number">
                {applications.filter(app => app.status === 'Shortlisted').length}
              </span>
              <span className="stat-label">Shortlisted</span>
            </div>
          </div>
        </section>

        {/* ── JOBS SECTION ── */}
        <section className="section" ref={jobsSectionRef}>
          <div className="section-header">
            <div>
              <h2>Latest Jobs</h2>
              <p className="section-subtitle">
                Matched to your preferences · {jobs.length} jobs found
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={handleFetchJobs}
              disabled={isFetchingJobs}
            >
              {isFetchingJobs ? (
                <>
                  <span className="btn-spinner"></span>
                  Searching...
                </>
              ) : (
                '🔍 Find New Jobs'
              )}
            </button>
          </div>

          {isLoadingData ? (
            <div className="loading-grid">
              {[1,2,3,4,5].map(i => <div key={i} className="job-card-skeleton"></div>)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <h3>No jobs found yet</h3>
              <p>Click "Find New Jobs" to discover opportunities matching your preferences</p>
              <button className="btn-primary" onClick={handleFetchJobs} disabled={isFetchingJobs}>
                {isFetchingJobs ? 'Searching...' : 'Find Jobs Now'}
              </button>
            </div>
          ) : (
            <>
              <div className="jobs-grid">
                {visibleJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isApplied={appliedJobIds.has(job.id)}
                    onApply={() => handleMarkApplied(job)}
                  />
                ))}
              </div>

              <div className="show-more-row">
                {hasMoreJobs && (
                  <button
                    className="btn-secondary"
                    onClick={() => setVisibleJobCount(count => count + 5)}
                  >
                    Show More ({jobs.length - visibleJobCount} remaining) ↓
                  </button>
                )}
                {visibleJobCount > 5 && (
                  <button
                    className="btn-ghost"
                    onClick={() => setVisibleJobCount(5)}
                  >
                    Show Less ↑
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── APPLICATION TRACKER SECTION ── */}
        <section className="section" ref={trackerSectionRef}>
          <div className="section-header">
            <div>
              <h2>Application Tracker</h2>
              <p className="section-subtitle">
                {applications.length} application{applications.length !== 1 ? 's' : ''} tracked
              </p>
            </div>
          </div>

          {applications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No applications yet</h3>
              <p>Click "Applied" on a job card above to start tracking your applications</p>
            </div>
          ) : (
            <ApplicationTracker
              applications={applications}
              onStatusUpdate={handleStatusUpdate}
              onEmailSentUpdate={handleEmailSentUpdate}
              onOpenEmail={(application) => setEmailModal({ application })}
            />
          )}
        </section>
      </main>

      {/* ── PREFERENCES MODAL ── */}
      {showPrefsModal && (
        <PreferencesModal
          user={user}
          currentPreferences={preferences}
          onClose={() => setShowPrefsModal(false)}
          onSave={(newPrefs) => {
            onPreferencesUpdate(newPrefs)
            setShowPrefsModal(false)
            showNotification('Preferences updated!', 'success')
          }}
          onSignOut={async () => {
            await signOut()
          }}
        />
      )}

      {/* ── EMAIL MODAL ── */}
      {emailModal && (
        <EmailModal
          application={emailModal.application}
          onClose={() => setEmailModal(null)}
          onEmailSent={() => {
            handleEmailSentUpdate(emailModal.application.id, true)
            setEmailModal(null)
            showNotification('Email sent successfully!', 'success')
          }}
          userEmail={user.email}
        />
      )}
    </div>
  )
}

// ─── JOB CARD COMPONENT ───────────────────────────────────────────────────────

function JobCard({ job, isApplied, onApply }) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate how long ago the job was posted
  function getTimeAgo(dateString) {
    if (!dateString) return 'Recently'
    const posted = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now - posted) / (1000 * 60 * 60 * 24))
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays}d ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`
    return `${Math.floor(diffInDays / 30)}mo ago`
  }

  // Get a color for the match score badge
  function getMatchColor(score) {
    if (score >= 80) return 'match-high'
    if (score >= 60) return 'match-medium'
    return 'match-low'
  }

  return (
    <div className={`job-card ${isApplied ? 'job-card-applied' : ''}`}>
      <div className="job-card-header">
        <div className="job-company-logo">
          {job.company?.charAt(0).toUpperCase()}
        </div>
        <div className="job-card-title-group">
          <h3 className="job-title">{job.title}</h3>
          <p className="job-company">{job.company}</p>
        </div>
        {job.match_score && (
          <div className={`match-badge ${getMatchColor(job.match_score)}`}>
            {job.match_score}% match
          </div>
        )}
      </div>

      <div className="job-card-meta">
        <span className="job-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          {job.location || 'Remote'}
        </span>
        <span className="job-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {getTimeAgo(job.posted_date)}
        </span>
        {job.source && (
          <span className="job-source-badge">{job.source}</span>
        )}
      </div>

      {job.description_snippet && (
        <p className="job-description">
          {isExpanded ? job.description_snippet : `${job.description_snippet?.slice(0, 120)}...`}
          <button className="text-btn" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? ' less' : ' more'}
          </button>
        </p>
      )}

      <div className="job-card-actions">
        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary btn-small"
        >
          View Job ↗
        </a>
        <button
          className={`btn-small ${isApplied ? 'btn-applied' : 'btn-primary'}`}
          onClick={onApply}
          disabled={isApplied}
        >
          {isApplied ? '✓ Applied' : 'Mark Applied'}
        </button>
      </div>
    </div>
  )
}

// ─── APPLICATION TRACKER TABLE ────────────────────────────────────────────────

function ApplicationTracker({ applications, onStatusUpdate, onEmailSentUpdate, onOpenEmail }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const itemsPerPage = 8
  const statusOptions = ['Applied', 'Pending', 'Shortlisted', 'Interviewing', 'Offered', 'Rejected']
  const filterOptions = ['All', 'Applied', 'Pending', 'Shortlisted', 'Interviewing', 'Offered', 'Rejected']

  // Filter applications based on search and status filter
  const filteredApplications = applications.filter(app => {
    const matchesSearch =
      app.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.role?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = statusFilter === 'All' || app.status === statusFilter
    return matchesSearch && matchesFilter
  })

  // Paginate results
  const totalPages = Math.ceil(filteredApplications.length / itemsPerPage)
  const paginatedApplications = filteredApplications.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  function getStatusClass(status) {
    const map = {
      'Applied': 'status-applied',
      'Pending': 'status-pending',
      'Shortlisted': 'status-shortlisted',
      'Interviewing': 'status-interviewing',
      'Offered': 'status-offered',
      'Rejected': 'status-rejected'
    }
    return map[status] || 'status-applied'
  }

  function formatDate(dateString) {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="tracker-container">
      {/* Filter Tabs + Search */}
      <div className="tracker-toolbar">
        <div className="filter-tabs">
          {filterOptions.map(filter => (
            <button
              key={filter}
              className={`filter-tab ${statusFilter === filter ? 'filter-tab-active' : ''}`}
              onClick={() => { setStatusFilter(filter); setCurrentPage(1) }}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="tracker-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="tracker-table-wrapper">
        <table className="tracker-table">
          <thead>
            <tr>
              <th style={{width: '40px'}}></th>
              <th>Company Name</th>
              <th>Job Title</th>
              <th>Applied Date</th>
              <th>Email</th>
              <th>Stage</th>
              <th style={{width: '40px'}}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedApplications.map(application => (
              <tr key={application.id}>
                <td>
                  <input type="checkbox" className="row-checkbox" />
                </td>
                <td>
                  <div className="company-cell">
                    <div className="company-avatar">
                      {application.company?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="company-name">{application.company}</div>
                      <div className="company-location">{application.location}</div>
                    </div>
                  </div>
                </td>
                <td className="role-cell">{application.role}</td>
                <td className="date-cell">{formatDate(application.applied_date)}</td>
                <td>
                  <button
                    className={`email-status-btn ${application.email_sent ? 'email-sent' : 'email-not-sent'}`}
                    onClick={() => onOpenEmail(application)}
                    title={application.email_sent ? 'Email sent — click to resend' : 'Send email'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {application.email_sent ? 'Sent' : 'Send'}
                  </button>
                </td>
                <td>
                  <div className="status-cell">
                    <button
                      className={`status-badge ${getStatusClass(application.status)}`}
                      onClick={() => setOpenStatusDropdown(
                        openStatusDropdown === application.id ? null : application.id
                      )}
                    >
                      <span className="status-dot"></span>
                      {application.status}
                    </button>
                    {openStatusDropdown === application.id && (
                      <div className="status-dropdown">
                        {statusOptions.map(option => (
                          <button
                            key={option}
                            className={`status-option ${application.status === option ? 'status-option-active' : ''}`}
                            onClick={() => {
                              onStatusUpdate(application.id, option)
                              setOpenStatusDropdown(null)
                            }}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <a
                    href={application.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row-action-btn"
                    title="View job posting"
                  >
                    ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="tracker-pagination">
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>
          <div className="pagination-pages">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`pagination-page ${currentPage === page ? 'pagination-page-active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            {totalPages > 5 && <span className="pagination-ellipsis">...</span>}
          </div>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── EMAIL MODAL ──────────────────────────────────────────────────────────────

function EmailModal({ application, onClose, onEmailSent, userEmail }) {
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState(`Application: ${application.role} at ${application.company}`)
  const [emailBody, setEmailBody] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  // Auto-generate email on modal open
  useEffect(() => {
    handleGenerateEmail()
  }, [])

  async function handleGenerateEmail() {
    setIsGenerating(true)
    setError('')
    try {
      const result = await generateEmail(
        { title: application.role, company: application.company, location: application.location },
        { email: emailTo, name: 'Hiring Manager' },
        '',
        'cold'
      )
      setEmailBody(result.body || result.email || '')
      setEmailSubject(result.subject || emailSubject)
      setEmailTo(result.contactEmail || '')
    } catch (err) {
      // Use a default email template if AI fails
      setEmailBody(
        `Hi,\n\nI hope this message finds you well. I recently came across the ${application.role} opening at ${application.company} and I'm very excited about the opportunity.\n\nI believe my skills and experience make me a strong candidate for this role. I'd love to discuss how I can contribute to your team.\n\nWould you be available for a quick call this week?\n\nBest regards,\n${userEmail?.split('@')[0]}`
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSend() {
    if (!emailTo) {
      setError('Please enter a recipient email address.')
      return
    }
    setIsSending(true)
    setError('')
    try {
      await sendEmail({
        to: emailTo,
        cc: emailCc,
        subject: emailSubject,
        body: emailBody,
        applicationId: application.id
      })
      onEmailSent()
    } catch (err) {
      setError(err.message || 'Failed to send email. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="email-modal">
        {/* Modal Header */}
        <div className="email-modal-header">
          <h2>New Message</h2>
          <div className="email-modal-header-actions">
            <button className="modal-icon-btn" title="Minimize">—</button>
            <button className="modal-icon-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Email Fields */}
        <div className="email-fields">
          <div className="email-field-row">
            <label>From</label>
            <div className="email-from-display">
              <div className="from-avatar">{userEmail?.charAt(0).toUpperCase()}</div>
              <span>{userEmail}</span>
            </div>
          </div>

          <div className="email-field-row">
            <label>To</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="recruiter@company.com"
              className="email-field-input"
            />
          </div>

          <div className="email-field-row">
            <label>Cc</label>
            <input
              type="email"
              value={emailCc}
              onChange={(e) => setEmailCc(e.target.value)}
              placeholder="optional"
              className="email-field-input"
            />
          </div>

          <div className="email-field-row">
            <label>Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="email-field-input"
            />
          </div>
        </div>

        {/* Email Body */}
        <div className="email-body-area">
          {isGenerating ? (
            <div className="email-generating">
              <div className="loading-spinner small"></div>
              <p>AI is writing your personalized email...</p>
            </div>
          ) : (
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="email-body-textarea"
              placeholder="Your email will appear here..."
            />
          )}
        </div>

        {error && <div className="email-error">{error}</div>}

        {/* Toolbar */}
        <div className="email-toolbar">
          <div className="email-format-tools">
            <span className="format-label">Body</span>
            <div className="format-divider"></div>
            <button className="format-btn bold-btn" title="Bold">B</button>
            <button className="format-btn italic-btn" title="Italic">I</button>
            <button className="format-btn underline-btn" title="Underline">U</button>
            <div className="format-divider"></div>
            <button className="format-btn" title="Bulleted list">☰</button>
            <button className="format-btn" title="Numbered list">☷</button>
            <div className="format-divider"></div>
            <button className="format-btn" title="Align left">⬤</button>
            <button className="format-btn" title="Link">🔗</button>
          </div>
          <button className="format-btn" title="Regenerate with AI" onClick={handleGenerateEmail}>
            ✨ Regenerate
          </button>
        </div>

        {/* Footer Actions */}
        <div className="email-footer">
          <div className="email-footer-left">
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={isSending || isGenerating}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
            <button className="email-icon-btn" title="Schedule">📅</button>
            <button className="email-icon-btn" title="Attach file">📎</button>
          </div>
          <button className="email-delete-btn" onClick={onClose} title="Discard">🗑</button>
        </div>
      </div>
    </div>
  )
}

// ─── PREFERENCES MODAL ────────────────────────────────────────────────────────

function PreferencesModal({ user, currentPreferences, onClose, onSave, onSignOut }) {
  const [formData, setFormData] = useState({
    roles: currentPreferences?.roles || '',
    keywords: currentPreferences?.keywords || '',
    location: currentPreferences?.location || '',
    experienceLevel: currentPreferences?.experience_level || 'Mid-level',
    techStack: currentPreferences?.tech_stack || ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('preferences')

  function updateField(field, value) {
    setFormData(previous => ({ ...previous, [field]: value }))
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await savePreferences(user.id, formData)
      onSave(formData)
    } catch (error) {
      console.error('Error saving preferences:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="prefs-modal">
        <div className="prefs-modal-header">
          <h2>Account Settings</h2>
          <button className="modal-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="prefs-tabs">
          <button
            className={`prefs-tab ${activeTab === 'preferences' ? 'prefs-tab-active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            Job Preferences
          </button>
          <button
            className={`prefs-tab ${activeTab === 'account' ? 'prefs-tab-active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
        </div>

        {activeTab === 'preferences' && (
          <div className="prefs-modal-body">
            <div className="form-group">
              <label>Job Titles / Roles</label>
              <input
                type="text"
                value={formData.roles}
                onChange={(e) => updateField('roles', e.target.value)}
                placeholder="e.g. Software Engineer, Frontend Developer"
              />
            </div>
            <div className="form-group">
              <label>Keywords</label>
              <input
                type="text"
                value={formData.keywords}
                onChange={(e) => updateField('keywords', e.target.value)}
                placeholder="e.g. React, TypeScript, remote"
              />
            </div>
            <div className="form-group">
              <label>Preferred Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="e.g. San Francisco, CA or Remote"
              />
            </div>
            <div className="form-group">
              <label>Experience Level</label>
              <div className="radio-group">
                {['Entry-level', 'Mid-level', 'Senior', 'Lead / Manager'].map(level => (
                  <button
                    key={level}
                    className={`radio-option ${formData.experienceLevel === level ? 'selected' : ''}`}
                    onClick={() => updateField('experienceLevel', level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Tech Stack / Skills</label>
              <input
                type="text"
                value={formData.techStack}
                onChange={(e) => updateField('techStack', e.target.value)}
                placeholder="e.g. React, Node.js, Python, AWS"
              />
            </div>
            <div className="prefs-modal-footer">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div className="prefs-modal-body">
            <div className="account-info">
              <div className="account-avatar">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="account-email">{user.email}</p>
                <p className="account-since">Member since {new Date(user.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <button className="btn-danger" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
