import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://objfdwsmqpzafnjxanij.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q7oN05HWL-idjP-Eadzeuw_KHnFCvgg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let books = [];
let category = "Todas";
let pending = "";
let session = null;
let isAdmin = false;

const $ = s => document.querySelector(s);
const favs = () => JSON.parse(localStorage.getItem("folio-favs") || "[]");
const saveFavs = x => localStorage.setItem("folio-favs", JSON.stringify(x));

function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function symbolFor(category){
  return {Educación:"✳",Tecnología:"◈",Ciencias:"◎",Literatura:"❋"}[category] || "✦";
}

function card(b){
  const f = favs().includes(b.id);
  const coverStyle = b.cover_url ? `style="background-image:linear-gradient(rgba(20,25,20,.25),rgba(20,25,20,.25)),url('${escapeHtml(b.cover_url)}');color:white"` : "";
  return `<article class="card">
    <div class="cover" ${coverStyle}>
      <span class="eyebrow">Folio</span>
      <span class="mark">${symbolFor(b.category)}</span>
      <b>${escapeHtml(b.title)}</b>
    </div>
    <div class="body">
      <div class="meta"><span class="tag">${escapeHtml(b.format)}</span><span class="tag">${escapeHtml(b.category)}</span></div>
      <h3>${escapeHtml(b.title)}</h3>
      <div class="author">${escapeHtml(b.author)}</div>
      ${b.description ? `<div class="desc">${escapeHtml(b.description)}</div>` : ""}
      <div class="actions">
        <button class="btn primary download" data-file="${escapeHtml(b.file_url || "")}">Descargar</button>
        <button class="btn secondary heart ${f?"active":""}" data-fav="${b.id}">${f?"♥":"♡"}</button>
      </div>
    </div>
  </article>`;
}

function filtered(){
  const q = $("#search").value.trim().toLowerCase();
  let x = books.filter(b =>
    (category === "Todas" || b.category === category) &&
    (`${b.title} ${b.author}`.toLowerCase().includes(q))
  );
  if($("#sort").value === "az") x.sort((a,b)=>a.title.localeCompare(b.title,"es"));
  else x.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return x;
}

function bindCards(root){
  root.querySelectorAll(".download").forEach(btn => btn.onclick = () => {
    pending = btn.dataset.file;
    $("#supportDialog").showModal();
  });
  root.querySelectorAll("[data-fav]").forEach(btn => btn.onclick = () => {
    const id = btn.dataset.fav;
    const a = favs();
    saveFavs(a.includes(id) ? a.filter(x=>x!==id) : [...a,id]);
    render();
  });
}

function render(){
  const x = filtered();
  $("#bookGrid").innerHTML = x.map(card).join("");
  $("#count").textContent = `${x.length} ${x.length===1?"lectura":"lecturas"}`;
  $("#empty").style.display = x.length ? "none" : "block";

  const y = books.filter(b => favs().includes(b.id));
  $("#favoritesGrid").innerHTML = y.map(card).join("");
  $("#favoritesEmpty").style.display = y.length ? "none" : "block";

  bindCards($("#bookGrid"));
  bindCards($("#favoritesGrid"));
  renderAdminList();
}

async function loadBooks(){
  const {data,error} = await supabase.from("books").select("*").order("created_at",{ascending:false});
  if(error){
    $("#count").textContent = "No se pudo cargar la biblioteca";
    console.error(error);
    return;
  }
  books = data || [];
  render();
}

async function checkAdmin(){
  if(!session?.user){
    isAdmin = false;
    updateAdminUI();
    return;
  }
  const {data,error} = await supabase.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  isAdmin = !error && !!data;
  updateAdminUI();
}

function updateAdminUI(){
  const logged = !!session?.user;
  $("#admin").classList.toggle("hidden", !logged);
  $("#adminNav").classList.toggle("hidden", !logged);
  $("#claimBox").classList.toggle("hidden", !logged || isAdmin);
  $("#uploadForm").classList.toggle("hidden", !logged || !isAdmin);
  $("#adminBooks").classList.toggle("hidden", !logged || !isAdmin);
  $("#authBtn").textContent = logged ? "✓" : "WO";
}

async function renderAdminList(){
  if(!isAdmin) return;
  $("#adminBookList").innerHTML = books.length ? books.map(b => `
    <div class="adminrow">
      <div><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.author)} · ${escapeHtml(b.format)}</small></div>
      <button class="btn danger deleteBook" data-id="${b.id}" data-path="${escapeHtml(b.file_path || "")}" data-url="${escapeHtml(b.file_url || "")}">Eliminar</button>
    </div>`).join("") : "<p>No hay libros todavía.</p>";

  document.querySelectorAll(".deleteBook").forEach(btn => btn.onclick = async () => {
    if(!confirm("¿Eliminar este libro de Folio?")) return;
    const id = btn.dataset.id;
    const path = btn.dataset.path;
    const url = btn.dataset.url;
    if(url.startsWith(SUPABASE_URL) && path){
      await supabase.storage.from("books").remove([path]);
    }
    const {error} = await supabase.from("books").delete().eq("id",id);
    if(error) return alert(error.message);
    await loadBooks();
  });
}

$("#search").addEventListener("input",render);
$("#sort").addEventListener("change",render);

document.querySelectorAll(".chip").forEach(c => c.onclick = () => {
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
  c.classList.add("active");
  category = c.dataset.category;
  render();
  $("#biblioteca").scrollIntoView({behavior:"smooth"});
});

$("#closeDialog").onclick = () => $("#supportDialog").close();
$("#continueDownload").onclick = () => {
  if(pending){
    const a=document.createElement("a");
    a.href=pending;
    a.target="_blank";
    a.rel="noopener";
    a.click();
  }
  $("#supportDialog").close();
};

$("#authBtn").onclick = () => {
  if(session?.user) document.querySelector("#admin").scrollIntoView({behavior:"smooth"});
  else $("#authDialog").showModal();
};
$("#closeAuth").onclick = () => $("#authDialog").close();

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#authStatus").textContent = "Ingresando...";
  const email=$("#email").value.trim();
  const password=$("#password").value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) return $("#authStatus").textContent=error.message;
  $("#authStatus").textContent="";
  $("#authDialog").close();
});

$("#signupBtn").onclick = async () => {
  const email=$("#email").value.trim();
  const password=$("#password").value;
  if(!email || password.length<6) return $("#authStatus").textContent="Escribe un correo y una contraseña de mínimo 6 caracteres.";
  $("#authStatus").textContent="Creando cuenta...";
  const {data,error}=await supabase.auth.signUp({email,password});
  if(error) return $("#authStatus").textContent=error.message;
  $("#authStatus").textContent = data.session ? "Cuenta creada." : "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.";
};

$("#logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
};

$("#claimBtn").onclick = async () => {
  const code=$("#claimCode").value.trim();
  if(!code) return $("#claimStatus").textContent="Escribe el código de activación.";
  $("#claimStatus").textContent="Activando...";
  const {error}=await supabase.rpc("claim_admin",{p_code:code});
  if(error) return $("#claimStatus").textContent=error.message;
  $("#claimCode").value="";
  $("#claimStatus").textContent="Administrador activado.";
  await checkAdmin();
};

$("#uploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  if(!isAdmin) return;
  const file=$("#file").files[0];
  if(!file) return;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  const formats={pdf:"PDF",epub:"EPUB",txt:"TXT"};
  if(!formats[ext]) return $("#uploadStatus").textContent="Solo se permiten PDF, EPUB o TXT.";

  $("#uploadStatus").textContent="Subiendo archivo...";
  const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${crypto.randomUUID()}-${clean}`;

  const {error:uploadError}=await supabase.storage.from("books").upload(path,file,{upsert:false});
  if(uploadError) return $("#uploadStatus").textContent=uploadError.message;

  const {data:publicData}=supabase.storage.from("books").getPublicUrl(path);
  const row={
    title:$("#title").value.trim(),
    author:$("#author").value.trim(),
    category:$("#category").value,
    format:formats[ext],
    description:$("#description").value.trim()||null,
    file_path:path,
    file_url:publicData.publicUrl
  };
  const {error:insertError}=await supabase.from("books").insert(row);
  if(insertError){
    await supabase.storage.from("books").remove([path]);
    return $("#uploadStatus").textContent=insertError.message;
  }

  $("#uploadForm").reset();
  $("#uploadStatus").textContent="Libro publicado correctamente.";
  await loadBooks();
});

const {data:{session:initialSession}}=await supabase.auth.getSession();
session=initialSession;
await checkAdmin();
await loadBooks();

supabase.auth.onAuthStateChange(async (_event,newSession)=>{
  session=newSession;
  await checkAdmin();
});
