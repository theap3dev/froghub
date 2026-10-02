const authForm = document.querySelector('#auth-form');
const authPanel = document.querySelector('#auth-panel');
const homeDashboard = document.querySelector('#home-dashboard');
const usernameField = document.querySelector('#username-field');
const usernameInput = document.querySelector('#username');
const emailField = document.querySelector('#email-field');
const emailInput = document.querySelector('#email');
const passwordField = document.querySelector('#password-field');
const passwordInput = document.querySelector('#password');
const passwordLabel = document.querySelector('#password-label');
const submitButton = document.querySelector('#submit-button');
const forgotPasswordButton = document.querySelector('#forgot-password-button');
const feedback = document.querySelector('#feedback');
const accountLink = document.querySelector('#account-link');
const adminLink = document.querySelector('#admin-link');
const configNote = document.querySelector('#config-note');
const modeTabs = document.querySelectorAll('.auth-tab');
const authTabs = document.querySelector('.auth-tabs');

const supabaseConfig = window.FROGCHAT_SUPABASE_CONFIG;
const hasConfig = Boolean(supabaseConfig?.url.startsWith('https://')
    && !supabaseConfig.url.includes('YOUR_')
    && !supabaseConfig.anonKey.includes('YOUR_'));
const supabaseClient = hasConfig && window.supabase
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const authRedirectUrl = isLocalhost
    ? 'https://theap3dev.github.io/'
    : `${window.location.origin}${window.location.pathname}`;

let mode = 'signin';
let passwordRecovery = false;
let adminVisibilityCheck = 0;

function friendlyAuthError(error) {
    if (/email.*rate limit|rate limit.*email/i.test(error?.message || '')) {
        return 'Supabase temporarily limited confirmation emails. Wait before retrying, or configure custom SMTP in Supabase Auth.';
    }
    return error?.message || 'Something went wrong. Please try again.';
}

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
}

function setMode(nextMode) {
    passwordRecovery = false;
    mode = nextMode;
    const isSignup = mode === 'signup';

    authTabs.hidden = false;
    usernameField.hidden = !isSignup;
    usernameInput.required = isSignup;
    emailField.hidden = false;
    emailInput.required = true;
    passwordField.hidden = false;
    passwordLabel.textContent = 'Password';
    passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
    submitButton.textContent = isSignup ? 'Create account' : 'Sign in';
    forgotPasswordButton.hidden = isSignup;
    showFeedback('');

    modeTabs.forEach((tab) => {
        const isActive = tab.dataset.mode === mode;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });
}

function setPasswordRecoveryMode() {
    passwordRecovery = true;
    authPanel.hidden = false;
    homeDashboard.hidden = true;
    accountLink.hidden = true;
    authTabs.hidden = true;
    usernameField.hidden = true;
    usernameInput.required = false;
    emailField.hidden = true;
    emailInput.required = false;
    passwordField.hidden = false;
    passwordLabel.textContent = 'New password';
    passwordInput.value = '';
    passwordInput.autocomplete = 'new-password';
    submitButton.textContent = 'Update password';
    forgotPasswordButton.hidden = true;
    showFeedback('Enter a new password with at least 8 characters.');
}

modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

setMode(mode);

if (!supabaseClient) {
    configNote.hidden = false;
    submitButton.disabled = true;
    if (hasConfig) {
        configNote.textContent = 'Supabase could not load. Check your internet connection and reload.';
    }
} else {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            setPasswordRecoveryMode();
            return;
        }
        if (passwordRecovery && event !== 'SIGNED_OUT') return;

        const user = session?.user;
        const checkVersion = ++adminVisibilityCheck;
        adminLink.hidden = true;
        authPanel.hidden = Boolean(user);
        homeDashboard.hidden = !user;
        accountLink.hidden = !user;

        if (user) {
            queueMicrotask(() => {
                supabaseClient.rpc('is_moderator').then(({ data, error }) => {
                    if (checkVersion === adminVisibilityCheck) {
                        adminLink.hidden = Boolean(error || !data);
                    }
                });
            });
        }
    });
}

forgotPasswordButton.addEventListener('click', async () => {
    if (!supabaseClient || !emailInput.reportValidity()) return;

    forgotPasswordButton.disabled = true;
    showFeedback('');

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(emailInput.value.trim(), {
            redirectTo: authRedirectUrl
        });
        if (error) throw error;
        showFeedback('If an account exists for that email, a password reset link is on the way.');
    } catch (error) {
        showFeedback(error.message || 'Could not send a password reset link. Please try again.', true);
    } finally {
        forgotPasswordButton.disabled = false;
    }
});

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    submitButton.disabled = true;
    showFeedback('');

    try {
        if (passwordRecovery) {
            const { error } = await supabaseClient.auth.updateUser({
                password: passwordInput.value
            });
            if (error) throw error;

            passwordRecovery = false;
            setMode('signin');
            const { error: signOutError } = await supabaseClient.auth.signOut({ scope: 'local' });
            if (signOutError) throw signOutError;
            showFeedback('Password updated. Sign in with your new password.');
        } else if (mode === 'signup') {
            const { data, error } = await supabaseClient.auth.signUp({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                options: {
                    emailRedirectTo: authRedirectUrl,
                    data: { username: usernameInput.value.trim() }
                }
            });

            if (error) throw error;
            if (data.session) {
                showFeedback('Account created successfully.');
            } else {
                setMode('signin');
                showFeedback('Account created. Check your email to confirm it, then sign in.');
            }
        } else {
            const { error } = await supabaseClient.auth.signInWithPassword({
                email: emailInput.value.trim(),
                password: passwordInput.value
            });

            if (error) throw error;
            showFeedback('Signed in successfully.');
        }
    } catch (error) {
        showFeedback(friendlyAuthError(error), true);
    } finally {
        submitButton.disabled = false;
    }
});


