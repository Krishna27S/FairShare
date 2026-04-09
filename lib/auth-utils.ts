import { supabase, User } from './supabase';

async function ensureUserProfile(
  authUser: any,
  role: 'individual' | 'organisation' = 'individual'
) {
  if (!authUser?.id || !authUser?.email) return;

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existingProfileError) throw existingProfileError;
  if (existingProfile) return;

  const fullName = authUser.user_metadata?.full_name ?? null;
  const monthlyBudget = role === 'individual' ? 15000 : null;

  const { error: insertError } = await supabase.from('users').insert({
    id: authUser.id,
    email: authUser.email,
    full_name: fullName,
    role,
    monthly_budget: monthlyBudget,
    notifications_enabled: true,
  });

  if (insertError) throw insertError;
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  role: 'individual' | 'organisation' = 'individual'
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) throw error;

  // Best-effort profile creation; sign-in flow will heal if this fails.
  if (data.user) {
    try {
      await ensureUserProfile(
        {
          ...data.user,
          user_metadata: {
            ...data.user.user_metadata,
            full_name: fullName,
          },
        },
        role
      );
    } catch (profileError) {
      console.warn('[v0] Delayed profile creation after sign up:', profileError);
    }
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  if (data.user) {
    await ensureUserProfile(data.user);
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

export async function updateUserProfile(userId: string, updates: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function onAuthStateChange(callback: (user: any) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });

  return subscription;
}
