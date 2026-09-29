const config = window.FROGHUB_SUPABASE_CONFIG;
const accountFeedback = document.querySelector('#account-feedback');
const signoutButton = document.querySelector('#account-signout');
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

function showFeedback(message, isError = false) {
    accountFeedback.textContent = message;
    accountFeedback.classList.toggle('is-error', isError);
}

async function loadAccount() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        showFeedback(error.message, true);
    } else if (!data.session) {
        window.location.replace('index.html');
    } else {
        const user = data.session.user;
        document.querySelector('#account-username').textContent = user.user_metadata?.username || 'Not set';
        document.querySelector('#account-email').textContent = user.email || 'Not set';
    }
}

if (!supabaseClient) {
    showFeedback('Could not connect to Supabase. Return to the feed and check the configuration.', true);
    signoutButton.disabled = true;
} else {
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            window.location.replace('index.html');
        }
    });
    loadAccount();
}

signoutButton.addEventListener('click', async () => {
    if (!supabaseClient) return;

    signoutButton.disabled = true;
    const { error } = await supabaseClient.auth.signOut();
    signoutButton.disabled = false;

    if (error) showFeedback(error.message, true);
});