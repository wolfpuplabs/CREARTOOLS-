// ---- Supabase config ----
const SUPABASE_URL = 'https://ogmtrdzimqlxhzomnnzl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbXRyZHppbXFseGh6b21ubnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MjI4ODgsImV4cCI6MjA5NjI5ODg4OH0.fXdfuU7iELLJC2ZJXrQMBq3YxZd2hRQc7Mi2TjZR7N8';
const BUCKET = 'models';

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- DOM ----
const glbUpload = document.getElementById('glbUpload');
const usdzUpload = document.getElementById('usdzUpload');
const modelViewer = document.getElementById('model');
const shareBtn = document.getElementById('shareBtn');
const statusEl = document.getElementById('status');
const shareBox = document.getElementById('shareBox');
const shareLink = document.getElementById('shareLink');
const copyBtn = document.getElementById('copyBtn');

// UI specific labels
const glbFileText = document.getElementById('glbFileText');
const usdzFileText = document.getElementById('usdzFileText');

// Selected files (kept until user shares)
let glbFile = null;
let usdzFile = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || '';
  statusEl.style.color = isError ? 'var(--error-color)' : 'var(--text-muted)';
}

function refreshShareButton() {
  shareBtn.disabled = !(glbFile || usdzFile);
}

// ---- Local preview on selection ----
glbUpload.addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
    glbFile = file;
    glbFileText.textContent = file.name; // Update UI text
    glbFileText.style.color = 'var(--success-color)';
    modelViewer.setAttribute('src', URL.createObjectURL(file));
    setStatus('GLB ready. Add a USDZ too if you want iOS AR, then click Generate Share Link.');
  } else if (file) {
    alert('Please upload a .glb or .gltf file.');
  }
  refreshShareButton();
});

usdzUpload.addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (file && file.name.endsWith('.usdz')) {
    usdzFile = file;
    usdzFileText.textContent = file.name; // Update UI text
    usdzFileText.style.color = 'var(--success-color)';
    modelViewer.setAttribute('ios-src', URL.createObjectURL(file));
    setStatus('USDZ ready. Click Generate Share Link.');
  } else if (file) {
    alert('Please upload a .usdz file.');
  }
  refreshShareButton();
});

// ---- Upload one file to Supabase Storage, return its public URL ----
async function uploadToStorage(file, ext) {
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---- Share flow ----
shareBtn.addEventListener('click', async function () {
  if (!glbFile && !usdzFile) return;
  shareBtn.disabled = true;
  setStatus('Uploading… this may take a moment for large models.');

  try {
    let glbUrl = null;
    let usdzUrl = null;

    if (glbFile) {
      const ext = glbFile.name.endsWith('.gltf') ? 'gltf' : 'glb';
      glbUrl = await uploadToStorage(glbFile, ext);
    }
    if (usdzFile) {
      usdzUrl = await uploadToStorage(usdzFile, 'usdz');
    }

    const { data, error } = await sb
      .from('models')
      .insert({ glb_url: glbUrl, usdz_url: usdzUrl })
      .select()
      .single();
    if (error) throw error;

    const link = `${location.origin}${location.pathname}?id=${data.id}`;
    shareLink.value = link;
    shareBox.hidden = false;
    setStatus('Done! Anyone can open this link to view the model in AR.');
  } catch (err) {
    console.error(err);
    setStatus('Upload failed: ' + (err.message || err), true);
  } finally {
    shareBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async function () {
  try {
    await navigator.clipboard.writeText(shareLink.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
  } catch {
    shareLink.select();
    document.execCommand('copy');
  }
});

// ---- Load a shared model when the page opens with ?id=... ----
async function loadSharedModel() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return;

  setStatus('Loading shared model…');
  const { data, error } = await sb
    .from('models')
    .select('glb_url, usdz_url')
    .eq('id', id)
    .single();

  if (error || !data) {
    setStatus('Could not load this shared model.', true);
    return;
  }
  if (data.glb_url) modelViewer.setAttribute('src', data.glb_url);
  if (data.usdz_url) modelViewer.setAttribute('ios-src', data.usdz_url);
  setStatus('');
}

loadSharedModel();
