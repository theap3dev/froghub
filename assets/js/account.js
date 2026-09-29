const config = window.FROGHUB_SUPABASE_CONFIG;
const accountFeedback = document.querySelector('#account-feedback');
const signoutButton = document.querySelector('#account-signout');
const avatarImage = document.querySelector('#account-avatar');
const avatarFallback = document.querySelector('#account-avatar-fallback');
const avatarInput = document.querySelector('#avatar-input');
const avatarSaveButton = document.querySelector('#avatar-save');
const supabaseClient = config && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;
const avatarExtensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};
const maxAvatarSize = 5 * 1024 * 1024;
let currentUser = null;
let currentAvatarPath = null;
let previewUrl = null;

function showFeedback(message, isError = false) {
    accountFeedback.textContent = message;
    accountFeedback.classList.toggle('is-error', isError);
}

function setAvatarPreview(url, username = '') {
    avatarImage.hidden = !url;
    avatarFallback.hidden = Boolean(url);
    avatarFallback.textContent = username.charAt(0).toUpperCase();
    if (url) avatarImage.src = url;
    else avatarImage.removeAttribute('src');
}

function revokePreviewUrl() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
}

function isMissingAvatarPath(error) {
    return error?.code === '42703' || error?.code === 'PGRST204';
}

async function loadAccount() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (!data.session) {
            window.location.replace('index.html');
            return;
        }

        const user = data.session.user;
        const fallbackUsername = user.user_metadata?.username || 'Not set';
        document.querySelector('#account-username').textContent = fallbackUsername;
        document.querySelector('#account-email').textContent = user.email || 'Not set';
        setAvatarPreview('', fallbackUsername);

        let { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('username, avatar_path')
            .eq('id', user.id)
            .maybeSingle();
        if (isMissingAvatarPath(profileError)) {
            const fallbackProfile = await supabaseClient
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .maybeSingle();
            profile = fallbackProfile.data;
            profileError = fallbackProfile.error;
            if (!profileError) showFeedback('Run database/schema.sql in Supabase to enable profile photos.');
        }
        if (profileError) throw profileError;

        currentUser = user;
        currentAvatarPath = profile?.avatar_path || null;
        const username = profile?.username || fallbackUsername;
        document.querySelector('#account-username').textContent = username;
        const avatarUrl = currentAvatarPath
            ? supabaseClient.storage.from('avatars').getPublicUrl(currentAvatarPath).data.publicUrl
            : '';
        setAvatarPreview(avatarUrl, username);
    } catch (error) {
        showFeedback(error.message || 'Could not load your account.', true);
    }
}

if (!supabaseClient) {
    showFeedback('Could not connect to Supabase. Return to the feed and check the configuration.', true);
    signoutButton.disabled = true;
    avatarInput.disabled = true;
    avatarSaveButton.disabled = true;
} else {
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            window.location.replace('index.html');
        }
    });
    loadAccount();
}

avatarInput.addEventListener('change', () => {
    const file = avatarInput.files?.[0];
    if (!file) {
        revokePreviewUrl();
        avatarSaveButton.disabled = true;
        setAvatarPreview(currentAvatarPath
            ? supabaseClient.storage.from('avatars').getPublicUrl(currentAvatarPath).data.publicUrl
            : '', currentUser?.user_metadata?.username || '');
        return;
    }

    if (!avatarExtensions[file.type] || file.size > maxAvatarSize) {
        avatarInput.value = '';
        avatarSaveButton.disabled = true;
        showFeedback('Choose a JPEG, PNG, or WebP image smaller than 5 MB.', true);
        return;
    }

    revokePreviewUrl();
    previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl, currentUser?.user_metadata?.username || '');
    avatarSaveButton.disabled = false;
    showFeedback('');
});

avatarSaveButton.addEventListener('click', async () => {
    const file = avatarInput.files?.[0];
    if (!supabaseClient || !currentUser || !file) return;

    avatarSaveButton.disabled = true;
    avatarSaveButton.textContent = 'Uploading...';
    showFeedback('');

    const bucket = supabaseClient.storage.from('avatars');
    const filePath = `${currentUser.id}/${crypto.randomUUID()}.${avatarExtensions[file.type]}`;

    try {
        const { error: uploadError } = await bucket.upload(filePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
        });
        if (uploadError) throw uploadError;

        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({ avatar_path: filePath })
            .eq('id', currentUser.id);
        if (profileError) {
            await bucket.remove([filePath]);
            throw profileError;
        }

        const previousAvatarPath = currentAvatarPath;
        currentAvatarPath = filePath;
        avatarInput.value = '';
        revokePreviewUrl();
        setAvatarPreview(bucket.getPublicUrl(filePath).data.publicUrl, currentUser.user_metadata?.username || '');
        showFeedback('Profile photo updated.');
        if (previousAvatarPath) await bucket.remove([previousAvatarPath]);
    } catch (error) {
        showFeedback(error.message || 'Could not update your profile photo.', true);
        avatarSaveButton.disabled = false;
    } finally {
        avatarSaveButton.textContent = 'Save photo';
    }
});

signoutButton.addEventListener('click', async () => {
    if (!supabaseClient) return;

    signoutButton.disabled = true;
    const { error } = await supabaseClient.auth.signOut();
    signoutButton.disabled = false;

    if (error) showFeedback(error.message, true);
});