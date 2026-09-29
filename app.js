const authForm = document.querySelector('#auth-form');
const authPanel = document.querySelector('#auth-panel');
const homeDashboard = document.querySelector('#home-dashboard');
const usernameField = document.querySelector('#username-field');
const usernameInput = document.querySelector('#username');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('#submit-button');
const feedback = document.querySelector('#feedback');
const accountLink = document.querySelector('#account-link');
const configNote = document.querySelector('#config-note');
const modeTabs = document.querySelectorAll('.auth-tab');

const supabaseConfig = window.FROGHUB_SUPABASE_CONFIG;
const hasConfig = Boolean(supabaseConfig?.url.startsWith('https://')
    && !supabaseConfig.url.includes('YOUR_')
    && !supabaseConfig.anonKey.includes('YOUR_'));
const supabaseClient = hasConfig && window.supabase
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

let mode = 'signin';

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
}

function setMode(nextMode) {
    mode = nextMode;
    const isSignup = mode === 'signup';

    usernameField.hidden = !isSignup;
    usernameInput.required = isSignup;
    passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
    submitButton.textContent = isSignup ? 'Create account' : 'Sign in';
    showFeedback('');

    modeTabs.forEach((tab) => {
        const isActive = tab.dataset.mode === mode;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });
}

modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

if (!supabaseClient) {
    configNote.hidden = false;
    submitButton.disabled = true;
    if (hasConfig) {
        configNote.textContent = 'Supabase could not load. Check your internet connection and reload.';
    }
} else {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        authPanel.hidden = Boolean(user);
        homeDashboard.hidden = !user;
        accountLink.hidden = !user;
    });
}

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    submitButton.disabled = true;
    showFeedback('');

    try {
        if (mode === 'signup') {
            const { data, error } = await supabaseClient.auth.signUp({
                email: emailInput.value.trim(),
                password: passwordInput.value,
                options: {
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
        showFeedback(error.message || 'Something went wrong. Please try again.', true);
    } finally {
        submitButton.disabled = false;
    }
});


