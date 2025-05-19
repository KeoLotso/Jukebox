import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/+esm';

const SUPABASE_URL = "https://apqeitnavsjwqrpruuqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwcWVpdG5hdnNqd3FycHJ1dXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxMDUzMzYsImV4cCI6MjA1OTY4MTMzNn0.G14iwTdC2qpCsRTw3-JcKTowx4yRWJPpObGGWIr65lQ";
const redirectTo = 'https://keolotso.github.io/Jukebox/auth-redirect.html';

const STORAGE_BUCKET_NAME = 'jukebox';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authSection = document.getElementById('auth-section');
const userSection = document.getElementById('user-section');
const userEmailSpan = document.getElementById('user-email');

const selectedSection = document.getElementById("selected-jukebox-section");
selectedSection.classList.remove("hidden");

const nameEl = document.getElementById("selected-jukebox-name");
nameEl.textContent = jukebox.displayName || jukebox.name;

let tokenBtn = document.getElementById("copy-jukebox-token-btn");
if (!tokenBtn) {
  tokenBtn = document.createElement("button");
  tokenBtn.id = "copy-jukebox-token-btn";
  tokenBtn.textContent = "Copy JukeBoxToken";
  tokenBtn.className = "btn-outline";
  nameEl.insertAdjacentElement("afterend", tokenBtn);
}

tokenBtn.onclick = async () => {
  const token = btoa(jukebox.id);
  try {
    await navigator.clipboard.writeText(token);
    showToast("JukeboxToken copied!", "success");
  } catch (err) {
    showToast("Failed to copy token", "error");
  }
};


let selectedJukebox = null;

async function selectJukebox(jukebox) {
  selectedJukebox = jukebox;
  document.getElementById("selected-jukebox-section").classList.remove("hidden");
  document.getElementById("selected-jukebox-name").textContent = jukebox.displayName || jukebox.name;
  await loadFiles(jukebox.id);
}

document.getElementById("upload-btn").addEventListener("click", async () => {
  const files = document.getElementById("file-upload").files;
  if (!files.length) return showToast("Select files first", "error");
  if (!selectedJukebox) return showToast("Select a vault first", "error");

  for (const file of files) {
    const filePath = `${selectedJukebox.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      showToast(`Upload failed: ${file.name}`, "error");
      continue;
    }

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(filePath);

    const { data: userData } = await supabase.auth.getUser();

    await supabase.from("audio_files").insert({
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      jukebox_id: selectedJukebox.id,
      user_id: userData.user.id
    });
  }

  showToast("Upload complete", "success");
  await loadFiles(selectedJukebox.id);
});

loginBtn.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passwordInput.value
  });

  if (error) return showToast(error.message, 'error');
  showToast('Logged in!', 'success');
  loadUser();
});

signupBtn.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signUp({
    email: emailInput.value,
    password: passwordInput.value,
    options: {
      emailRedirectTo: redirectTo
    }
  });

  if (error) return showToast(error.message, 'error');
  showToast('Signup successful. Check your email!', 'success');
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  authSection.classList.remove('hidden');
  userSection.classList.add('hidden');
  showToast('Logged out', 'info');
});

function renderJukeboxes(jukeboxes) {
  const list = document.getElementById("jukebox-list");
  list.innerHTML = "";

  jukeboxes.forEach((jukebox) => {
    const btn = document.createElement("button");
    btn.className = "btn-outline";
    btn.innerHTML = `<i class="fas fa-folder-open"></i> ${jukebox.name}`;
    btn.addEventListener("click", () => {
      selectJukebox(jukebox);
    });
    list.appendChild(btn);
  });
}

document.getElementById('create-jukebox-btn').addEventListener('click', async () => {
  const jukeboxName = prompt("Enter a name for your new Vault:");
  if (!jukeboxName) return;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return showToast("User not found", "error");

  const sanitizedJukeboxName = jukeboxName.trim().replace(/\s+/g, '_');
  const folderName = `${user.email}_${sanitizedJukeboxName}`;

  const placeholderPath = `${folderName}/.keep`;
  const placeholderFile = new Blob([''], { type: 'text/plain' });

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .upload(placeholderPath, placeholderFile, { upsert: true });

  if (uploadError) return showToast(`Failed to create folder: ${uploadError.message}`, 'error');

  showToast('Vault created!', 'success');

  await loadVaultsFromStorage();
});

async function loadVaultsFromStorage() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return;

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (error) {
    showToast('Failed to load vaults', 'error');
    return;
  }

  const list = document.getElementById("jukebox-list");
  list.innerHTML = "";

  const userPrefix = `${user.email}_`;

  const userVaults = data.filter(folder => folder.name.startsWith(userPrefix));

  if (userVaults.length === 0) {
    list.innerHTML = '<p>No vaults yet. Create one!</p>';
    return;
  }

  userVaults.forEach(folder => {
    const rawName = folder.name;
    const displayName = rawName.replace(userPrefix, '');

    const vault = {
      name: rawName,
      id: rawName,
      displayName: displayName
    };

    const btn = document.createElement("button");
    btn.className = "btn-outline";
    btn.innerHTML = `<i class="fas fa-folder-open"></i> ${vault.displayName}`;
    btn.addEventListener("click", () => selectJukebox(vault));
    list.appendChild(btn);
  });
}

async function loadUser() {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    authSection.classList.add('hidden');
    userSection.classList.remove('hidden');
    userEmailSpan.textContent = user.email;
    await loadVaultsFromStorage();
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  toastMessage.textContent = message;

  if (type === 'success') {
    toastIcon.className = 'fas fa-check-circle';
  } else if (type === 'error') {
    toastIcon.className = 'fas fa-exclamation-triangle';
  } else {
    toastIcon.className = 'fas fa-info-circle';
  }

  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

document.getElementById('toast-close').addEventListener('click', () => {
  document.getElementById('toast').classList.add('hidden');
});

supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    loadUser();
  }
});
async function loadFiles(jukeboxId) {
  const { data: files, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .list(jukeboxId, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });

  const list = document.getElementById("jukebox-files");
  list.innerHTML = "";

  if (error) return showToast(error.message, "error");

  const filteredFiles = files.filter(file => file.name !== '.keep');

  if (filteredFiles.length === 0) {
    list.innerHTML = "<p>No files uploaded yet.</p>";
    return;
  }

  filteredFiles.forEach(file => {
    const filePath = `${jukeboxId}/${file.name}`;
    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(filePath);

    const li = document.createElement("li");
    li.innerHTML = `
      <audio controls src="${publicUrlData.publicUrl}"></audio>
      <button class="btn-danger" onclick="deleteFile('${jukeboxId}', '${file.name.replace(/'/g, "\\'")}')">
        <i class="fas fa-trash"></i>
      </button>
      <span style="margin-left: 10px;">${file.name}</span>
    `;
    list.appendChild(li);
  });
}
window.deleteFile = async function(jukeboxId, fileName) {
  const filePath = `${jukeboxId}/${fileName}`;
  console.log("Attempting to delete:", filePath);

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .remove([filePath]);

  console.log("Delete response:", { data, error });

  if (error) {
    showToast(`Delete failed: ${error.message}`, "error");
    return;
  }

  if (data.length === 0) {
    showToast(`No files deleted. Check if the file path is correct.`, "error");
    return;
  }

  showToast("File deleted successfully!", "success");

  if (selectedJukebox) {
    await loadFiles(selectedJukebox.id);
  }
};
