// auth.js
// Handles all Supabase authentication: signup, login, logout, and session management.
// Also handles saving and updating user preferences in the database.

import { createClient } from '@supabase/supabase-js'

// Initialize the Supabase client using environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Sign up a new user with email and password
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

// Log in an existing user with email and password
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// Log out the current user
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Get the currently logged-in user session
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

// Save user preferences to the database (called after signup or when editing preferences)
export async function savePreferences(userId, preferences) {
  const { data, error } = await supabase
    .from('preferences')
    .upsert({
      user_id: userId,
      roles: preferences.roles,
      keywords: preferences.keywords,
      location: preferences.location,
      experience_level: preferences.experienceLevel,
      tech_stack: preferences.techStack,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

  if (error) throw error
  return data
}

// Load user preferences from the database
export async function getPreferences(userId) {
  const { data, error } = await supabase
    .from('preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}
